const MAX_BYTES = 1024 * 1024; // 1MB cap requested for camera uploads
const MAX_DIMENSION = 1600; // long-edge cap in px before quality search starts
const MIN_QUALITY = 0.3;

function loadImageSource(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    return createImageBitmap(file);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
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
