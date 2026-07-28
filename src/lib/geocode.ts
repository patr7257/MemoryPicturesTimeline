// Reverse geocoding to city level via BigDataCloud's free, key-less client
// endpoint. Failures are non-fatal by design: the photo row keeps nullable
// city/country and can be backfilled later.

export type GeocodeResult = { city: string | null; country: string | null };

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<GeocodeResult> {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { city: null, country: null };
    const data = (await res.json()) as {
      city?: string;
      locality?: string;
      countryName?: string;
    };
    return {
      city: data.city || data.locality || null,
      country: data.countryName || null,
    };
  } catch {
    return { city: null, country: null };
  }
}
