import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { isAllowedPushEndpoint } from "@/lib/push/endpoint";
import { getSession } from "@/lib/session";

type Body = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };

// Upsert by endpoint: one row per device, re-keyed to whoever signed in last.
export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Body | null;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (
    !isAllowedPushEndpoint(body?.endpoint) ||
    typeof p256dh !== "string" ||
    typeof auth !== "string" ||
    !p256dh ||
    !auth
  ) {
    return Response.json({ error: "Bad subscription" }, { status: 400 });
  }
  const now = new Date();
  await getDb()
    .insert(pushSubscriptions)
    .values({ userId: session.user.id, endpoint: body!.endpoint as string, p256dh, auth })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: session.user.id, p256dh, auth, updatedAt: now },
    });
  return Response.json({ ok: true });
}

// Deliberate sign-out or switching notifications off on this device.
export async function DELETE(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Body | null;
  if (typeof body?.endpoint !== "string") {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  await getDb()
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.endpoint, body.endpoint),
        eq(pushSubscriptions.userId, session.user.id),
      ),
    );
  return Response.json({ ok: true });
}
