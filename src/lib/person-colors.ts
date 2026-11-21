// Fixed palette for per-person colours on the countries map. `people.color`
// stores a palette key; null or an unknown key means "not assigned yet".
// Hex only: MapLibre cannot parse oklch. Order matters: it is the order free
// colours are handed out in, chosen so neighbours stay apart under colour
// vision deficiency (validated with the dataviz validator, see the test for
// the distances that are enforced).

export type Hex = `#${string}`;
export type PaletteEntry = { key: string; name: string; hex: Hex };

export const PALETTE: readonly PaletteEntry[] = [
  { key: "green", name: "Green", hex: "#1e8526" },
  { key: "lavender", name: "Lavender", hex: "#8f70b0" },
  { key: "coral", name: "Coral", hex: "#e88761" },
  { key: "orchid", name: "Orchid", hex: "#d57fdd" },
  { key: "ochre", name: "Ochre", hex: "#a5761d" },
  { key: "plum", name: "Plum", hex: "#962d76" },
  { key: "bronze", name: "Bronze", hex: "#786100" },
  { key: "blue", name: "Blue", hex: "#0076c1" },
  { key: "sky", name: "Sky", hex: "#61a4ff" },
  { key: "rust", name: "Rust", hex: "#a33200" },
  { key: "mint", name: "Mint", hex: "#00bd8b" },
  { key: "indigo", name: "Indigo", hex: "#5d48b1" },
  { key: "rose", name: "Rose", hex: "#cd4f66" },
  { key: "lime", name: "Lime", hex: "#a4af0a" },
];

// Countries visited by more than one shown person. Fixed, not editable.
export const SHARED_COLOR: Hex = "#2b2d4a";

// Drawn by the map at partial opacity over the hovered country.
export const HOVER_TINT: Hex = "#fffdf7";

export function isPaletteKey(x: unknown): x is string {
  return typeof x === "string" && PALETTE.some((p) => p.key === x);
}

export function firstFreeColorKey(taken: readonly (string | null)[]): string | null {
  const used = new Set(taken);
  return PALETTE.find((p) => !used.has(p.key))?.key ?? null;
}

const byId = <T extends { id: string }>(list: readonly T[]) =>
  [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

export function colorsForMissing(
  people: readonly { id: string; color: string | null }[],
): { personId: string; color: string }[] {
  const taken = new Set<string>(
    people.filter((p) => isPaletteKey(p.color)).map((p) => p.color as string),
  );
  const out: { personId: string; color: string }[] = [];
  for (const p of byId(people)) {
    if (isPaletteKey(p.color)) continue;
    const key = firstFreeColorKey([...taken]);
    if (key === null) break;
    taken.add(key);
    out.push({ personId: p.id, color: key });
  }
  return out;
}

export function resolvePersonColors(
  people: readonly { id: string; color: string | null }[],
): Record<string, Hex> {
  const hexOf = (key: string) => PALETTE.find((p) => p.key === key)!.hex;
  const taken = new Set(people.filter((p) => isPaletteKey(p.color)).map((p) => p.color as string));
  const free = PALETTE.filter((p) => !taken.has(p.key));
  const pool = free.length > 0 ? free : PALETTE;
  const out: Record<string, Hex> = {};
  let next = 0;
  for (const p of byId(people)) {
    if (isPaletteKey(p.color)) out[p.id] = hexOf(p.color);
    else out[p.id] = pool[next++ % pool.length].hex;
  }
  return out;
}
