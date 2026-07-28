// Deterministic "randomness" for the scrapbook look. Everything derives from
// stable IDs, never Math.random(): the server and client must render the
// exact same rotation or React reports hydration mismatches.

export function hashCode(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// Rotation in whole degrees within [-range, +range].
export function rotationFor(id: string, range = 4): number {
  return (hashCode(id) % (2 * range + 1)) - range;
}

// Small translate offset in px within [-range, +range], for scattered piles.
export function offsetFor(id: string, axis: "x" | "y", range = 8): number {
  return (hashCode(axis + id) % (2 * range + 1)) - range;
}
