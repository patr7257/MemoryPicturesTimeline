import { describe, expect, it } from "vitest";

import {
  isNewBuild,
  normaliseSha,
  parseVersionPayload,
  servedBuildSha,
  versionPayload,
} from "./build-id";

// The gate is only correct if two commits are compared when both are real.
// Every case below is a way it could prompt for nothing.

const A = "a".repeat(40);
const B = "b".repeat(40);

describe("normaliseSha", () => {
  it("accepts a full commit and lower-cases it", () => {
    expect(normaliseSha(A.toUpperCase())).toBe(A);
    expect(normaliseSha(`  ${A}\n`)).toBe(A);
  });

  it('treats "unknown", a short sha and anything else as unknown', () => {
    expect(normaliseSha("unknown")).toBeNull();
    expect(normaliseSha("abc1234")).toBeNull();
    expect(normaliseSha("")).toBeNull();
    expect(normaliseSha(undefined)).toBeNull();
    expect(normaliseSha(42)).toBeNull();
  });
});

describe("versionPayload", () => {
  it("serves the stamped commit and build time", () => {
    expect(versionPayload(A, "2026-10-02T12:00:00.000Z")).toEqual({
      sha: A,
      builtAt: "2026-10-02T12:00:00.000Z",
    });
  });

  it('says "unknown" for an unstamped build, never an empty string', () => {
    expect(versionPayload(undefined, undefined)).toEqual({ sha: "unknown", builtAt: null });
    expect(versionPayload("unknown", "")).toEqual({ sha: "unknown", builtAt: null });
  });
});

describe("parseVersionPayload", () => {
  it("reads the sha out of the body", () => {
    expect(parseVersionPayload({ sha: A, builtAt: "x" })).toBe(A);
  });

  it("returns null for any other shape", () => {
    expect(parseVersionPayload({ sha: "unknown" })).toBeNull();
    expect(parseVersionPayload({})).toBeNull();
    expect(parseVersionPayload(null)).toBeNull();
    expect(parseVersionPayload("<!doctype html>")).toBeNull();
  });
});

describe("isNewBuild", () => {
  it("is false when the commits match", () => {
    expect(isNewBuild(A, A)).toBe(false);
  });

  it("is true when they differ", () => {
    expect(isNewBuild(A, B)).toBe(true);
  });

  it("never prompts when either side is unknown", () => {
    expect(isNewBuild(null, B)).toBe(false);
    expect(isNewBuild(A, null)).toBe(false);
    expect(isNewBuild(null, null)).toBe(false);
  });
});

describe("servedBuildSha", () => {
  function answering(status: number, body: unknown): typeof fetch {
    return (async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
  }

  it("asks for /version.json past the HTTP cache", async () => {
    const asked: { url: unknown; init: RequestInit | undefined }[] = [];
    const spy = (async (url: unknown, init?: RequestInit) => {
      asked.push({ url, init });
      return new Response(JSON.stringify({ sha: A }), { status: 200 });
    }) as unknown as typeof fetch;

    await expect(servedBuildSha(spy)).resolves.toBe(A);
    expect(asked).toHaveLength(1);
    expect(asked[0]?.url).toBe("/version.json");
    expect(asked[0]?.init?.cache).toBe("no-store");
  });

  it("is null on an error status, so a 404 or a 500 never prompts", async () => {
    await expect(servedBuildSha(answering(404, { sha: A }))).resolves.toBeNull();
    await expect(servedBuildSha(answering(500, { sha: A }))).resolves.toBeNull();
  });

  it("is null when the network fails", async () => {
    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await expect(servedBuildSha(offline)).resolves.toBeNull();
  });

  it("is null when the body is not JSON, such as a sign-in page", async () => {
    const html = (async () =>
      new Response("<!doctype html><title>Sign in</title>", { status: 200 })) as unknown as typeof fetch;
    await expect(servedBuildSha(html)).resolves.toBeNull();
  });
});
