import { pushEnabled, sendTestPush } from "@/lib/push/send";
import { getSession } from "@/lib/session";

// Transport test to the caller's own devices. Proves delivery works, not that
// a real event would reach them (it bypasses preferences). Needs PUSH_SEND=1.
export async function POST(): Promise<Response> {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!pushEnabled()) {
    return Response.json({ error: "Push sending is disabled in this environment" }, { status: 503 });
  }
  const sent = await sendTestPush(session.user.id);
  return Response.json({ sent });
}
