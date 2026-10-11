// Pure gating, no I/O. Local dev and prod share ONE database, so a dev server
// must never push to prod subscriptions: sending needs PUSH_SEND=1 (set only
// in prod) AND the VAPID keys.
import { effectivePref, type NotificationType, type PrefRow } from "./registry";

type Env = Record<string, string | undefined>;

export type PushConfig =
  | { enabled: true; publicKey: string; privateKey: string; subject: string }
  | { enabled: false; reason: string };

export function pushConfig(env: Env): PushConfig {
  if (env.PUSH_SEND !== "1") return { enabled: false, reason: "PUSH_SEND is not 1" };
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return { enabled: false, reason: "VAPID keys missing" };
  return {
    enabled: true,
    publicKey,
    privateKey,
    subject: env.VAPID_SUBJECT || "mailto:patr7257@gmail.com",
  };
}

export type SubRow = { id: string; userId: string; endpoint: string; p256dh: string; auth: string };

// Apply, in order: exclude the actor, then the per-user preference for type.
// (No extra audience rule: every allowlisted family user qualifies.)
export function selectRecipients(
  subs: SubRow[],
  prefsByUser: Map<string, PrefRow[]>,
  type: NotificationType,
  opts: { excludeUserId?: string } = {},
): SubRow[] {
  return subs.filter(
    (s) =>
      s.userId !== opts.excludeUserId &&
      effectivePref(type, prefsByUser.get(s.userId) ?? []),
  );
}
