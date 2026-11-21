import { describe, expect, it } from "vitest";

import {
  distinctPoints,
  planVisitedRows,
  rowKey,
  syncVacationCore,
  type LatLng,
  type VisitedInsert,
  type VisitedStore,
} from "./auto-visited";

type Vac = { startDate: string; personIds: string[]; points: LatLng[] };

function fakeStore(vacations: Record<string, Vac>, existing: string[] = []) {
  const inserted: VisitedInsert[] = [];
  const existingCalls: string[][] = [];
  const store: VisitedStore = {
    async vacation(tripId) {
      return vacations[tripId] ?? null;
    },
    async existingKeys(personIds) {
      existingCalls.push([...personIds]);
      return new Set(existing);
    },
    async insertVisited(rows) {
      inserted.push(...rows);
      return rows.length;
    },
  };
  return { store, inserted, existingCalls };
}

// Denmark near Copenhagen, Sweden near Stockholm.
const locate = (lat: number) => (lat > 58 ? "752" : lat > 50 ? "208" : null);

describe("distinctPoints", () => {
  it("rounds and keeps first-seen order", () => {
    expect(
      distinctPoints([
        { lat: 55.6761, lng: 12.5683 },
        { lat: 55.6751, lng: 12.5701 },
        { lat: 59.91, lng: 10.75 },
      ]),
    ).toEqual([
      { lat: 55.68, lng: 12.57 },
      { lat: 59.91, lng: 10.75 },
    ]);
  });
});

describe("planVisitedRows", () => {
  it("one row per person and country, earliest year, skips existing", () => {
    expect(
      planVisitedRows(
        [
          { tripId: "t2", startDate: "2021-07-01", personIds: ["p1"], countryKeys: ["208"] },
          { tripId: "t1", startDate: "2019-05-01", personIds: ["p1", "p2"], countryKeys: ["208", "578"] },
        ],
        new Set([rowKey("p2", "578")]),
      ),
    ).toEqual([
      { personId: "p1", countryKey: "208", year: 2019 },
      { personId: "p1", countryKey: "578", year: 2019 },
      { personId: "p2", countryKey: "208", year: 2019 },
    ]);
  });
});

describe("syncVacationCore", () => {
  const base: Vac = {
    startDate: "2019-05-01",
    personIds: ["p1"],
    points: [
      { lat: 55.67, lng: 12.56 },
      { lat: 59.33, lng: 18.06 },
    ],
  };

  it("never re-adds a dismissed country", async () => {
    const { store, inserted } = fakeStore({ t1: base }, [rowKey("p1", "752")]);
    const rows = await syncVacationCore(store, "t1", locate);
    expect(rows).toEqual([{ personId: "p1", countryKey: "208", year: 2019 }]);
    expect(inserted).toEqual(rows);
  });

  it("never touches an existing visited row", async () => {
    const { store, inserted } = fakeStore({ t1: base }, [rowKey("p1", "208"), rowKey("p1", "752")]);
    expect(await syncVacationCore(store, "t1", locate)).toEqual([]);
    expect(inserted).toEqual([]);
  });

  it("returns nothing for a missing vacation", async () => {
    const { store } = fakeStore({});
    expect(await syncVacationCore(store, "missing", locate)).toEqual([]);
  });

  it("reads nothing about countries when nobody is tagged", async () => {
    const { store, existingCalls, inserted } = fakeStore({ t1: { ...base, personIds: [] } });
    expect(await syncVacationCore(store, "t1", locate)).toEqual([]);
    expect(existingCalls).toEqual([]);
    expect(inserted).toEqual([]);
  });

  it("a vacation with no photos but its own place still yields its country", async () => {
    const { store, inserted } = fakeStore({
      t1: { startDate: "2020-02-10", personIds: ["p1", "p2"], points: [{ lat: 59.33, lng: 18.06 }] },
    });
    const rows = await syncVacationCore(store, "t1", locate);
    expect(rows).toEqual([
      { personId: "p1", countryKey: "752", year: 2020 },
      { personId: "p2", countryKey: "752", year: 2020 },
    ]);
    expect(inserted).toEqual(rows);
  });

  it("skips points outside every country and inserts nothing for no points", async () => {
    const { store, inserted } = fakeStore({
      t1: { ...base, points: [{ lat: 0, lng: 0 }] },
    });
    expect(await syncVacationCore(store, "t1", locate)).toEqual([]);
    expect(inserted).toEqual([]);
  });

  it("uses the earliest year for the trip's own start date", async () => {
    const { store } = fakeStore({ t1: { ...base, startDate: "2018-12-31" } });
    const rows = await syncVacationCore(store, "t1", locate);
    expect(rows.every((r) => r.year === 2018)).toBe(true);
  });
});
