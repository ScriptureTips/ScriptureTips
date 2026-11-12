/** A PNG's width and height in pixels, read from its header. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || signature.some((b, i) => bytes[i] !== b)) {
    throw new Error("not a PNG file");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * The help's screenshots are taken at twice the screen's resolution (shots/support.ts), and
 * shown at half their pixel size, so they stay sharp on dense screens.
 */
export const SHOT_SCALE = 2;
