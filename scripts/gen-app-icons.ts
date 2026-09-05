/**
 * Generates every icon variant from logo.png.
 *
 * Usage: npm run gen:icons:app
 *
 * Two things the source forces on us:
 *
 *  - It is 80x80, so anything above that is an upscale. Lanczos keeps the
 *    stacked-pancake silhouette readable, but 512px apple-touch is genuinely
 *    soft. Replace logo.png with a 1024px master and rerun to fix that; every
 *    output below is derived, so nothing else needs to change.
 *
 *  - The artwork is light (mean luminance 168/255) on transparency, so it
 *    disappears against a white tab strip. Maskable and apple-touch icons
 *    therefore get an opaque plate behind them rather than shipping
 *    transparent.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const SOURCE = "logo.png";
const OUT = "app/public";

/** Brand plate. Matches --card in the dark theme so the icon reads as ours. */
const PLATE = { r: 0x0f, g: 0x10, b: 0x11, alpha: 1 };

fs.mkdirSync(OUT, { recursive: true });

/**
 * The source already carries ~10% of its own padding, so we trim to the real
 * artwork first. Otherwise our padding stacks on top of its padding and the
 * pancakes end up as a small mark floating in a large box.
 */
const trimmed = await sharp(SOURCE).trim({ threshold: 8 }).toBuffer();
const trimmedMeta = await sharp(trimmed).metadata();
console.log(`trimmed artwork: ${trimmedMeta.width}x${trimmedMeta.height}`);

interface IconSpec {
  file: string;
  size: number;
  /** Fraction of the canvas left empty around the artwork. */
  padding: number;
  /** Opaque background, or null to keep transparency. */
  background: { r: number; g: number; b: number; alpha: number } | null;
  /** Corner rounding in px; null leaves it square. */
  radius: number | null;
}

const SPECS: IconSpec[] = [
  // Favicons stay transparent so they sit on whatever chrome the browser uses.
  // No padding: at 16px every pixel counts, and the trim already tightened it.
  { file: "favicon-16.png", size: 16, padding: 0, background: null, radius: null },
  { file: "favicon-32.png", size: 32, padding: 0, background: null, radius: null },
  { file: "favicon-48.png", size: 48, padding: 0, background: null, radius: null },
  { file: "favicon-64.png", size: 64, padding: 0.02, background: null, radius: null },

  // Apple clips to a squircle itself and composites on white if we ship
  // transparency, so this gets an opaque plate and Apple's ~10% safe margin.
  {
    file: "apple-touch-icon.png",
    size: 180,
    padding: 0.12,
    background: PLATE,
    radius: null,
  },

  // PWA icons. "any" keeps transparency; "maskable" needs the full 20% safe
  // zone because Android crops it to whatever shape the launcher wants.
  { file: "icon-192.png", size: 192, padding: 0.06, background: null, radius: null },
  { file: "icon-512.png", size: 512, padding: 0.06, background: null, radius: null },
  {
    file: "icon-maskable-192.png",
    size: 192,
    padding: 0.2,
    background: PLATE,
    radius: null,
  },
  {
    file: "icon-maskable-512.png",
    size: 512,
    padding: 0.2,
    background: PLATE,
    radius: null,
  },

  // Open Graph needs an opaque, rounded tile -- social cards render on
  // arbitrary backgrounds and never respect transparency.
  { file: "og-icon.png", size: 256, padding: 0.14, background: PLATE, radius: 56 },
];

/** Rounds the corners of an opaque tile by masking with an SVG rectangle. */
async function roundCorners(input: Buffer, size: number, radius: number) {
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
  );
  return sharp(input)
    .composite([{ input: mask, blend: "dest-in" }])
    .png({ compressionLevel: 9, palette: true, colours: 128, effort: 10 })
    .toBuffer();
}

for (const spec of SPECS) {
  const inner = Math.round(spec.size * (1 - spec.padding * 2));

  let buffer = await sharp(trimmed)
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      // Lanczos: we are upscaling past the source's 80px, and it preserves
      // the pancake edges far better than the default bilinear.
      kernel: sharp.kernel.lanczos3,
    })
    .extend({
      top: Math.floor((spec.size - inner) / 2),
      bottom: Math.ceil((spec.size - inner) / 2),
      left: Math.floor((spec.size - inner) / 2),
      right: Math.ceil((spec.size - inner) / 2),
      background: spec.background ?? { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .flatten(spec.background ? { background: spec.background } : false)
    // Palette quantisation. The artwork is flat-shaded, so 128 colours is
    // visually lossless here and cuts the 512px files by roughly 4x --
    // upscaling otherwise invents gradient noise that PNG cannot compress.
    .png({ compressionLevel: 9, palette: true, colours: 128, effort: 10 })
    .toBuffer();

  if (spec.radius !== null) {
    buffer = await roundCorners(buffer, spec.size, spec.radius);
  }

  fs.writeFileSync(path.join(OUT, spec.file), buffer);
  console.log(`  ${spec.file.padEnd(26)} ${spec.size}x${spec.size}  ${buffer.length}b`);
}

/**
 * Multi-resolution .ico for legacy Windows and bookmark bars. Browsers pick
 * the closest size, so bundling three avoids a blurry downscale of one.
 */
const ico = await pngToIco([
  path.join(OUT, "favicon-16.png"),
  path.join(OUT, "favicon-32.png"),
  path.join(OUT, "favicon-48.png"),
]);
fs.writeFileSync(path.join(OUT, "favicon.ico"), ico);
console.log(`  ${"favicon.ico".padEnd(26)} 16/32/48    ${ico.length}b`);

/**
 * An SVG favicon wrapping the 64px raster.
 *
 * Not a true vector -- the source is a PNG, so this cannot be one. It exists
 * because browsers that support SVG favicons prefer them and will scale this
 * to any tab density from a single file. Embedding the 512px version would
 * make it ~490KB for a 16px tab mark, so it wraps the 64px instead.
 */
const embedded = fs.readFileSync(path.join(OUT, "favicon-64.png")).toString("base64");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <image href="data:image/png;base64,${embedded}" width="64" height="64" image-rendering="auto"/>
</svg>
`;
fs.writeFileSync(path.join(OUT, "favicon.svg"), svg);
console.log(`  ${"favicon.svg".padEnd(26)} wraps 64px  ${svg.length}b`);

console.log("\nDone.");
