import { describe, expect, it } from "vitest";

import { searchTrips } from "./trip-search";

const trips = [
  { id: "1", title: "Summer in Østrig", startDate: "2012-07-01", locationName: "Tyrol" },
  { id: "2", title: "Ferie på Ærø", startDate: "2011-06-10", locationName: "Ærøskøbing" },
  { id: "3", title: "Weekend", startDate: "2009-05-02", locationName: "Århus" },
  { id: "4", title: "Ski trip", startDate: "2009-02-14", locationName: null },
  { id: "5", title: "Café stop", startDate: "2008-08-08" },
];

const ids = (list: { id: string }[]) => list.map((t) => t.id);

describe("searchTrips", () => {
  it("returns everything in the given order for an empty query", () => {
    expect(ids(searchTrips(trips, ""))).toEqual(["1", "2", "3", "4", "5"]);
    expect(ids(searchTrips(trips, "   "))).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(searchTrips(trips, "zzz")).toEqual([]);
  });

  it("ignores case", () => {
    expect(ids(searchTrips(trips, "SKI"))).toEqual(["4"]);
  });

  it("ignores accents", () => {
    expect(ids(searchTrips(trips, "cafe"))).toEqual(["5"]);
    expect(ids(searchTrips(trips, "café"))).toEqual(["5"]);
  });

  it("matches the plain forms of the Danish letters", () => {
    expect(ids(searchTrips(trips, "ostrig"))).toEqual(["1"]);
    expect(ids(searchTrips(trips, "Østrig"))).toEqual(["1"]);
    expect(ids(searchTrips(trips, "oestrig"))).toEqual(["1"]);
    expect(ids(searchTrips(trips, "aero"))).toEqual(["2"]);
    expect(ids(searchTrips(trips, "arhus"))).toEqual(["3"]);
    expect(ids(searchTrips(trips, "aarhus"))).toEqual(["3"]);
  });

  it("matches the place", () => {
    expect(ids(searchTrips(trips, "tyrol"))).toEqual(["1"]);
  });

  it("matches the year", () => {
    expect(ids(searchTrips(trips, "2009"))).toEqual(["3", "4"]);
  });

  it("needs every word to match, in any order and across fields", () => {
    expect(ids(searchTrips(trips, "weekend 2009"))).toEqual(["3"]);
    expect(ids(searchTrips(trips, "2009 weekend"))).toEqual(["3"]);
    expect(ids(searchTrips(trips, "weekend 2012"))).toEqual([]);
  });

  it("keeps the input order", () => {
    expect(ids(searchTrips(trips, "20"))).toEqual(["1", "2", "3", "4", "5"]);
  });
});
