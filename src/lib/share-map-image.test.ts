import { describe, expect, it } from "vitest";
import { countryStats, fillsForMarks } from "./countries";
import { fitFontSize, looksBlank, shareFileName, shareFills, shareLines, truncateToFit } from "./share-map-image";

describe("share image text", () => {
  it("uses the first name and the numbers only", () => {
    const out = shareLines({ kind: "person", name: "Anna Marie Jensen" }, countryStats(["208", "304", "578"]));
    expect(out.title).toBe("Anna has been to");
    expect(out.lines).toEqual(["3 countries and territories", "2 of 193 UN countries", "1% of the world"]);
  });
  it("names the whole family", () => {
    expect(shareLines({ kind: "family" }, countryStats([])).title).toBe("Our family has been to");
  });
  it("never calls a group of some people the family", () => {
    expect(shareLines({ kind: "group" }, countryStats([])).title).toBe("We have been to");
  });
  it("has no name to show for a blank person name", () => {
    expect(shareLines({ kind: "person", name: "   " }, countryStats([])).title).toBe("Has been to");
  });
  it("says one country in the singular", () => {
    expect(shareLines({ kind: "person", name: "Anna" }, countryStats(["208"])).lines).toEqual([
      "1 country or territory",
      "1 of 193 UN countries",
      "1% of the world",
    ]);
  });
  it("takes the UN total from the stats", () => {
    const stats = { ...countryStats(["208"]), unTotal: 200 };
    expect(shareLines({ kind: "person", name: "Anna" }, stats).lines[1]).toBe("1 of 200 UN countries");
  });
  it("builds a safe file name for a person", () => {
    expect(shareFileName({ kind: "person", name: "Søren Ø." })).toBe("countries-soren.png");
    expect(shareFileName({ kind: "person", name: "Ærø Åse" })).toBe("countries-aero.png");
    expect(shareFileName({ kind: "person", name: "José" })).toBe("countries-jose.png");
    expect(shareFileName({ kind: "person", name: "  " })).toBe("countries-map.png");
    expect(shareFileName({ kind: "person", name: "!!" })).toBe("countries-map.png");
  });
  it("names the family and group files", () => {
    expect(shareFileName({ kind: "family" })).toBe("countries-family.png");
    expect(shareFileName({ kind: "group" })).toBe("countries-group.png");
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

describe("text fit", () => {
  // Width grows with the font size: 10 units of width per pixel of size.
  const measure = (px: number) => px * 10;
  it("keeps the start size when the text fits", () => {
    expect(fitFontSize(measure, 1000, 96, 48)).toBe(96);
  });
  it("shrinks until the text fits", () => {
    expect(fitFontSize(measure, 800, 96, 48)).toBe(80);
  });
  it("stops at the minimum when nothing fits", () => {
    expect(fitFontSize(measure, 100, 96, 48)).toBe(48);
  });
  it("counts a width exactly at the limit as fitting", () => {
    expect(fitFontSize(measure, 960, 96, 48)).toBe(96);
  });
  it("never goes under the minimum when the step overshoots it", () => {
    expect(fitFontSize(measure, 470, 96, 47)).toBe(47);
  });

  // One unit of width per character.
  const chars = (t: string) => t.length;
  it("leaves text that fits alone", () => {
    expect(truncateToFit(chars, "Christopher", 11)).toBe("Christopher");
  });
  it("cuts long text and ends it with three plain dots", () => {
    expect(truncateToFit(chars, "Christopher has been to", 10)).toBe("Christo...");
  });
  it("trims a space before the dots", () => {
    expect(truncateToFit(chars, "Ab cd", 6)).toBe("Ab cd");
    expect(truncateToFit(chars, "Ab cdef", 6)).toBe("Ab...");
  });
  it("gives only dots when nothing else fits", () => {
    expect(truncateToFit(chars, "Christopher", 2)).toBe("...");
  });
});
