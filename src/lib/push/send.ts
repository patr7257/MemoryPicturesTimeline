// Server-side sender. Gating (env, actor exclusion, preferences) happens here,
// never only in the browser. Logs endpoint host only, never the endpoint or body.
import "server-only";

import { eq, inArray } from "drizzle-orm";
import webpush from "web-push";

import { getDb } from "@/db";
import { notificationPrefs, pushSubscriptions } from "@/db/schema";
import { pushConfig, selectRecipients, type SubRow } from "./gate";
import { fitPushPayload, withDefaults, type PushPayload } from "./payload";
import type { NotificationType, PrefRow } from "./registry";

export function pushEnabled(): boolean {
  return pushConfig(process.env).enabled;
}

async function deliver(subs: SubRow[], payload: PushPayload): Promise<number> {
  const cfg = pushConfig(process.env);
  if (!cfg.enabled) {
    console.log(`[push] disabled (${cfg.reason})`);
    return 0;
  }
  if (subs.length === 0) return 0;
  webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
  const body = JSON.stringify(fitPushPayload(withDefaults(payload)));
  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
      ),
    ),
  );
  let ok = 0;
  const gone: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      ok += 1;
      return;
    }
    const status = (r.reason as { statusCode?: number }).statusCode;
    console.warn(`[push] send failed status=${status} host=${new URL(subs[i].endpoint).host}`);
    if (status === 404 || status === 410) gone.push(subs[i].id);
  });
  if (gone.length > 0) {
    await getDb().delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
  }
  return ok;
}

// Everyone with a subscription, minus the actor, minus users who switched
// this type off. Returns the number of accepted sends.
export async function broadcastPush(
  type: NotificationType,
  payload: PushPayload,
  opts: { excludeUserId?: string } = {},
): Promise<number> {
  if (!pushEnabled()) {
    console.log(`[push] disabled, skipping ${type}`);
    return 0;
  }
  const db = getDb();
  const subs = await db.select().from(pushSubscriptions);
  const prefRows = await db
    .select()
    .from(notificationPrefs)
    .where(eq(notificationPrefs.type, type));
  const prefsByUser = new Map<string, PrefRow[]>();
  for (const r of prefRows) prefsByUser.set(r.userId, [{ type: r.type, enabled: r.enabled }]);
  const targets = selectRecipients(subs, prefsByUser, type, opts);
  return deliver(targets, payload);
}

// Transport test to one user's own devices (bypasses preferences on purpose).
export async function sendTestPush(userId: string): Promise<number> {
  const subs = await getDb()
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  return deliver(subs, {
    title: "Memories",
    body: "Notifications work on this device.",
    tag: "push-test",
    url: "/",
  });
}
