const MAX_PHOTO_BYTES = 1024 * 1024;
const MAX_PHOTO_EDGE_PX = 1600;
const INITIAL_JPEG_QUALITY = 0.9;
const MIN_JPEG_QUALITY = 0.3;
const JPEG_QUALITY_STEP = 0.1;
const RESIZE_ATTEMPTS = 2;
const DOWNSCALE_FACTOR_PER_ATTEMPT = 0.7;

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const GIF_SIGNATURE = [0x47, 0x49, 0x46, 0x38];
const BMP_SIGNATURE = [0x42, 0x4d];
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46];
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50];
const WEBP_SIGNATURE_OFFSET = 8;

function hasSignature(data: Uint8Array, signature: number[], offset = 0): boolean {
  return data.length >= offset + signature.length && signature.every((byte, i) => data[offset + i] === byte);
}

export function sniffImageMimeType(data: Uint8Array): string {
  if (hasSignature(data, JPEG_SIGNATURE)) return "image/jpeg";
  if (hasSignature(data, PNG_SIGNATURE)) return "image/png";
  if (hasSignature(data, GIF_SIGNATURE)) return "image/gif";
  if (hasSignature(data, BMP_SIGNATURE)) return "image/bmp";
  if (hasSignature(data, RIFF_SIGNATURE) && hasSignature(data, WEBP_SIGNATURE, WEBP_SIGNATURE_OFFSET)) return "image/webp";
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
    return null;
  }
}

function isByteMap(data: object): boolean {
  const values = Object.values(data);
  return values.length > 0 && values.every((value) => typeof value === "number");
}

export function toImageBytes(data: unknown): Uint8Array | null {
  if (!data) return null;
  if (typeof data === "string") return base64ToBytes(data);
  if (data instanceof ArrayBuffer) return data.byteLength > 0 ? new Uint8Array(data) : null;
  if (ArrayBuffer.isView(data)) {
    return data.byteLength > 0 ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null;
  }
  if (Array.isArray(data)) return data.length > 0 ? Uint8Array.from(data as number[]) : null;
  if (typeof data === "object" && isByteMap(data)) return Uint8Array.from(Object.values(data) as number[]);
  return null;
}

export function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

async function loadImageSource(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    return createImageBitmap(file);
  }
  const url = await blobToDataUrl(file);
  if (!url) throw new Error("Could not read image for compression");
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = url;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Image encoding failed"))), "image/jpeg", quality);
  });
}

async function encodeJpegWithinSizeLimit(canvas: HTMLCanvasElement): Promise<Blob> {
  let quality = INITIAL_JPEG_QUALITY;
  let blob = await canvasToJpeg(canvas, quality);
  while (blob.size > MAX_PHOTO_BYTES && quality > MIN_JPEG_QUALITY) {
    quality -= JPEG_QUALITY_STEP;
    blob = await canvasToJpeg(canvas, quality);
  }
  return blob;
}

function withJpegExtension(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, "");
  return `${base || "photo"}.jpg`;
}

export async function compressImageToUnder1MB(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= MAX_PHOTO_BYTES) return file;

  const source = await loadImageSource(file);
  const sourceWidth = "width" in source ? source.width : (source as HTMLImageElement).naturalWidth;
  const sourceHeight = "height" in source ? source.height : (source as HTMLImageElement).naturalHeight;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  let scale = Math.min(1, MAX_PHOTO_EDGE_PX / Math.max(sourceWidth, sourceHeight));
  let blob: Blob | null = null;

  for (let attempt = 0; attempt < RESIZE_ATTEMPTS; attempt++) {
    canvas.width = Math.round(sourceWidth * scale);
    canvas.height = Math.round(sourceHeight * scale);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

    blob = await encodeJpegWithinSizeLimit(canvas);
    if (blob.size <= MAX_PHOTO_BYTES) break;
    scale *= DOWNSCALE_FACTOR_PER_ATTEMPT;
  }

  if ("close" in source) source.close();
  if (!blob) return file;

  return new File([blob], withJpegExtension(file.name), { type: "image/jpeg" });
}
