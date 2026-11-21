import { describe, expect, it } from "vitest";

import { searchTrips, searchYears } from "./trip-search";

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

// The timeline search: the same folding, plus the note and the tagged people,
// over vacations grouped by year.
const years = [
  {
    year: 2023,
    trips: [
      {
        id: "a",
        title: "Sommer i Østrig",
        startDate: "2023-07-01",
        locationName: "Innsbruck",
        description: "Hiking with the cousins near the glacier",
        people: [{ name: "Mette" }, { name: "Søren" }],
      },
      {
        id: "b",
        title: "Weekend",
        startDate: "2023-03-10",
        locationName: "København",
        description: null,
        people: [{ name: "Patrick" }],
      },
    ],
  },
  {
    year: 2019,
    trips: [
      {
        id: "c",
        title: "Café tour",
        startDate: "2019-05-02",
        locationName: "Paris",
        description: "Croissants every morning",
        people: [],
      },
    ],
  },
];

const yearIds = (list: { year: number; trips: { id: string }[] }[]) =>
  list.map((y) => `${y.year}:${y.trips.map((t) => t.id).join(",")}`);

describe("searchYears", () => {
  it("keeps everything for an empty query", () => {
    expect(yearIds(searchYears(years, ""))).toEqual(["2023:a,b", "2019:c"]);
    expect(yearIds(searchYears(years, "  "))).toEqual(["2023:a,b", "2019:c"]);
  });

  it("matches the title", () => {
    expect(yearIds(searchYears(years, "weekend"))).toEqual(["2023:b"]);
  });

  it("matches the place", () => {
    expect(yearIds(searchYears(years, "paris"))).toEqual(["2019:c"]);
  });

  it("matches the note", () => {
    expect(yearIds(searchYears(years, "glacier"))).toEqual(["2023:a"]);
    expect(yearIds(searchYears(years, "croissants"))).toEqual(["2019:c"]);
  });

  it("matches a tagged person's name", () => {
    expect(yearIds(searchYears(years, "patrick"))).toEqual(["2023:b"]);
    expect(yearIds(searchYears(years, "soren"))).toEqual(["2023:a"]);
  });

  it("matches the year", () => {
    expect(yearIds(searchYears(years, "2019"))).toEqual(["2019:c"]);
  });

  it("needs every word, in any order and across fields", () => {
    expect(yearIds(searchYears(years, "mette glacier"))).toEqual(["2023:a"]);
    expect(yearIds(searchYears(years, "glacier mette"))).toEqual(["2023:a"]);
    expect(yearIds(searchYears(years, "mette paris"))).toEqual([]);
  });

  it("ignores case, accents and the Danish letters", () => {
    expect(yearIds(searchYears(years, "ostrig"))).toEqual(["2023:a"]);
    expect(yearIds(searchYears(years, "ØSTRIG"))).toEqual(["2023:a"]);
    expect(yearIds(searchYears(years, "kobenhavn"))).toEqual(["2023:b"]);
    expect(yearIds(searchYears(years, "CAFE"))).toEqual(["2019:c"]);
  });

  it("gives nothing when nothing matches", () => {
    expect(searchYears(years, "zzz")).toEqual([]);
  });

  it("drops a year whose vacations all fail to match", () => {
    expect(searchYears(years, "croissants").map((y) => y.year)).toEqual([2019]);
    expect(searchYears(years, "innsbruck").map((y) => y.year)).toEqual([2023]);
  });

  it("keeps the other fields of a year and a vacation", () => {
    const [only] = searchYears(years, "paris");
    expect(only).toEqual({ ...years[1] });
  });
});
