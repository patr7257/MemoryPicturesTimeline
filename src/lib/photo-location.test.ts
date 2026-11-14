import { describe, expect, it } from "vitest";

import { PICKER_FALLBACK, nearestLocated, pickerStart, validateLatLng } from "./photo-location";

const at = (iso: string) => new Date(iso + "Z");
const ph = (id: string, takenAt: Date | null, lat: number | null = null, lng: number | null = null) => ({
  id,
  takenAt,
  lat,
  lng,
});

describe("validateLatLng", () => {
  it("accepts real coordinates, the edges included", () => {
    expect(validateLatLng(38.7, -9.1)).toEqual({ ok: true, value: { lat: 38.7, lng: -9.1 } });
    expect(validateLatLng(-90, 180).ok).toBe(true);
    expect(validateLatLng(0, 0).ok).toBe(true);
  });
  it("refuses out of range, non-numbers and NaN", () => {
    expect(validateLatLng(91, 0).ok).toBe(false);
    expect(validateLatLng(0, -181).ok).toBe(false);
    expect(validateLatLng("38", -9).ok).toBe(false);
    expect(validateLatLng(Number.NaN, 1).ok).toBe(false);
    expect(validateLatLng(1, Infinity).ok).toBe(false);
  });
});

describe("nearestLocated", () => {
  const photos = [
    ph("a", at("2025-11-22T09:00:00"), 38.71, -9.14),
    ph("b", at("2025-11-22T12:00:00")),
    ph("c", at("2025-11-22T13:30:00"), 38.69, -9.21),
    ph("d", null, 38.8, -9.39),
    ph("e", null),
  ];

  it("picks the located photo closest in time", () => {
    expect(nearestLocated(photos, "b")?.id).toBe("c");
  });
  it("never picks the photo itself or one without a location", () => {
    expect(nearestLocated(photos, "a")?.id).toBe("c");
  });
  it("prefers dated photos over undated ones for a dated photo", () => {
    expect(nearestLocated([ph("x", at("2025-01-01T00:00:00")), ph("u", null, 1, 1), ph("v", at("2030-01-01T00:00:00"), 2, 2)], "x")?.id).toBe("v");
  });
  it("uses list order when the photo has no date", () => {
    expect(nearestLocated(photos, "e")?.id).toBe("d");
  });
  it("breaks ties towards the earlier photo", () => {
    const tie = [ph("p", at("2025-01-01T10:00:00"), 1, 1), ph("x", at("2025-01-01T11:00:00")), ph("q", at("2025-01-01T12:00:00"), 2, 2)];
    expect(nearestLocated(tie, "x")?.id).toBe("p");
  });
  it("is null when no other photo has a location, or the id is unknown", () => {
    expect(nearestLocated([ph("x", null), ph("y", null)], "x")).toBeNull();
    expect(nearestLocated(photos, "zzz")).toBeNull();
  });
});

describe("pickerStart", () => {
  const near = { lat: 38.7, lng: -9.1 };
  const pin = { lat: 38.72, lng: -9.14 };
  it("opens on the photo's own spot first", () => {
    expect(pickerStart({ lat: 1, lng: 2 }, near, pin)).toEqual({ lat: 1, lng: 2, zoom: 15 });
  });
  it("then the nearby photo, then the vacation pin, then Denmark", () => {
    expect(pickerStart({ lat: null, lng: null }, near, pin)).toEqual({ ...near, zoom: 14 });
    expect(pickerStart({ lat: null, lng: null }, null, pin)).toEqual({ ...pin, zoom: 11 });
    expect(pickerStart({ lat: null, lng: null }, null, { lat: null, lng: null })).toEqual(PICKER_FALLBACK);
    expect(pickerStart({ lat: null, lng: null }, null, null)).toEqual(PICKER_FALLBACK);
  });
});
