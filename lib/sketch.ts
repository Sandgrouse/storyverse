/**
 * Greyscale helpers for storyboard sketches. The pixel math is pure so
 * tests can import it; the canvas round-trip runs in the browser.
 */

/**
 * Return a copy of an RGBA pixel buffer with every pixel grey: R, G
 * and B all hold the luminance, alpha untouched. The input is never
 * changed.
 */
export function toGreyscalePixels(
  pixels: Uint8ClampedArray,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels);
  for (let i = 0; i + 3 < out.length; i += 4) {
    const grey = Math.round(
      0.2126 * (out[i] ?? 0) + 0.7152 * (out[i + 1] ?? 0) + 0.0722 * (out[i + 2] ?? 0),
    );
    out[i] = grey;
    out[i + 1] = grey;
    out[i + 2] = grey;
  }
  return out;
}

/**
 * Greyscale an image data URL in the browser: draw it to a canvas,
 * flatten every pixel to its luminance, and return a WebP data URL.
 * Rejects when the image cannot load or canvas is unavailable, so the
 * caller can fall back to the original.
 */
export function greyscaleSketchDataUrl(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, img.width);
        canvas.height = Math.max(1, img.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas is not available."));
          return;
        }
        ctx.drawImage(img, 0, 0);
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        frame.data.set(toGreyscalePixels(frame.data));
        ctx.putImageData(frame, 0, 0);
        resolve(canvas.toDataURL("image/webp", 0.9));
      } catch (error) {
        reject(
          error instanceof Error
            ? error
            : new Error("Could not make this sketch black and white."),
        );
      }
    };
    img.onerror = () => reject(new Error("Could not read this sketch."));
    img.src = dataUrl;
  });
}
