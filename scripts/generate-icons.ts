/**
 * Renders the Sequill logo (src/utils/logo.ts) into the icons the app ships:
 * public/logo.svg and public/favicon.ico for the page, and public/icons/icon-512.png,
 * the source for the desktop app's icons (`bun tauri icon public/icons/icon-512.png -o src-tauri/icons`).
 * Run: bun run icons
 */
import { join } from "node:path";
import sharp from "sharp";
import { logoSvg } from "../src/utils/logo";
import { encodeIco } from "./ico";

const root = join(import.meta.dir, "..");
const FAVICON_SIZES = [16, 32, 48];

/** The logo drawn for `size` pixels (small sizes use the simpler mark), as a PNG. */
const render = (svg: string, size: number) =>
  sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png().toBuffer();

async function writeIco(sizes: number[], file: string) {
  const images = await Promise.all(
    sizes.map(async (size) => ({ size, png: await render(logoSvg({ size }), size) })),
  );
  await Bun.write(join(root, file), encodeIco(images));
  console.log(`${file} (${sizes.join(", ")}px)`);
}

await Bun.write(join(root, "public", "logo.svg"), logoSvg());
console.log("public/logo.svg");

await Bun.write(join(root, "public", "icons", "icon-512.png"), await render(logoSvg(), 512));
console.log("public/icons/icon-512.png");

await writeIco(FAVICON_SIZES, "public/favicon.ico");
