// Rings stitched across the antimeridian, made planar. world-atlas joins
// shapes that cross 180 degrees (Russia, Fiji) by stepping straight from
// +180 to -180 and back, and Antarctica's ring circles the south pole. Both
// the map (which treats coordinates as flat) and the point-in-polygon lookup
// read such a step as a line across the whole world. Pure: no map library,
// so the server lookup and tests use the same rings as the map.

// The largest longitude step between neighbouring points of a ring.
export function maxLngStep(ring: readonly number[][]): number {
  let max = 0;
  for (let i = 1; i < ring.length; i++) {
    const step = Math.abs(ring[i][0] - ring[i - 1][0]);
    if (step > max) max = step;
  }
  return max;
}

const isJump = (a: number[], b: number[]) => Math.abs(b[0] - a[0]) > 180;

function jumpCount(ring: readonly number[][]): number {
  let n = 0;
  for (let i = 1; i < ring.length; i++) if (isJump(ring[i - 1], ring[i])) n++;
  return n;
}

// Longitude steps of at most this many degrees along a pole, so the edge
// closing a polar ring never reads as a jump itself.
const POLE_STEP = 90;

// A ring that crosses the antimeridian an odd number of times goes around a
// pole. Start it just after a crossing, let the longitudes run on without
// jumping, and close it along the pole on the side of its mean latitude.
function closeAroundPole(ring: number[][]): number[][] {
  const open = ring.slice(0, -1);
  let start = 0;
  for (let i = 0; i < open.length; i++) {
    if (isJump(open[(i - 1 + open.length) % open.length], open[i])) {
      start = i;
      break;
    }
  }
  const rotated = [...open.slice(start), ...open.slice(0, start)];
  const out: number[][] = [];
  let offset = 0;
  for (let i = 0; i < rotated.length; i++) {
    if (i > 0) {
      const step = rotated[i][0] - rotated[i - 1][0];
      if (step > 180) offset -= 360;
      else if (step < -180) offset += 360;
    }
    out.push([rotated[i][0] + offset, ...rotated[i].slice(1)]);
  }
  const meanLat = out.reduce((s, p) => s + p[1], 0) / out.length;
  const poleLat = meanLat < 0 ? -90 : 90;
  const first = out[0];
  const last = out[out.length - 1];
  out.push([last[0], poleLat]);
  const dir = Math.sign(first[0] - last[0]);
  for (let lng = last[0] + dir * POLE_STEP; dir * (first[0] - lng) > 0; lng += dir * POLE_STEP) {
    out.push([lng, poleLat]);
  }
  out.push([first[0], poleLat]);
  out.push([...first]);
  return out;
}

// A ring that crosses twice or any even number of times: its negative
// longitudes move east by 360, so the part past the line runs on past 180.
const shiftEast = (ring: number[][]): number[][] =>
  ring.map((p) => (p[0] < 0 ? [p[0] + 360, ...p.slice(1)] : [...p]));

// A copy of the ring that no longer jumps across the antimeridian.
export function unwrapRing(ring: number[][]): number[][] {
  const jumps = jumpCount(ring);
  if (jumps === 0) return ring.map((p) => [...p]);
  if (jumps % 2 === 1) return closeAroundPole(ring);
  return shiftEast(ring);
}

// Twice the signed area of a ring in plain degrees (shoelace).
function planarArea2(ring: readonly number[][]): number {
  let sum = 0;
  for (let i = 1; i < ring.length; i++) sum += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
  return sum;
}

// A copy of the polygon with every ring unwrapped. When the outer ring was
// moved east, its holes move with it.
//
// Rings around a pole need more. On the sphere world-atlas cuts Antarctica
// open at the pole: its outer ring is a tiny circle at -89.999 and the coast
// is a hole. Read flat, that is a sliver at the pole minus the continent, so
// the map paints almost nothing and no point is inside. The polar ring with
// the largest flat area once closed along the pole (the coast) becomes the
// outer ring, and the other polar rings (the cut) are dropped; holes that do
// not circle the pole stay holes.
export function unwrapPolygon(polygon: number[][][]): number[][][] {
  if (polygon.length === 0) return [];
  const polar = polygon.filter((ring) => jumpCount(ring) % 2 === 1);
  if (polar.length > 0) {
    const closed = polar.map(closeAroundPole);
    const outer = closed.reduce((a, b) => (Math.abs(planarArea2(b)) > Math.abs(planarArea2(a)) ? b : a));
    const holes = polygon.filter((ring) => jumpCount(ring) % 2 === 0).map(unwrapRing);
    return [outer, ...holes];
  }
  const [outer, ...holes] = polygon;
  const movedEast = jumpCount(outer) > 0;
  return [
    unwrapRing(outer),
    ...holes.map((hole) => (movedEast && jumpCount(hole) === 0 ? shiftEast(hole) : unwrapRing(hole))),
  ];
}
