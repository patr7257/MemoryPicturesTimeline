/*
 * Generates the installable-app icons from the favicon master src/app/icon.svg
 * (issue: home-screen PWA install). Outputs:
 *   public/icons/icon-192.png, icon-512.png   (manifest, purpose "any")
 *   public/icons/icon-maskable-512.png        (manifest, purpose "maskable":
 *     mark shrunk to 70% on a full-bleed cream canvas so OS masks keep it whole)
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

await plain(192, path.join(OUT, "icon-192.png"));
await plain(512, path.join(OUT, "icon-512.png"));
await maskable(512, 0.7, path.join(OUT, "icon-maskable-512.png"));
await apple(180, path.join(root, "src", "app", "apple-icon.png"));

console.log("wrote public/icons/* and src/app/apple-icon.png");
