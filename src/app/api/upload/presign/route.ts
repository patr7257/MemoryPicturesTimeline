import { getSession } from "@/lib/session";
import { ACCEPTED_MIMES, MAX_UPLOAD_BYTES, originalKey } from "@/lib/keys";
import { presignPut, r2Configured } from "@/lib/r2";

export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!r2Configured()) {
    return Response.json({ error: "Storage not configured" }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as {
    filename?: string;
    contentType?: string;
    size?: number;
  } | null;
  if (!body?.contentType || typeof body.size !== "number") {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  if (body.contentType === "image/heic" || body.contentType === "image/heif") {
    return Response.json(
      { error: "HEIC is not supported yet. Please upload JPEG (on iPhone: Settings, Camera, Formats, Most Compatible)." },
      { status: 415 },
    );
  }
  if (!ACCEPTED_MIMES.includes(body.contentType)) {
    return Response.json({ error: "Only photos can be uploaded" }, { status: 415 });
  }
  if (body.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "Photo is larger than 30 MB" }, { status: 413 });
  }

  const photoId = crypto.randomUUID();
  const key = originalKey(photoId, body.contentType);
  const url = await presignPut(key, body.contentType);
  return Response.json({ photoId, key, url });
}
