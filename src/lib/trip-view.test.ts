import { describe, expect, it } from "vitest";

import {
  CAPTION_MAX,
  COMMENT_MAX,
  countCommentsByPhoto,
  formatCommentTime,
  formatPhotoDate,
  formatPhotoDateTime,
  formatPhotoTime,
  groupPhotosByDay,
  validateCaption,
  validateCommentBody,
} from "./trip-view";

const at = (iso: string) => new Date(iso + "Z");
const photo = (id: string, takenAt: Date | null) => ({ id, takenAt });

describe("photo date formatting", () => {
  it("formats the stored wall clock in UTC, never the runner's zone", () => {
    // 23:30 stays 23:30 and stays on the same day whatever TZ the process has.
    const d = at("2019-07-15T23:30:00");
    expect(formatPhotoTime(d)).toBe("23:30");
    expect(formatPhotoDate(d)).toBe("Mon 15 Jul 2019");
    expect(formatPhotoDateTime(d)).toBe("Mon 15 Jul 2019, 23:30");
  });
  it("returns an empty string for a missing date", () => {
    expect(formatPhotoTime(null)).toBe("");
    expect(formatPhotoDate(null)).toBe("");
    expect(formatPhotoDateTime(null)).toBe("");
  });
});

describe("formatCommentTime", () => {
  it("uses a fixed zone so server and browser agree", () => {
    // 22:30 UTC in July is 00:30 the next day in Copenhagen (UTC+2).
    expect(formatCommentTime(at("2025-07-15T22:30:00"))).toBe("16 Jul 2025, 00:30");
  });
});

describe("groupPhotosByDay", () => {
  it("groups by calendar day, orders days and photos, numbers days from the trip start", () => {
    const groups = groupPhotosByDay(
      [
        photo("c", at("2019-07-16T09:00:00")),
        photo("a", at("2019-07-14T08:00:00")),
        photo("b", at("2019-07-14T18:00:00")),
      ],
      "2019-07-14",
    );
    expect(groups.map((g) => g.key)).toEqual(["2019-07-14", "2019-07-16"]);
    expect(groups[0].photos.map((p) => p.id)).toEqual(["a", "b"]);
    expect(groups[0].label).toBe("Day 1, Sun 14 Jul 2019");
    expect(groups[1].label).toBe("Day 3, Tue 16 Jul 2019");
  });

  it("puts undated photos in a final Undated group", () => {
    const groups = groupPhotosByDay(
      [photo("u", null), photo("a", at("2019-07-14T08:00:00"))],
      "2019-07-14",
    );
    expect(groups.map((g) => g.key)).toEqual(["2019-07-14", "undated"]);
    expect(groups[1].label).toBe("Undated");
    expect(groups[1].photos.map((p) => p.id)).toEqual(["u"]);
  });

  it("returns no group at all for no photos, and only Undated when none are dated", () => {
    expect(groupPhotosByDay([], "2019-07-14")).toEqual([]);
    expect(groupPhotosByDay([photo("u", null)], "2019-07-14").map((g) => g.key)).toEqual(["undated"]);
  });

  it("counts days across a month and a year boundary", () => {
    const groups = groupPhotosByDay(
      [photo("a", at("2019-12-31T23:59:00")), photo("b", at("2020-01-02T00:01:00"))],
      "2019-12-30",
    );
    expect(groups.map((g) => g.label)).toEqual([
      "Day 2, Tue 31 Dec 2019",
      "Day 4, Thu 2 Jan 2020",
    ]);
    const month = groupPhotosByDay([photo("a", at("2019-03-02T10:00:00"))], "2019-02-27");
    expect(month[0].label).toBe("Day 4, Sat 2 Mar 2019");
  });

  it("numbers from the first photo day when photos precede the recorded start", () => {
    const groups = groupPhotosByDay(
      [photo("a", at("2019-07-10T10:00:00")), photo("b", at("2019-07-12T10:00:00"))],
      "2019-07-12",
    );
    expect(groups.map((g) => g.label)).toEqual([
      "Day 1, Wed 10 Jul 2019",
      "Day 3, Fri 12 Jul 2019",
    ]);
  });

  it("keeps input order for photos at the same instant", () => {
    const t = at("2019-07-14T08:00:00");
    const groups = groupPhotosByDay([photo("x", t), photo("y", t), photo("z", t)], "2019-07-14");
    expect(groups[0].photos.map((p) => p.id)).toEqual(["x", "y", "z"]);
  });
});

describe("validateCommentBody", () => {
  it("trims and accepts 1 to 2000 characters", () => {
    expect(validateCommentBody("  hi  ")).toEqual({ ok: true, value: "hi" });
    expect(validateCommentBody("x".repeat(COMMENT_MAX)).ok).toBe(true);
  });
  it("rejects empty, whitespace only, too long, and non-strings", () => {
    expect(validateCommentBody("").ok).toBe(false);
    expect(validateCommentBody("   \n ").ok).toBe(false);
    expect(validateCommentBody("x".repeat(COMMENT_MAX + 1)).ok).toBe(false);
    expect(validateCommentBody(undefined).ok).toBe(false);
  });
});

describe("validateCaption", () => {
  it("trims, and an empty caption clears it (null)", () => {
    expect(validateCaption("  Sunset  ")).toEqual({ ok: true, value: "Sunset" });
    expect(validateCaption("   ")).toEqual({ ok: true, value: null });
    expect(validateCaption("")).toEqual({ ok: true, value: null });
  });
  it("allows exactly 500 and rejects 501", () => {
    expect(validateCaption("x".repeat(CAPTION_MAX)).ok).toBe(true);
    expect(validateCaption("x".repeat(CAPTION_MAX + 1)).ok).toBe(false);
  });
  it("rejects non-strings", () => {
    expect(validateCaption(42 as unknown as string).ok).toBe(false);
  });
});

describe("countCommentsByPhoto", () => {
  it("counts photo comments per photo and trip notes separately", () => {
    const counts = countCommentsByPhoto([
      { photoId: "a" },
      { photoId: "a" },
      { photoId: null },
      { photoId: "b" },
    ]);
    expect(counts.byPhoto).toEqual({ a: 2, b: 1 });
    expect(counts.trip).toBe(1);
  });
  it("is empty for no comments", () => {
    expect(countCommentsByPhoto([])).toEqual({ byPhoto: {}, trip: 0 });
  });
});
