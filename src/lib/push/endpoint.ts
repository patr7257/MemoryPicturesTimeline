// The server POSTs to whatever endpoint a client registers, so accept only
// https endpoints on the known browser push services (SSRF guard).
const ALLOWED_SUFFIXES = [
  "fcm.googleapis.com",
  "push.apple.com",
  "push.services.mozilla.com",
  "notify.windows.com",
];

export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "") return false;
  return ALLOWED_SUFFIXES.some((s) => url.hostname === s || url.hostname.endsWith("." + s));
}
