import { describe, expect, it } from "vitest";

import { extForMime, keyBelongsToPhoto, originalKey, thumbKey } from "./keys";

describe("keyBelongsToPhoto", () => {
  const ID = "3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b";
  const OTHER = "11111111-2222-4333-8444-555555555555";
  it("accepts only the original of that very photo id", () => {
    expect(keyBelongsToPhoto(originalKey(ID, "image/jpeg"), ID)).toBe(true);
    expect(keyBelongsToPhoto(originalKey(ID, "image/png"), ID)).toBe(true);
    expect(keyBelongsToPhoto(originalKey(ID, "application/x-unknown"), ID)).toBe(true);
  });
  it("refuses a key of another photo, so its thumbnails cannot be overwritten", () => {
    expect(keyBelongsToPhoto(originalKey(OTHER, "image/jpeg"), ID)).toBe(false);
    expect(keyBelongsToPhoto("originals/" + ID + ".jpg/../x", ID)).toBe(false);
    expect(keyBelongsToPhoto("thumbs/" + ID + "-400.webp", ID)).toBe(false);
  });
  it("refuses an id that is not a uuid", () => {
    expect(keyBelongsToPhoto("originals/abc.jpg", "abc")).toBe(false);
    expect(keyBelongsToPhoto("originals/../thumbs/x.jpg", "../thumbs/x")).toBe(false);
    expect(keyBelongsToPhoto(undefined, ID)).toBe(false);
  });
});

describe("R2 key layout", () => {
  it("maps mime types to extensions", () => {
    expect(extForMime("image/jpeg")).toBe("jpg");
    expect(extForMime("image/png")).toBe("png");
    expect(extForMime("image/heic")).toBeNull();
  });

  it("builds deterministic keys", () => {
    expect(originalKey("abc", "image/jpeg")).toBe("originals/abc.jpg");
    expect(thumbKey("abc", 400)).toBe("thumbs/abc-400.webp");
    expect(thumbKey("abc", 1200)).toBe("thumbs/abc-1200.webp");
  });
});
