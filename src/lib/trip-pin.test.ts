import { describe, expect, it } from "vitest";

import { effectiveCover, hasLocation, tripPin } from "./trip-pin";

const lisbon = { id: "lis", lat: 38.72, lng: -9.14 };
const toronto = { id: "tor", lat: 43.65, lng: -79.38 };
const noGps = { id: "x", lat: null, lng: null };
// Stored pin from the first GPS photo at upload: the stray one.
const stored = { lat: 43.65, lng: -79.38 };

describe("tripPin", () => {
  it("uses the chosen cover photo's location, not the stored pin", () => {
    expect(tripPin({ coverPhotoId: "lis", ...stored }, [toronto, lisbon])).toEqual({
      lat: 38.72,
      lng: -9.14,
    });
  });

  it("uses the first photo when no cover is chosen", () => {
    expect(tripPin({ coverPhotoId: null, ...stored }, [lisbon, toronto])).toEqual({
      lat: 38.72,
      lng: -9.14,
    });
  });

  it("treats a cover id that matches no photo as no cover", () => {
    expect(tripPin({ coverPhotoId: "gone", ...stored }, [lisbon])).toEqual({ lat: 38.72, lng: -9.14 });
  });

  it("keeps the stored pin when the cover has no location", () => {
    expect(tripPin({ coverPhotoId: "x", ...stored }, [noGps, lisbon])).toEqual(stored);
  });

  it("keeps the stored pin, or none, when there are no photos", () => {
    expect(tripPin({ coverPhotoId: null, ...stored }, [])).toEqual(stored);
    expect(tripPin({ coverPhotoId: null, lat: null, lng: null }, [])).toEqual({ lat: null, lng: null });
  });

  it("treats 0,0 as a real location", () => {
    const nullIsland = { id: "z", lat: 0, lng: 0 };
    expect(tripPin({ coverPhotoId: "z", ...stored }, [nullIsland])).toEqual({ lat: 0, lng: 0 });
  });
});

describe("effectiveCover and hasLocation", () => {
  it("picks the chosen photo, else the first, else null", () => {
    expect(effectiveCover("tor", [lisbon, toronto])?.id).toBe("tor");
    expect(effectiveCover(null, [lisbon, toronto])?.id).toBe("lis");
    expect(effectiveCover(null, [])).toBeNull();
  });
  it("needs both coordinates", () => {
    expect(hasLocation(lisbon)).toBe(true);
    expect(hasLocation({ lat: 1, lng: null })).toBe(false);
  });
});
