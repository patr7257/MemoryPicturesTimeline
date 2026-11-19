import { describe, expect, it } from "vitest";
import { pickSuggestions, samplePoints, visibleTaggedTripIds, type SuggestionPoint } from "./country-suggestions";

const p = (tripId: string, tripYear: number, countryName: string | null, lat = 1, lng = 1): SuggestionPoint =>
  ({ tripId, tripTitle: `Trip ${tripId}`, tripYear, countryName, lat, lng });

describe("samplePoints", () => {
  it("keeps at most three per trip and country name", () => {
    const pts = [p("t1", 2024, "Portugal"), p("t1", 2024, "Portugal"), p("t1", 2024, "Portugal"), p("t1", 2024, "Portugal"), p("t1", 2024, "Spain"), p("t2", 2020, "Portugal")];
    expect(samplePoints(pts)).toHaveLength(5);
  });
  it("treats a missing country name as its own group", () => {
    expect(samplePoints([p("t1", 2024, null), p("t1", 2024, null)], 1)).toHaveLength(1);
  });
});

describe("pickSuggestions", () => {
  it("one per country, earliest year wins, existing dropped, misses skipped", () => {
    const out = pickSuggestions(
      [
        { point: p("t1", 2024, "Portugal"), countryKey: "620" },
        { point: p("t2", 2020, "Portugal"), countryKey: "620" },
        { point: p("t1", 2024, "Spain"), countryKey: "724" },
        { point: p("t3", 2022, "Norway"), countryKey: "578" },
        { point: p("t3", 2022, null), countryKey: null },
      ],
      new Set(["724"]),
    );
    expect(out).toEqual([
      { countryKey: "620", tripId: "t2", tripTitle: "Trip t2", year: 2020 },
      { countryKey: "578", tripId: "t3", tripTitle: "Trip t3", year: 2022 },
    ]);
  });
  it("is empty for no input", () => {
    expect(pickSuggestions([], new Set())).toEqual([]);
  });
});

describe("visibleTaggedTripIds", () => {
  it("passes every tagged trip when the viewer sees all", () => {
    expect(visibleTaggedTripIds(["t1", "t2"], "all")).toEqual(["t1", "t2"]);
  });
  it("keeps only the trips in the visible set", () => {
    expect(visibleTaggedTripIds(["t1", "t2", "t3"], new Set(["t3", "t1"]))).toEqual(["t1", "t3"]);
  });
  it("is empty without tagged trips", () => {
    expect(visibleTaggedTripIds([], "all")).toEqual([]);
    expect(visibleTaggedTripIds([], new Set(["t1"]))).toEqual([]);
  });
  it("keeps the tagged order and collapses duplicates", () => {
    expect(visibleTaggedTripIds(["t2", "t1", "t2"], "all")).toEqual(["t2", "t1"]);
    expect(visibleTaggedTripIds(["t2", "t1", "t2"], new Set(["t1", "t2"]))).toEqual(["t2", "t1"]);
  });
});
