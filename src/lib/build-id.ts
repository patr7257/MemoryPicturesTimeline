// Per-deploy build identity for the page version gate. Ported from the
// app-shell block of zrm-fullstack-building-blocks.
//
// The identity is the commit the image was built from. The Dockerfile stamps it
// (scripts/build-info.mjs) and passes it into `next build` as
// NEXT_PUBLIC_COMMIT_SHA, which Next inlines into the bundle. So the RUNNING
// page knows its commit, and /version.json serves the commit of the build the
// server hands out now. A difference means a newer build has shipped.
//
// Rejected alternative: a build timestamp. It changes on every rebuild,
// including a redeploy that only touched an env variable, so it would prompt
// for nothing and teach people to dismiss the prompt. `builtAt` is served for
// diagnosis, never compared.

const SHA = /^[0-9a-f]{40}$/;

// A full 40 character commit, lower-cased, or null. "unknown", a short sha, an
// empty string and undefined are all null: the gate only compares two values
// it can trust.
export function normaliseSha(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim().toLowerCase();
  return SHA.test(clean) ? clean : null;
}

// The body /version.json serves.
export type VersionPayload = { sha: string; builtAt: string | null };

export function versionPayload(
  sha: string | null | undefined,
  builtAt: string | null | undefined,
): VersionPayload {
  return {
    sha: normaliseSha(sha) ?? "unknown",
    builtAt: builtAt?.trim() ? builtAt.trim() : null,
  };
}

// The served commit out of a /version.json body, or null for any other shape.
export function parseVersionPayload(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  return normaliseSha((body as { sha?: unknown }).sha);
}

// True only when both identities are known AND differ. An unknown on either
// side never prompts: a false "new version" claim teaches people to ignore it.
export function isNewBuild(running: string | null, served: string | null): boolean {
  if (!running || !served) return false;
  return running !== served;
}

// Fetches /version.json past the HTTP cache. Null on any failure (offline,
// timeout, a sign-in redirect, an odd shape), so a flaky network never
// produces a spurious prompt.
export async function servedBuildSha(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 5000,
): Promise<string | null> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const response = await fetchImpl("/version.json", { cache: "no-store", signal: abort.signal });
    if (!response.ok) return null;
    return parseVersionPayload(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
