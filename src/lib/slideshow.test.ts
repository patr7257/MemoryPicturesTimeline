import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  clampSeconds,
  dateAndPlaceLine,
  driftFor,
  estimateLabel,
  formatPlace,
  formatTakenAt,
  parsePersonParam,
  parseSettings,
  selectionTitle,
  shuffle,
  sortByTime,
  stepIndex,
  summaryLabel,
  togglePerson,
  tripCountOf,
} from "./slideshow";

describe("shuffle", () => {
  const input = Array.from({ length: 30 }, (_, i) => i);
  it("is deterministic for a seed and differs between seeds", () => {
    expect(shuffle(input, 42)).toEqual(shuffle(input, 42));
    expect(shuffle(input, 42)).not.toEqual(shuffle(input, 43));
  });
  it("is a permutation and does not mutate", () => {
    const copy = [...input];
    const out = shuffle(input, 7);
    expect(input).toEqual(copy);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
    expect(out).not.toEqual(input);
  });
  it("handles empty and single item", () => {
    expect(shuffle([], 1)).toEqual([]);
    expect(shuffle(["a"], 1)).toEqual(["a"]);
  });
});

describe("sortByTime", () => {
  const p = (id: string, tripStartDate: string, tripId: string, takenAt: string | null) => ({
    id,
    tripStartDate,
    tripId,
    takenAt,
  });
  it("orders vacations by start, photos by time, undated last within a vacation", () => {
    const out = sortByTime([
      p("late-undated", "2024-08-01", "b", null),
      p("late-2", "2024-08-01", "b", "2024-08-03T10:00:00.000Z"),
      p("early-undated", "2023-01-01", "a", null),
      p("early-1", "2023-01-01", "a", "2023-01-02T09:00:00.000Z"),
      p("late-1", "2024-08-01", "b", "2024-08-02T10:00:00.000Z"),
    ]);
    expect(out.map((x) => x.id)).toEqual([
      "early-1",
      "early-undated",
      "late-1",
      "late-2",
      "late-undated",
    ]);
  });
  it("is stable and does not mutate", () => {
    const input = [p("x", "2024-01-01", "a", null), p("y", "2024-01-01", "a", null)];
    const snapshot = [...input];
    expect(sortByTime(input).map((i) => i.id)).toEqual(["x", "y"]);
    expect(input).toEqual(snapshot);
  });
});

describe("estimate and summary", () => {
  it("words the duration", () => {
    expect(estimateLabel(5, 5)).toBe("less than a minute");
    expect(estimateLabel(12, 5)).toBe("about 1 minute");
    expect(estimateLabel(84, 5)).toBe("about 7 minutes");
    expect(estimateLabel(720, 5)).toBe("about 1 hour");
    expect(estimateLabel(780, 5)).toBe("about 1 hour 5 minutes");
  });
  it("builds the summary with singular and plural", () => {
    expect(summaryLabel(84, 6, 5)).toBe("84 photos from 6 vacations, about 7 minutes");
    expect(summaryLabel(1, 1, 5)).toBe("1 photo from 1 vacation, less than a minute");
    expect(summaryLabel(0, 0, 5)).toBe("No photos yet");
  });
  it("counts distinct vacations", () => {
    expect(tripCountOf([{ tripId: "a" }, { tripId: "a" }, { tripId: "b" }])).toBe(2);
  });
});

describe("settings", () => {
  it("clamps seconds to 2..30 and rounds", () => {
    expect(clampSeconds(0)).toBe(2);
    expect(clampSeconds(99)).toBe(30);
    expect(clampSeconds(7.6)).toBe(8);
    expect(clampSeconds(Number.NaN)).toBe(DEFAULT_SETTINGS.seconds);
  });
  it("falls back to defaults on missing or malformed storage", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("{not json")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("42")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("null")).toEqual(DEFAULT_SETTINGS);
  });
  it("keeps valid fields and repairs invalid ones", () => {
    expect(parseSettings('{"order":"shuffle","showInfo":false,"seconds":12}')).toEqual({
      order: "shuffle",
      showInfo: false,
      seconds: 12,
      style: "projector",
    });
    expect(parseSettings('{"order":"sideways","showInfo":"yes","seconds":500}')).toEqual({
      order: "time",
      showInfo: true,
      seconds: 30,
      style: "projector",
    });
  });
  it("defaults to the projector and gives an old saved object the default style", () => {
    expect(DEFAULT_SETTINGS.style).toBe("projector");
    expect(parseSettings('{"order":"shuffle","showInfo":false,"seconds":9}').style).toBe("projector");
  });
  it("remembers the simple style and repairs an invalid one", () => {
    expect(parseSettings('{"style":"simple"}').style).toBe("simple");
    expect(parseSettings('{"style":"projector"}').style).toBe("projector");
    expect(parseSettings('{"style":"cinema"}').style).toBe("projector");
    expect(parseSettings('{"style":3}').style).toBe("projector");
  });
});

describe("stepIndex", () => {
  it("moves one step and ends after the last slide", () => {
    expect(stepIndex(0, 1, 3)).toEqual({ kind: "go", index: 1 });
    expect(stepIndex(2, 1, 3)).toEqual({ kind: "end" });
  });
  it("stays put before the first slide", () => {
    expect(stepIndex(1, -1, 3)).toEqual({ kind: "go", index: 0 });
    expect(stepIndex(0, -1, 3)).toEqual({ kind: "stay" });
  });
  it("skips failed slides in both directions", () => {
    expect(stepIndex(0, 1, 4, new Set([1, 2]))).toEqual({ kind: "go", index: 3 });
    expect(stepIndex(0, 1, 3, new Set([1, 2]))).toEqual({ kind: "end" });
    expect(stepIndex(3, -1, 4, new Set([2]))).toEqual({ kind: "go", index: 1 });
    expect(stepIndex(2, -1, 4, new Set([0, 1]))).toEqual({ kind: "stay" });
  });
});

describe("date and place", () => {
  it("formats in UTC so the wall clock is kept", () => {
    expect(formatTakenAt("2024-07-12T23:30:00.000Z")).toBe("12 July 2024");
    expect(formatTakenAt(null)).toBeNull();
    expect(formatTakenAt("garbage")).toBeNull();
  });
  it("joins place parts", () => {
    expect(formatPlace("Lisbon", "Portugal")).toBe("Lisbon, Portugal");
    expect(formatPlace(null, "Portugal")).toBe("Portugal");
    expect(formatPlace(" ", null)).toBeNull();
  });
  it("builds the line from whatever exists", () => {
    expect(
      dateAndPlaceLine({ takenAt: "2024-07-12T10:00:00.000Z", city: "Lisbon", country: "Portugal" }),
    ).toBe("12 July 2024 - Lisbon, Portugal");
    expect(dateAndPlaceLine({ takenAt: null, city: "Lisbon", country: null })).toBe("Lisbon");
    expect(dateAndPlaceLine({ takenAt: null, city: null, country: null })).toBeNull();
  });
});

describe("driftFor", () => {
  it("is deterministic and small", () => {
    expect(driftFor("abc")).toEqual(driftFor("abc"));
    const d = driftFor("some-photo-id");
    expect(Math.abs(d.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(d.y)).toBeLessThanOrEqual(2);
  });
});

describe("parsePersonParam", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";
  it("accepts one id, repeated ids and nothing", () => {
    expect(parsePersonParam(undefined)).toEqual([]);
    expect(parsePersonParam(A)).toEqual([A]);
    expect(parsePersonParam([A, B])).toEqual([A, B]);
  });
  it("ignores malformed ids, dedupes and lower-cases", () => {
    expect(parsePersonParam(["nope", A, "", A.toUpperCase(), "1; drop table"])).toEqual([A]);
    expect(parsePersonParam("not-a-uuid")).toEqual([]);
    expect(parsePersonParam([])).toEqual([]);
  });
});

describe("togglePerson and selectionTitle", () => {
  it("adds and removes an id", () => {
    expect(togglePerson([], "a")).toEqual(["a"]);
    expect(togglePerson(["a"], "b")).toEqual(["a", "b"]);
    expect(togglePerson(["a", "b"], "a")).toEqual(["b"]);
  });
  it("words the title for any number of people", () => {
    expect(selectionTitle([])).toBe("everyone");
    expect(selectionTitle(["Anna"])).toBe("Anna");
    expect(selectionTitle(["Anna", "Ben"])).toBe("Anna and Ben");
    expect(selectionTitle(["Anna", "Ben", "Cleo"])).toBe("Anna, Ben and Cleo");
  });
});
