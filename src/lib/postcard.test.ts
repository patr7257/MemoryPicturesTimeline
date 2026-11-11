import { describe, expect, it } from "vitest";

import {
  addressLines,
  charsLeft,
  flipFace,
  frontCaption,
  hasUnsavedChanges,
  shortcutFor,
  stampTilt,
  type DraftState,
} from "./postcard";

describe("flipFace", () => {
  it("toggles between the two faces", () => {
    expect(flipFace("front")).toBe("back");
    expect(flipFace("back")).toBe("front");
  });
});

describe("frontCaption", () => {
  it("is empty without a caption", () => {
    expect(frontCaption(null)).toBe("");
    expect(frontCaption("  \n ")).toBe("");
  });
  it("keeps a short caption and collapses whitespace", () => {
    expect(frontCaption("  Beach   day ")).toBe("Beach day");
  });
  it("uses only the first non-empty line", () => {
    expect(frontCaption("\nFirst line\nSecond line")).toBe("First line");
  });
  it("cuts a long caption at a word boundary with three dots", () => {
    const out = frontCaption("one two three four five six seven eight nine ten", 20);
    expect(out).toBe("one two three four...");
    expect(out.length).toBeLessThanOrEqual(23);
  });
  it("hard-cuts a long word with no good boundary", () => {
    expect(frontCaption("x".repeat(30), 10)).toBe(`${"x".repeat(10)}...`);
  });
});

describe("shortcutFor", () => {
  const base = { typing: false, blocked: false };
  it("maps F and the arrows", () => {
    expect(shortcutFor({ ...base, key: "f" })).toBe("flip");
    expect(shortcutFor({ ...base, key: "F" })).toBe("flip");
    expect(shortcutFor({ ...base, key: "ArrowLeft" })).toBe("prev");
    expect(shortcutFor({ ...base, key: "ArrowRight" })).toBe("next");
  });
  it("ignores other keys", () => {
    expect(shortcutFor({ ...base, key: "x" })).toBeNull();
    expect(shortcutFor({ ...base, key: "Enter" })).toBeNull();
  });
  it("does nothing while typing or blocked", () => {
    expect(shortcutFor({ ...base, key: "f", typing: true })).toBeNull();
    expect(shortcutFor({ ...base, key: "ArrowLeft", blocked: true })).toBeNull();
  });
  it("leaves modified keys alone", () => {
    expect(shortcutFor({ ...base, key: "f", ctrlKey: true })).toBeNull();
    expect(shortcutFor({ ...base, key: "f", metaKey: true })).toBeNull();
    expect(shortcutFor({ ...base, key: "ArrowRight", altKey: true })).toBeNull();
  });
});

describe("hasUnsavedChanges", () => {
  const idle: DraftState = {
    caption: "Hello",
    captionEditing: false,
    captionDraft: "Hello",
    noteOpen: false,
    noteDraft: "",
  };
  it("is false when nothing is being edited", () => {
    expect(hasUnsavedChanges(idle)).toBe(false);
    expect(hasUnsavedChanges({ ...idle, captionDraft: "changed" })).toBe(false);
  });
  it("is true for an edited caption that differs from the stored one", () => {
    expect(hasUnsavedChanges({ ...idle, captionEditing: true, captionDraft: "Hello there" })).toBe(true);
  });
  it("is false for an open editor with the stored text or only whitespace changes", () => {
    expect(hasUnsavedChanges({ ...idle, captionEditing: true })).toBe(false);
    expect(hasUnsavedChanges({ ...idle, captionEditing: true, captionDraft: "Hello  " })).toBe(false);
  });
  it("treats a null stored caption as empty", () => {
    const s = { ...idle, caption: null, captionEditing: true, captionDraft: "" };
    expect(hasUnsavedChanges(s)).toBe(false);
    expect(hasUnsavedChanges({ ...s, captionDraft: "new" })).toBe(true);
  });
  it("is true for typed note text, false for an empty or closed note box", () => {
    expect(hasUnsavedChanges({ ...idle, noteOpen: true, noteDraft: "hi" })).toBe(true);
    expect(hasUnsavedChanges({ ...idle, noteOpen: true, noteDraft: "  " })).toBe(false);
    expect(hasUnsavedChanges({ ...idle, noteOpen: false, noteDraft: "hi" })).toBe(false);
  });
});

describe("addressLines", () => {
  it("carries the uploader and the vacation name", () => {
    expect(addressLines("Mette", "Italy 2026")).toEqual(["Uploaded by Mette", "Italy 2026"]);
  });
  it("omits a missing or blank vacation name", () => {
    expect(addressLines("Mette")).toEqual(["Uploaded by Mette"]);
    expect(addressLines("Mette", "  ")).toEqual(["Uploaded by Mette"]);
  });
});

describe("stampTilt", () => {
  it("is stable per id and within range", () => {
    expect(stampTilt("abc")).toBe(stampTilt("abc"));
    for (const id of ["a", "b", "photo-123", "zzz"]) {
      expect(Math.abs(stampTilt(id))).toBeLessThanOrEqual(4);
    }
  });
});

describe("charsLeft", () => {
  it("counts down and stops at zero", () => {
    expect(charsLeft("abc", 10)).toBe(7);
    expect(charsLeft("abcdef", 3)).toBe(0);
  });
});
