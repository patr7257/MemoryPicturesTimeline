import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  MAX_SECONDS,
  MIN_SECONDS,
  buildVacationScreens,
  chunkPhotos,
  clampSeconds,
  gridLayout,
  pickSelected,
  vacationDates,
  vacationSummaryLabel,
  dateAndPlaceLine,
  driftFor,
  estimateLabel,
  formatPlace,
  formatTakenAt,
  parseSettings,
  selectionTitle,
  shuffle,
  sortByTime,
  stepIndex,
  summaryLabel,
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
      ...DEFAULT_SETTINGS,
      order: "shuffle",
      showInfo: false,
      seconds: 12,
      style: "projector",
    });
    expect(parseSettings('{"order":"sideways","showInfo":"yes","seconds":500}')).toEqual({
      ...DEFAULT_SETTINGS,
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
  it("loads a setting stored before the vacation slideshow, with defaults for the new fields", () => {
    const old = '{"order":"shuffle","showInfo":false,"seconds":9,"style":"simple"}';
    expect(parseSettings(old)).toEqual({
      order: "shuffle",
      showInfo: false,
      seconds: 9,
      style: "simple",
      kind: "photo",
      vacationShow: "selected",
      screenSeconds: 6,
    });
    expect(DEFAULT_SETTINGS.kind).toBe("photo");
    expect(DEFAULT_SETTINGS.vacationShow).toBe("selected");
    expect(DEFAULT_SETTINGS.screenSeconds).toBe(6);
  });
  it("remembers the vacation fields and repairs each invalid one on its own", () => {
    expect(
      parseSettings('{"kind":"vacation","vacationShow":"all","screenSeconds":11,"seconds":4}'),
    ).toEqual({ ...DEFAULT_SETTINGS, kind: "vacation", vacationShow: "all", screenSeconds: 11, seconds: 4 });
    const bad = parseSettings('{"kind":"movie","vacationShow":"some","screenSeconds":"x","order":"shuffle"}');
    expect(bad.kind).toBe("photo");
    expect(bad.vacationShow).toBe("selected");
    expect(bad.screenSeconds).toBe(6);
    expect(bad.order).toBe("shuffle");
    expect(parseSettings('{"screenSeconds":99}').screenSeconds).toBe(MAX_SECONDS);
    expect(parseSettings('{"screenSeconds":1}').screenSeconds).toBe(MIN_SECONDS);
  });
});

describe("pickSelected", () => {
  const ph = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}` }));
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

  it("puts the chosen cover first and spreads the rest evenly in time order", () => {
    // Remaining after the cover p4: p0 p1 p2 p3 p5 p6 p7 p8 p9; first, middle, last.
    expect(ids(pickSelected(ph(10), "p4"))).toEqual(["p4", "p0", "p5", "p9"]);
  });
  it("uses the first photo as cover when none is chosen", () => {
    expect(ids(pickSelected(ph(10), null))).toEqual(["p0", "p1", "p5", "p9"]);
  });
  it("ignores a cover id that is not among the photos", () => {
    expect(ids(pickSelected(ph(10), "gone"))).toEqual(["p0", "p1", "p5", "p9"]);
  });
  it("returns exactly four from four or more, without duplicates", () => {
    for (let n = 4; n <= 40; n++) {
      for (const cover of [null, "p0", `p${n - 1}`, `p${Math.floor(n / 2)}`]) {
        const out = ids(pickSelected(ph(n), cover));
        expect(out).toHaveLength(4);
        expect(new Set(out).size).toBe(4);
      }
    }
  });
  it("returns all of them when there are fewer than four, cover first", () => {
    expect(ids(pickSelected(ph(3), "p2"))).toEqual(["p2", "p0", "p1"]);
    expect(ids(pickSelected(ph(1), null))).toEqual(["p0"]);
    expect(pickSelected([], "p0")).toEqual([]);
  });
});

describe("chunkPhotos", () => {
  const ph = (n: number) => Array.from({ length: n }, (_, i) => i);
  it("cuts photos into screens of at most four", () => {
    expect(chunkPhotos(ph(10)).map((c) => c.length)).toEqual([4, 4, 2]);
    expect(chunkPhotos(ph(4)).map((c) => c.length)).toEqual([4]);
    expect(chunkPhotos(ph(1)).map((c) => c.length)).toEqual([1]);
    expect(chunkPhotos(ph(0))).toEqual([]);
  });
  it("keeps the order", () => {
    expect(chunkPhotos(ph(6))).toEqual([
      [0, 1, 2, 3],
      [4, 5],
    ]);
  });
});

describe("gridLayout", () => {
  it("names the layout for one to four photos", () => {
    expect(gridLayout(1)).toBe("single");
    expect(gridLayout(2)).toBe("pair");
    expect(gridLayout(3)).toBe("trio");
    expect(gridLayout(4)).toBe("quad");
  });
});

describe("buildVacationScreens", () => {
  const vac = (id: string, startDate: string, photoCount: number, coverPhotoId: string | null = null) => ({
    id,
    title: id.toUpperCase(),
    startDate,
    endDate: null,
    locationName: null,
    note: null,
    coverPhotoId,
    photos: Array.from({ length: photoCount }, (_, i) => ({ id: `${id}${i}`, caption: null })),
  });
  const vacations = [
    vac("b", "2021-05-01", 10, "b4"),
    vac("a", "2019-07-01", 2),
    vac("empty", "2020-01-01", 0),
    vac("c", "2023-02-01", 5),
  ];

  it("selected: one screen per vacation, oldest first, empty vacations dropped", () => {
    const screens = buildVacationScreens(vacations, { show: "selected", order: "time", seed: 1 });
    expect(screens.map((s) => s.vacation.id)).toEqual(["a", "b", "c"]);
    expect(screens.map((s) => s.photos.map((p) => p.id))).toEqual([
      ["a0", "a1"],
      ["b4", "b0", "b5", "b9"],
      ["c0", "c1", "c3", "c4"],
    ]);
    expect(screens.every((s) => s.part === 1 && s.parts === 1)).toBe(true);
  });
  it("all: grids of four in time order with the n of m marker, cover not moved", () => {
    const screens = buildVacationScreens(vacations, { show: "all", order: "time", seed: 1 });
    expect(screens.map((s) => [s.vacation.id, s.part, s.parts, s.photos.length])).toEqual([
      ["a", 1, 1, 2],
      ["b", 1, 3, 4],
      ["b", 2, 3, 4],
      ["b", 3, 3, 2],
      ["c", 1, 2, 4],
      ["c", 2, 2, 1],
    ]);
    expect(screens[1].photos.map((p) => p.id)).toEqual(["b0", "b1", "b2", "b3"]);
    expect(new Set(screens.map((s) => s.key)).size).toBe(screens.length);
    expect(screens.every((s) => s.photos.length >= 1 && s.photos.length <= 4)).toBe(true);
  });
  it("shuffled: same seed same order, vacations mixed, photos inside kept in time order", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      vac(`v${String(i).padStart(2, "0")}`, `20${String(10 + i)}-01-01`, 6),
    );
    const one = buildVacationScreens(many, { show: "all", order: "shuffle", seed: 42 });
    const two = buildVacationScreens(many, { show: "all", order: "shuffle", seed: 42 });
    const other = buildVacationScreens(many, { show: "all", order: "shuffle", seed: 43 });
    const order = (s: typeof one) => s.map((x) => x.key);
    expect(order(one)).toEqual(order(two));
    expect(order(one)).not.toEqual(order(other));
    const vacOrder = Array.from(new Set(one.map((s) => s.vacation.id)));
    expect(vacOrder).not.toEqual(many.map((v) => v.id));
    expect([...vacOrder].sort()).toEqual(many.map((v) => v.id));
    // The screens of one vacation stay together and in order.
    for (const v of many) {
      const own = one.filter((s) => s.vacation.id === v.id);
      expect(own.map((s) => s.photos.map((p) => p.id)).flat()).toEqual(v.photos.map((p) => p.id));
      const first = one.indexOf(own[0]);
      expect(one.slice(first, first + own.length)).toEqual(own);
    }
  });
  it("shuffled selected drops empty vacations too", () => {
    const screens = buildVacationScreens(vacations, { show: "selected", order: "shuffle", seed: 7 });
    expect(screens.map((s) => s.vacation.id).sort()).toEqual(["a", "b", "c"]);
  });
});

describe("vacation summary and dates", () => {
  it("estimates the time from screens and seconds", () => {
    expect(estimateLabel(56, 6)).toBe("about 6 minutes");
    expect(estimateLabel(168, 6)).toBe("about 17 minutes");
  });
  it("counts screens and vacations", () => {
    expect(vacationSummaryLabel(56, 56, 6)).toBe("56 screens from 56 vacations, about 6 minutes");
    expect(vacationSummaryLabel(1, 1, 6)).toBe("1 screen from 1 vacation, less than a minute");
    expect(vacationSummaryLabel(0, 0, 6)).toBe("No vacations with photos yet");
  });
  it("words the vacation dates", () => {
    expect(vacationDates("2019-07-12", null)).toBe("July 2019");
    expect(vacationDates("2019-07-12", "2019-07-12")).toBe("12 July 2019");
    expect(vacationDates("2019-07-12", "2019-07-19")).toBe("12 - 19 July 2019");
    expect(vacationDates("2019-07-28", "2019-08-03")).toBe("28 July - 3 August 2019");
    expect(vacationDates("2019-12-28", "2020-01-03")).toBe("28 December 2019 - 3 January 2020");
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

describe("selectionTitle", () => {
  it("words the title for any number of people", () => {
    expect(selectionTitle([])).toBe("everyone");
    expect(selectionTitle(["Anna"])).toBe("Anna");
    expect(selectionTitle(["Anna", "Ben"])).toBe("Anna and Ben");
    expect(selectionTitle(["Anna", "Ben", "Cleo"])).toBe("Anna, Ben and Cleo");
  });
});
