// The "Share map" image: the map plus a first name and three count lines,
// built in the browser on a plain 2D canvas. Nothing here touches the map
// library; the caller hands in a canvas that already holds the map. Only
// visited countries and counts go into the image: a wishlist is private.
import { countrySearchKey, type CountryStats } from "./countries";
import type { MapFills } from "./country-map-style";

export const SHARE_WIDTH = 1200;
export const SHARE_HEIGHT = 1500;

// Layout, in image pixels.
const MARGIN = 72;
const MAP_TOP = MARGIN;
const MAP_HEIGHT = 900;
const TITLE_Y = 1090;
const TITLE_SIZE = 96;
const TITLE_MIN_SIZE = 56;
// Top of the block of count lines; line i sits at LINES_TOP + (i + 1) * LINE_STEP.
const LINES_TOP = 1110;
const LINE_STEP = 72;
const LINE_SIZE = 52;
const LINE_MIN_SIZE = 36;
// Text never runs past the margins on either side.
const TEXT_MAX_WIDTH = SHARE_WIDTH - 2 * MARGIN;
const FONT_STEP = 4;
const ELLIPSIS = "...";
const BRAND = "Memories";
const BRAND_SIZE = 30;
// Samples per side of the grid that checks the map area is not blank.
const SAMPLE_GRID = 6;

// Theme colours, read once per image, with plain fallbacks.
const PAPER = { name: "--background", fallback: "rgb(245,240,228)" };
const INK = { name: "--foreground", fallback: "rgb(74,58,44)" };
const MUTED = { name: "--muted-foreground", fallback: "rgb(120,104,88)" };
const HEADING_FALLBACK = "cursive";
const BODY_FALLBACK = "sans-serif";

const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? "";

// The largest size, from startPx down in FONT_STEP steps, at which the text
// is at most maxWidth wide; minPx when even that is too wide. measure gives
// the text width at a font size, so this needs no canvas.
export function fitFontSize(
  measure: (px: number) => number,
  maxWidth: number,
  startPx: number,
  minPx: number,
): number {
  for (let px = startPx; px > minPx; px -= FONT_STEP) {
    if (measure(px) <= maxWidth) return px;
  }
  return minPx;
}

// The text, cut from the end and closed with three plain dots, so that it is
// at most maxWidth wide. measure gives the width of a string.
export function truncateToFit(measure: (text: string) => number, text: string, maxWidth: number): string {
  if (measure(text) <= maxWidth) return text;
  for (let n = text.length - 1; n > 0; n--) {
    const cut = text.slice(0, n).trimEnd() + ELLIPSIS;
    if (measure(cut) <= maxWidth) return cut;
  }
  return ELLIPSIS;
}

// Whose map the image shows. "family" is the union of every person; "group"
// is a union of some of them, which must never be titled as the family.
export type ShareSubject =
  | { kind: "person"; name: string }
  | { kind: "family" }
  | { kind: "group" };

function title(subject: ShareSubject): string {
  if (subject.kind === "family") return "Our family has been to";
  if (subject.kind === "group") return "We have been to";
  // First name only: the first word of the name.
  const first = firstName(subject.name);
  return first ? `${first} has been to` : "Has been to";
}

// Text for the image.
export function shareLines(subject: ShareSubject, stats: CountryStats): { title: string; lines: string[] } {
  return {
    title: title(subject),
    lines: [
      stats.total === 1 ? "1 country or territory" : `${stats.total} countries and territories`,
      `${stats.unMembers} of ${stats.unTotal} UN countries`,
      `${stats.percent}% of the world`,
    ],
  };
}

export function shareFileName(subject: ShareSubject): string {
  if (subject.kind !== "person") return `countries-${subject.kind}.png`;
  const safe = countrySearchKey(firstName(subject.name)).replace(/[^a-z0-9]/g, "");
  return `countries-${safe || "map"}.png`;
}

// The fills the image is drawn with: visited only. A wishlist on screen (an
// editor sees it) and any person or compare colouring never reach the image.
export function shareFills(fills: MapFills): MapFills {
  const out: MapFills = {};
  for (const [key, fill] of Object.entries(fills)) if (fill === "visited") out[key] = "visited";
  return out;
}

// True when every sampled pixel is the paper colour, i.e. nothing of the map
// was drawn (a cleared WebGL buffer reads as transparent).
export function looksBlank(samples: readonly (readonly number[])[], paper: readonly number[]): boolean {
  return samples.every((px) => px[0] === paper[0] && px[1] === paper[1] && px[2] === paper[2]);
}

function color(g: CanvasRenderingContext2D, css: CSSStyleDeclaration, c: { name: string; fallback: string }) {
  g.fillStyle = c.fallback;
  const value = css.getPropertyValue(c.name).trim();
  // An unparseable value leaves the fallback in place.
  if (value) g.fillStyle = value;
  return g.fillStyle;
}

function fontOf(className: string | null, fallback: string): string {
  const el = document.createElement("span");
  if (className) el.className = className;
  el.hidden = true;
  document.body.appendChild(el);
  const family = getComputedStyle(el).fontFamily;
  el.remove();
  return family ? `${family}, ${fallback}` : fallback;
}

export async function composeShareImage(map: HTMLCanvasElement, subject: ShareSubject, stats: CountryStats): Promise<Blob> {
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_WIDTH;
  canvas.height = SHARE_HEIGHT;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  if (!g) throw new Error("No 2D canvas");
  const css = getComputedStyle(document.documentElement);
  const paper = color(g, css, PAPER);
  const ink = color(g, css, INK);
  const muted = color(g, css, MUTED);
  const heading = fontOf("font-hand", HEADING_FALLBACK);
  const body = fontOf(null, BODY_FALLBACK);

  g.fillStyle = paper;
  g.fillRect(0, 0, SHARE_WIDTH, SHARE_HEIGHT);

  // The map, contained (never stretched) and centred in the top area.
  const areaW = SHARE_WIDTH - 2 * MARGIN;
  const scale = Math.min(areaW / Math.max(map.width, 1), MAP_HEIGHT / Math.max(map.height, 1));
  const w = Math.round(map.width * scale);
  const h = Math.round(map.height * scale);
  const x = Math.round(MARGIN + (areaW - w) / 2);
  const y = Math.round(MAP_TOP + (MAP_HEIGHT - h) / 2);
  g.drawImage(map, x, y, w, h);

  const paperPx = [...g.getImageData(1, 1, 1, 1).data];
  const samples: number[][] = [];
  for (let i = 0; i < SAMPLE_GRID; i++) {
    for (let j = 0; j < SAMPLE_GRID; j++) {
      const sx = Math.floor(x + ((i + 0.5) * w) / SAMPLE_GRID);
      const sy = Math.floor(y + ((j + 0.5) * h) / SAMPLE_GRID);
      samples.push([...g.getImageData(sx, sy, 1, 1).data]);
    }
  }
  if (w === 0 || h === 0 || looksBlank(samples, paperPx)) throw new Error("The map capture is blank");

  const { title, lines } = shareLines(subject, stats);
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.fillStyle = ink;
  // Shrinks to fit between the margins, then cuts with dots at the minimum.
  const drawFitted = (text: string, y: number, font: (px: number) => string, startPx: number, minPx: number) => {
    const px = fitFontSize(
      (size) => {
        g.font = font(size);
        return g.measureText(text).width;
      },
      TEXT_MAX_WIDTH,
      startPx,
      minPx,
    );
    g.font = font(px);
    g.fillText(truncateToFit((t) => g.measureText(t).width, text, TEXT_MAX_WIDTH), SHARE_WIDTH / 2, y);
  };
  drawFitted(title, TITLE_Y, (px) => `${px}px ${heading}`, TITLE_SIZE, TITLE_MIN_SIZE);
  lines.forEach((line, i) =>
    drawFitted(line, LINES_TOP + (i + 1) * LINE_STEP, (px) => `600 ${px}px ${body}`, LINE_SIZE, LINE_MIN_SIZE),
  );

  g.fillStyle = muted;
  g.textAlign = "right";
  g.font = `${BRAND_SIZE}px ${body}`;
  g.fillText(BRAND, SHARE_WIDTH - MARGIN / 2, SHARE_HEIGHT - MARGIN / 2);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No PNG"))), "image/png"),
  );
}
