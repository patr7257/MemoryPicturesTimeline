import { versionPayload } from "@/lib/build-id";

// /version.json: which commit this build is, as { sha, builtAt }. Public on
// purpose (a commit hash and a time, nothing else): the version gate must
// get an answer even when the session has expired.
//
// Both values are inlined at build time from the stamp the Dockerfile writes,
// so this answers for exactly the build that serves it, and says "unknown" for
// an unstamped build. Dynamic and uncached: a cached answer is the stale build
// this exists to expose.
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(
    versionPayload(process.env.NEXT_PUBLIC_COMMIT_SHA, process.env.NEXT_PUBLIC_BUILT_AT),
    { headers: { "Cache-Control": "no-cache" } },
  );
}
