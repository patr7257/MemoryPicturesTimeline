// Payload shaping. Everything sent goes through fitPushPayload (inside the one
// deliver function), so no caller can skip the size cap.
export type PushPayload = {
  title: string;
  body?: string;
  tag?: string;
  url?: string;
  icon?: string;
  badge?: string;
};

// Push services reject about 4 KB; stay well below.
export const MAX_PUSH_PAYLOAD_BYTES = 3072;

export const DEFAULT_ICON = "/icons/icon-192.png";
export const DEFAULT_BADGE = "/icons/badge-96.png";

// Collapse whitespace, truncate on a word boundary with one ellipsis. Uses
// Array.from so a surrogate pair is never split.
export function pushSnippet(text: string | null | undefined, max = 100): string {
  const plain = (text ?? "").replace(/\s+/g, " ").trim();
  const chars = Array.from(plain);
  if (chars.length <= max) return plain;
  const cut = chars.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const kept = lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut;
  return kept.join("").trimEnd() + "…";
}

const byteSize = (p: unknown) => Buffer.byteLength(JSON.stringify(p), "utf8");

// Shrink only body (steps of x0.8) until the JSON fits limit UTF-8 bytes.
export function fitPushPayload<T extends { title: string; body?: string }>(
  payload: T,
  limit = MAX_PUSH_PAYLOAD_BYTES,
): T {
  let out = payload;
  while (byteSize(out) > limit && out.body && out.body.length > 0) {
    const next = Math.floor(Array.from(out.body).length * 0.8);
    out = { ...out, body: next > 0 ? pushSnippet(out.body, next) : "" };
  }
  return out;
}

export function withDefaults(p: PushPayload): PushPayload {
  return { icon: DEFAULT_ICON, badge: DEFAULT_BADGE, url: "/", ...p };
}
