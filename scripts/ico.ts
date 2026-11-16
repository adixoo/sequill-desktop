/**
 * Packs PNG images into one .ico file. Each entry stores its PNG as is, which
 * every browser and Windows since Vista read; sizes go up to 256px.
 * Format: https://learn.microsoft.com/en-us/previous-versions/ms997538(v=msdn.10)
 */
export interface IcoImage {
  /** Width and height in pixels (icons are square), 1 to 256. */
  size: number;
  png: Uint8Array;
}

const HEADER_SIZE = 6;
const ENTRY_SIZE = 16;

export function encodeIco(images: IcoImage[]): Uint8Array {
  if (images.length === 0) throw new Error("An .ico needs at least one image.");
  const dataStart = HEADER_SIZE + ENTRY_SIZE * images.length;
  const total = dataStart + images.reduce((sum, image) => sum + image.png.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);

  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, images.length, true);

  let offset = dataStart;
  images.forEach(({ size, png }, i) => {
    if (!Number.isInteger(size) || size < 1 || size > 256) {
      throw new Error(`Icon size ${size} is outside 1–256.`);
    }
    const entry = HEADER_SIZE + i * ENTRY_SIZE;
    view.setUint8(entry, size % 256); // width, 0 means 256
    view.setUint8(entry + 1, size % 256); // height
    view.setUint8(entry + 2, 0); // palette colours: none
    view.setUint8(entry + 3, 0); // reserved
    view.setUint16(entry + 4, 1, true); // colour planes
    view.setUint16(entry + 6, 32, true); // bits per pixel
    view.setUint32(entry + 8, png.length, true);
    view.setUint32(entry + 12, offset, true);
    out.set(png, offset);
    offset += png.length;
  });
  return out;
}
