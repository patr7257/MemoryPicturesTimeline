import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { notificationPrefs } from "@/db/schema";
import { effectivePrefs, isNotificationType, NOTIFICATION_TYPES } from "@/lib/push/registry";
import { getSession } from "@/lib/session";

async function currentPrefs(userId: string) {
  const rows = await getDb()
    .select({ type: notificationPrefs.type, enabled: notificationPrefs.enabled })
    .from(notificationPrefs)
    .where(eq(notificationPrefs.userId, userId));
  return effectivePrefs(rows);
}

export async function GET(): Promise<Response> {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ prefs: await currentPrefs(session.user.id) });
}

// Body: partial map { photos_added: false }. Returns the full effective map.
export async function PUT(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const db = getDb();
  for (const [type, enabled] of Object.entries(body)) {
    if (!isNotificationType(type) || typeof enabled !== "boolean") {
      return Response.json({ error: `Bad entry: ${type}` }, { status: 400 });
    }
    if (!NOTIFICATION_TYPES[type].userCanDisable) {
      return Response.json({ error: `${type} cannot be switched off` }, { status: 400 });
    }
  }
  for (const [type, enabled] of Object.entries(body)) {
    await db
      .insert(notificationPrefs)
      .values({ userId: session.user.id, type, enabled: enabled as boolean })
      .onConflictDoUpdate({
        target: [notificationPrefs.userId, notificationPrefs.type],
        set: { enabled: enabled as boolean, updatedAt: new Date() },
      });
  }
  return Response.json({ prefs: await currentPrefs(session.user.id) });
}
