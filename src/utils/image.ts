const MAX_BYTES = 1024 * 1024; // 1MB cap requested for camera uploads
const MAX_DIMENSION = 1600; // long-edge cap in px before quality search starts
const MIN_QUALITY = 0.3;

/** Dataverse image columns don't report their stored MIME type — it has to be sniffed
 *  from magic bytes (same technique the Power Apps SDK itself uses internally). Assuming
 *  a fixed type like "image/jpeg" breaks decoding whenever Dataverse hands back PNG/GIF/BMP. */
export function sniffImageMimeType(data: Uint8Array): string {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (
    data.length >= 8 &&
    data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47 &&
    data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a
  ) return "image/png";
  if (data.length >= 4 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x38) return "image/gif";
  if (data.length >= 2 && data[0] === 0x42 && data[1] === 0x4d) return "image/bmp";
  // "RIFF" .... "WEBP" — phone galleries hand these over untouched when they're already
  // small enough to skip our JPEG re-encode.
  if (
    data.length >= 12 &&
    data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 &&
    data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50
  ) return "image/webp";
  return "image/png";
}

function base64ToBytes(value: string): Uint8Array | null {
  const base64 = value.startsWith("data:") ? value.slice(value.indexOf(",") + 1) : value;
  if (!base64) return null;
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.byteLength > 0 ? bytes : null;
  } catch {
    // Not valid base64 — nothing usable to render.
    return null;
  }
}

/** `downloadImage()` is *typed* as returning a Uint8Array, but it doesn't always.
 *  Dataverse answers the image `/$value` endpoint with `Content-Type: image/jpeg`, and on
 *  that content type the SDK's transport converts the body to a **base64 string** (the
 *  Uint8Array path only runs for `application/octet-stream`). Wrapping that string straight
 *  into a Blob stores the base64 *text* as the image bytes — the download "succeeds" and
 *  then no browser can decode it, so the avatar silently falls back to initials.
 *  Normalizes every shape the host bridge can hand back into real bytes. */
export function toImageBytes(data: unknown): Uint8Array | null {
  if (!data) return null;
  if (typeof data === "string") return base64ToBytes(data);
  if (data instanceof ArrayBuffer) return data.byteLength > 0 ? new Uint8Array(data) : null;
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return view.byteLength > 0 ? new Uint8Array(view.buffer, view.byteOffset, view.byteLength) : null;
  }
  // A structured-clone or JSON round-trip through the host bridge flattens a typed array
  // into a number[] or a plain `{0: 255, 1: 216, …}` object.
  if (Array.isArray(data)) return data.length > 0 ? Uint8Array.from(data as number[]) : null;
  if (typeof data === "object") {
    const values = Object.values(data as Record<string, unknown>);
    if (values.length > 0 && values.every((v) => typeof v === "number")) {
      return Uint8Array.from(values as number[]);
    }
  }
  return null;
}

/** Converts a Blob/File to a `data:` URL.
 *
 *  Every image the app displays has to go through here, because the Power Apps web
 *  player serves a Content Security Policy of `img-src 'self' data:` — note the absence
 *  of `blob:`. A `blob:` URL from `URL.createObjectURL()` is refused by the browser
 *  ("Loading the image 'blob:…' violates the following Content Security Policy
 *  directive") however valid the bytes behind it are, and the failure looks exactly like
 *  a decode failure. `data:` is on the allowlist.
 *
 *  Reserve this for thumbnail-sized images: base64 inflates the payload by ~33% and the
 *  result lives in memory as a string. */
export function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

async function loadImageSource(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // Takes the Blob directly, so no URL and no CSP involvement.
  if ("createImageBitmap" in window) {
    return createImageBitmap(file);
  }
  // Legacy fallback. Has to be a data URL for the same CSP reason as above — `img-src`
  // covers programmatic `new Image()` loads, not just <img> tags in the document.
  const url = await blobToDataUrl(file);
  if (!url) throw new Error("Could not read image for compression");
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Image encoding failed"))), "image/jpeg", quality);
  });
}

function withJpegExtension(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, "");
  return `${base || "photo"}.jpg`;
}

/** Resizes/re-encodes an image so it's under 1MB — camera photos from modern
 *  phones routinely land at 3-8MB, well over what's needed for a player avatar. */
export async function compressImageToUnder1MB(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= MAX_BYTES) return file;

  const source = await loadImageSource(file);
  const naturalWidth = "width" in source ? source.width : (source as HTMLImageElement).naturalWidth;
  const naturalHeight = "height" in source ? source.height : (source as HTMLImageElement).naturalHeight;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  let scale = Math.min(1, MAX_DIMENSION / Math.max(naturalWidth, naturalHeight));
  let blob: Blob | null = null;

  // Two passes: shrink dimensions once if quality search alone can't hit the target.
  for (let pass = 0; pass < 2; pass++) {
    canvas.width = Math.round(naturalWidth * scale);
    canvas.height = Math.round(naturalHeight * scale);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

    let quality = 0.9;
    blob = await canvasToBlob(canvas, quality);
    while (blob.size > MAX_BYTES && quality > MIN_QUALITY) {
      quality -= 0.1;
      blob = await canvasToBlob(canvas, quality);
    }

    if (blob.size <= MAX_BYTES) break;
    scale *= 0.7;
  }

  if ("close" in source) source.close();
  if (!blob) return file;

  return new File([blob], withJpegExtension(file.name), { type: "image/jpeg" });
}
