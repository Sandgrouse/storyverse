/** Client file prep for POST /api/read. Browser canvas work lives here. */

export const MAX_SEND_BYTES = 4 * 1024 * 1024;

export type SendableFile = {
  name: string;
  type: string;
  dataUrl?: string;
  text?: string;
};

/** Accept PDF, `.md`, `.txt`, and images. */
export function isAcceptedFile(name: string, type: string): boolean {
  if (type.startsWith("image/")) return true;
  const lower = name.toLowerCase();
  if (
    lower.endsWith(".pdf") ||
    lower.endsWith(".md") ||
    lower.endsWith(".markdown") ||
    lower.endsWith(".txt")
  ) {
    return true;
  }
  if (type === "application/pdf") return true;
  if (type.startsWith("text/")) return true;
  return false;
}

export function isImageFile(name: string, type: string): boolean {
  if (type.startsWith("image/")) return true;
  const lower = name.toLowerCase();
  return (
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".gif")
  );
}

/** Rough send size: names plus payloads. */
export function sendSizeBytes(files: SendableFile[]): number {
  let total = 0;
  for (const file of files) {
    total += file.name.length;
    total += file.type.length;
    if (typeof file.text === "string") total += file.text.length;
    if (typeof file.dataUrl === "string") total += file.dataUrl.length;
  }
  return total;
}

/** Name the largest file so the UI can say which one is too large. */
export function largestFileName(files: SendableFile[]): string | null {
  if (files.length === 0) return null;
  let best = files[0];
  let bestSize =
    (best.text?.length ?? 0) + (best.dataUrl?.length ?? 0) + best.name.length;
  for (const file of files.slice(1)) {
    const size =
      (file.text?.length ?? 0) + (file.dataUrl?.length ?? 0) + file.name.length;
    if (size > bestSize) {
      best = file;
      bestSize = size;
    }
  }
  return best.name;
}

export function overLimit(files: SendableFile[]): boolean {
  return sendSizeBytes(files) > MAX_SEND_BYTES;
}

/**
 * Downscale an image data URL in a canvas to at most 1024px on the long
 * side, as WebP. Keeps the original elsewhere; only the copy is sent.
 */
export function downscaleImageDataUrl(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const longSide = Math.max(img.width, img.height);
        const scale = longSide > 1024 ? 1024 / longSide : 1;
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas is not available."));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/webp", 0.85));
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Could not resize that image."));
      }
    };
    img.onerror = () => reject(new Error("Could not read that image."));
    img.src = dataUrl;
  });
}

export function readFileAsText(file: File): Promise<string> {
  return file.text();
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error(`Could not read ${file.name}.`));
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}
