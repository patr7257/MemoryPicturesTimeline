import { describe, expect, it } from "vitest";

import { extForMime, originalKey, thumbKey } from "./keys";

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
