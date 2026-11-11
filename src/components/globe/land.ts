// Real coastlines for the globe: world-atlas land-110m (TopoJSON) drawn into
// an equirectangular mask. White is land, the darker bands off the coast give
// the shader its soft shelf gradient. Both the data and topojson-client load
// dynamically so none of this is in an initial bundle.

const WIDTH = 2048;
const HEIGHT = 1024;

let cached: Promise<HTMLCanvasElement> | null = null;

type Ring = number[][];
type LandGeometry =
  | { type: "Polygon"; coordinates: Ring[] }
  | { type: "MultiPolygon"; coordinates: Ring[][] };

async function build(): Promise<HTMLCanvasElement> {
  const [{ feature }, atlas] = await Promise.all([
    import("topojson-client"),
    import("world-atlas/land-110m.json"),
  ]);
  const topology = (atlas as { default?: unknown }).default ?? atlas;
  // The land object is a GeometryCollection, or a single MultiPolygon in older builds.
  const collection = feature(
    topology as Parameters<typeof feature>[0],
    (topology as { objects: { land: Parameters<typeof feature>[1] } }).objects.land,
  ) as unknown as
    | { type: "FeatureCollection"; features: { geometry: LandGeometry }[] }
    | { type: "Feature"; geometry: LandGeometry };

  const geometries: LandGeometry[] =
    collection.type === "FeatureCollection"
      ? collection.features.map((f) => f.geometry)
      : [collection.geometry];
  const polygons: Ring[][] = [];
  for (const g of geometries) {
    if (g.type === "Polygon") polygons.push(g.coordinates);
    else for (const poly of g.coordinates) polygons.push(poly);
  }

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("2d canvas unavailable");
  g.fillStyle = "#000";
  g.fillRect(0, 0, WIDTH, HEIGHT);
  g.lineJoin = "round";

  const trace = (poly: Ring[]) => {
    g.beginPath();
    for (const ring of poly) {
      ring.forEach(([lng, lat], i) => {
        const x = ((lng + 180) / 360) * WIDTH;
        const y = ((90 - lat) / 180) * HEIGHT;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      });
      g.closePath();
    }
  };

  // Coastal shelf: wide faint strokes first, narrower and brighter after.
  for (const [width, grey] of [
    [30, 51],
    [22, 102],
    [14, 153],
    [7, 204],
  ] as const) {
    g.strokeStyle = `rgb(${grey},${grey},${grey})`;
    g.lineWidth = width;
    for (const poly of polygons) {
      trace(poly);
      g.stroke();
    }
  }
  g.fillStyle = "#fff";
  for (const poly of polygons) {
    trace(poly);
    g.fill("evenodd");
  }
  return canvas;
}

// One shared mask per page load (the globe and the flight both use it).
export function loadLandMask(): Promise<HTMLCanvasElement> {
  if (!cached) {
    cached = build().catch((err) => {
      cached = null;
      throw err;
    });
  }
  return cached;
}
