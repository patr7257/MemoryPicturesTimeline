import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Nunito: () => ({ variable: "n" }),
  Caveat: () => ({ variable: "c" }),
}));
vi.mock("sonner", () => ({ Toaster: () => null }));
vi.mock("@/components/push/PushBridge", () => ({ PushBridge: () => null }));
vi.mock("./globals.css", () => ({}));

const dir = __dirname;
const ALT = "Family Memories: our family photo timeline";

function pngSize(file: string) {
  const b = readFileSync(join(dir, file));
  expect(b.subarray(1, 4).toString()).toBe("PNG");
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

describe("site-wide link preview", () => {
  it("sets metadataBase to the production domain and a large twitter card", async () => {
    const { metadata } = await import("./layout");
    expect(String(metadata.metadataBase)).toBe("https://memories.patrickrobel.dk/");
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it.each(["opengraph-image", "twitter-image"])("%s is 1200x630 with alt text", (name) => {
    expect(pngSize(`${name}.png`)).toEqual({ w: 1200, h: 630 });
    expect(readFileSync(join(dir, `${name}.alt.txt`), "utf8")).toBe(ALT);
  });

  it("has no per-page or per-photo image routes", () => {
    const found = readdirRecursive(dir).filter((f) => /(opengraph|twitter)-image/.test(f));
    expect(found.sort()).toEqual([
      "opengraph-image.alt.txt",
      "opengraph-image.png",
      "twitter-image.alt.txt",
      "twitter-image.png",
    ]);
  });
});

function readdirRecursive(d: string, rel = ""): string[] {
  return readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? readdirRecursive(p, `${rel}${n}/`) : [`${rel}${n}`];
  });
}
