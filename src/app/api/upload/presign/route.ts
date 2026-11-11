import { getSession } from "@/lib/session";
import { ACCEPTED_MIMES, MAX_UPLOAD_BYTES, originalKey } from "@/lib/keys";
import { presignPut, r2Configured } from "@/lib/r2";

// Every refusal is logged: a rejected upload must leave a trace on the server.
function reject(status: number, error: string, context: Record<string, unknown>): Response {
  console.warn("[upload] presign rejected", JSON.stringify({ status, error, ...context }));
  return Response.json({ error }, { status });
}

export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return reject(401, "Unauthorized", {});
  const user = session.user.id;
  if (!r2Configured()) {
    return reject(503, "Storage not configured", { user });
  }

  const body = (await req.json().catch(() => null)) as {
    filename?: string;
    contentType?: string;
    size?: number;
  } | null;
  if (!body?.contentType || typeof body.size !== "number") {
    return reject(400, "Bad request", { user, contentType: body?.contentType ?? null, size: body?.size ?? null });
  }
  const context = { user, contentType: body.contentType, size: body.size };
  if (body.contentType === "image/heic" || body.contentType === "image/heif") {
    return reject(
      415,
      "HEIC is not supported yet. Please upload JPEG (on iPhone: Settings, Camera, Formats, Most Compatible).",
      context,
    );
  }
  if (!ACCEPTED_MIMES.includes(body.contentType)) {
    return reject(415, "Only photos can be uploaded", context);
  }
  if (body.size > MAX_UPLOAD_BYTES) {
    return reject(413, "Photo is larger than 30 MB", context);
  }

  const photoId = crypto.randomUUID();
  const key = originalKey(photoId, body.contentType);
  const url = await presignPut(key, body.contentType);
  return Response.json({ photoId, key, url });
}
