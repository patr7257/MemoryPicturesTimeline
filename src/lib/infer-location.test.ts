import { describe, expect, it } from "vitest";

import { inferLocations } from "./infer-location.mjs";

const at = (iso: string) => new Date(iso + "Z");
type P = Parameters<typeof inferLocations>[0][number];
const ph = (id: string, takenAt: Date | null, loc: [number, number, string] | null = null, extra: Partial<P> = {}): P => ({
  id,
  tripId: "lis",
  takenAt,
  lat: loc ? loc[0] : null,
  lng: loc ? loc[1] : null,
  city: loc ? loc[2] : null,
  country: loc ? "Portugal" : null,
  ...extra,
});

const BELEM: [number, number, string] = [38.6916, -9.216, "Belém"];
const BAIXA: [number, number, string] = [38.7139, -9.1394, "Lisbon"];

describe("inferLocations", () => {
  it("copies the spot of the photo closest in time on the same day", () => {
    const out = inferLocations([
      ph("a", at("2025-11-22T09:00:00"), BAIXA),
      ph("x", at("2025-11-22T15:10:00")),
      ph("b", at("2025-11-22T16:00:00"), BELEM),
    ]);
    expect(out).toEqual([
      { id: "x", fromId: "b", lat: 38.6916, lng: -9.216, city: "Belém", country: "Portugal", minutesApart: 50 },
    ]);
  });

  it("fills across any gap within the day", () => {
    const out = inferLocations([ph("a", at("2025-11-22T00:05:00"), BAIXA), ph("x", at("2025-11-22T23:55:00"))]);
    expect(out.map((o) => [o.id, o.fromId, o.minutesApart])).toEqual([["x", "a", 1430]]);
  });

  it("never crosses midnight, using the wall clock (UTC parts)", () => {
    const out = inferLocations([ph("a", at("2025-11-22T23:50:00"), BAIXA), ph("x", at("2025-11-23T00:10:00"))]);
    expect(out).toEqual([]);
  });

  it("never borrows from another vacation", () => {
    const out = inferLocations([
      ph("a", at("2025-11-22T10:00:00"), BAIXA, { tripId: "other" }),
      ph("x", at("2025-11-22T10:01:00")),
    ]);
    expect(out).toEqual([]);
  });

  it("never copies an inferred location, so guesses do not chain", () => {
    const out = inferLocations([
      ph("g", at("2025-11-22T10:00:00"), BAIXA, { locationInferred: true }),
      ph("x", at("2025-11-22T10:01:00")),
    ]);
    expect(out).toEqual([]);
  });

  it("skips undated photos and photos that already have a location", () => {
    const out = inferLocations([ph("a", at("2025-11-22T10:00:00"), BAIXA), ph("u", null), ph("b", at("2025-11-22T11:00:00"), BELEM)]);
    expect(out).toEqual([]);
  });

  it("treats a half-set location as missing", () => {
    const out = inferLocations([ph("a", at("2025-11-22T10:00:00"), BAIXA), ph("x", at("2025-11-22T10:30:00"), null, { lat: 1 })]);
    expect(out.map((o) => o.id)).toEqual(["x"]);
  });

  it("breaks a tie towards the earlier photo", () => {
    const out = inferLocations([
      ph("late", at("2025-11-22T12:00:00"), BELEM),
      ph("x", at("2025-11-22T11:00:00")),
      ph("early", at("2025-11-22T10:00:00"), BAIXA),
    ]);
    expect(out[0].fromId).toBe("early");
  });

  it("returns nothing for no photos", () => {
    expect(inferLocations([])).toEqual([]);
  });
});
