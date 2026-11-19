import "server-only";
import { resolveKey, toCountryShapes, type CountryShape } from "./point-in-country";

let cached: Promise<CountryShape[]> | null = null;

async function build(): Promise<CountryShape[]> {
  const [{ feature }, atlas] = await Promise.all([
    import("topojson-client"),
    import("world-atlas/countries-50m.json"),
  ]);
  const topology = ((atlas as { default?: unknown }).default ?? atlas) as {
    objects: { countries: Parameters<typeof feature>[1] };
  };
  const collection = feature(
    topology as unknown as Parameters<typeof feature>[0],
    topology.objects.countries,
  ) as unknown as { features: Parameters<typeof toCountryShapes>[0][number][] };
  return toCountryShapes(collection.features);
}

// Loaded once per process; a failed load is retried on the next call.
function loadShapes(): Promise<CountryShape[]> {
  if (!cached) {
    cached = build().catch((err) => {
      cached = null;
      throw err;
    });
  }
  return cached;
}

export async function countryKeyAt(lat: number, lng: number): Promise<string | null> {
  return resolveKey(await loadShapes(), lat, lng);
}
