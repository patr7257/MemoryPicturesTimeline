import { getViewerOrNull } from "@/lib/access";
import { parseClientReport } from "@/lib/upload-client";

// The upload form posts here when a photo fails on the phone, so a failure
// that never reached presign or finalize still leaves one line in the server
// log. Best effort: the form ignores the answer.
export async function POST(req: Request): Promise<Response> {
  const viewer = await getViewerOrNull();
  if (!viewer) return new Response(null, { status: 401 });

  const report = parseClientReport(await req.json().catch(() => null));
  if (!report) return Response.json({ error: "Bad request" }, { status: 400 });

  console.warn(
    "[upload] client failure",
    JSON.stringify({
      user: viewer.userId,
      stage: report.stage,
      status: report.status,
      message: report.message,
      contentType: report.contentType,
      size: report.size,
      ua: (req.headers.get("user-agent") ?? "").slice(0, 200),
    }),
  );
  return new Response(null, { status: 204 });
}
