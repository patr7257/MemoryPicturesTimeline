/*
 * Generates the installable-app icons from the favicon master src/app/icon.svg
 * (issue: home-screen PWA install). Outputs:
 *   public/icons/icon-192.png, icon-512.png   (manifest, purpose "any")
 *   public/icons/icon-maskable-512.png        (manifest, purpose "maskable":
 *     mark shrunk to 70% on a full-bleed cream canvas so OS masks keep it whole)
 *   public/icons/badge-96.png                 (notification badge, monochrome, drawn inline below)
 *   src/app/apple-icon.png                    (Next file convention, 180x180,
 *     opaque: iOS renders transparent corners black otherwise)
 * The svg tile background matches BG, so full-bleed corners blend seamlessly.
 * Run: node scripts/gen-app-icons.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "src", "app", "icon.svg");
const OUT = path.join(root, "public", "icons");
const BG = "#f5efe3";
const DENSITY = 512;

const svg = await fs.readFile(SRC);
await fs.mkdir(OUT, { recursive: true });

async function plain(size, dest) {
  await sharp(svg, { density: DENSITY }).resize(size, size).png().toFile(dest);
}

async function maskable(size, markRatio, dest) {
  const mark = Math.round(size * markRatio);
  const markPng = await sharp(svg, { density: DENSITY })
    .resize(mark, mark)
    .png()
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: markPng, gravity: "center" }])
    .removeAlpha()
    .png()
    .toFile(dest);
}

async function apple(size, dest) {
  await sharp(svg, { density: DENSITY })
    .resize(size, size)
    .flatten({ background: BG })
    .removeAlpha()
    .png()
    .toFile(dest);
}

// Android status-bar badge for notifications: monochrome (only alpha is used),
// white camera silhouette with the lens cut out, transparent background.
const BADGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <defs><mask id="m"><rect width="96" height="96" fill="#fff"/>
    <circle cx="48" cy="56" r="15" fill="#000"/></mask></defs>
  <g mask="url(#m)" fill="#fff">
    <rect x="10" y="32" width="76" height="46" rx="9"/>
    <rect x="30" y="20" width="36" height="16" rx="4"/>
  </g>
  <circle cx="48" cy="56" r="8" fill="#fff"/>
</svg>`;
await sharp(Buffer.from(BADGE_SVG), { density: DENSITY })
  .resize(96, 96)
  .png()
  .toFile(path.join(OUT, "badge-96.png"));

await plain(192, path.join(OUT, "icon-192.png"));
await plain(512, path.join(OUT, "icon-512.png"));
await maskable(512, 0.7, path.join(OUT, "icon-maskable-512.png"));
await apple(180, path.join(root, "src", "app", "apple-icon.png"));

console.log("wrote public/icons/* and src/app/apple-icon.png");
