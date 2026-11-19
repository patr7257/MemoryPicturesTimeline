import { describe, expect, it } from "vitest";
import { countryStats, fillsForMarks } from "./countries";
import { looksBlank, shareFileName, shareFills, shareLines } from "./share-map-image";

describe("share image text", () => {
  it("uses the first name and the numbers only", () => {
    const out = shareLines("Anna Marie Jensen", countryStats(["208", "304", "578"]));
    expect(out.title).toBe("Anna has been to");
    expect(out.lines).toEqual(["3 countries and territories", "2 of 193 UN countries", "1% of the world"]);
  });
  it("names the family map", () => {
    expect(shareLines("Family", countryStats([])).title).toBe("Family has been to");
  });
  it("has no name to show for a blank name", () => {
    expect(shareLines("   ", countryStats([])).title).toBe("Has been to");
  });
  it("takes the UN total from the stats", () => {
    const stats = { ...countryStats(["208"]), unTotal: 200 };
    expect(shareLines("Anna", stats).lines[1]).toBe("1 of 200 UN countries");
  });
  it("builds a safe file name", () => {
    expect(shareFileName("Søren Ø.")).toBe("countries-soren.png");
    expect(shareFileName("Ærø Åse")).toBe("countries-aero.png");
    expect(shareFileName("José")).toBe("countries-jose.png");
    expect(shareFileName("  ")).toBe("countries-map.png");
    expect(shareFileName("!!")).toBe("countries-map.png");
  });
});

describe("share image fills", () => {
  it("keeps visited countries and drops the private wishlist", () => {
    const fills = fillsForMarks([
      { countryKey: "208", status: "visited", year: null },
      { countryKey: "304", status: "wishlist", year: null },
      { countryKey: "578", status: "dismissed", year: null },
    ]);
    expect(fills["304"]).toBe("wishlist");
    expect(shareFills(fills)).toEqual({ "208": "visited" });
  });
  it("never carries any fill other than visited", () => {
    const out = shareFills({ a: "onlyA", b: "onlyB", c: "both", d: "wishlist", e: "visited" });
    expect(out).toEqual({ e: "visited" });
  });
});

describe("blank capture guard", () => {
  const paper = [245, 240, 228];
  it("calls a map area that is all paper blank", () => {
    expect(looksBlank([[245, 240, 228, 255], [245, 240, 228, 255]], paper)).toBe(true);
  });
  it("sees any drawn pixel", () => {
    expect(looksBlank([[245, 240, 228, 255], [230, 236, 238, 255]], paper)).toBe(false);
  });
  it("calls no samples blank", () => {
    expect(looksBlank([], paper)).toBe(true);
  });
});
