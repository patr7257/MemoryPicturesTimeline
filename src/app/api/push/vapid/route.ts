import { getSession } from "@/lib/session";

// Public key served at runtime, so a key change needs no rebuild. Empty
// string when unset so the page can say "not configured".
export async function GET(): Promise<Response> {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(
    { publicKey: process.env.VAPID_PUBLIC_KEY ?? "" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
