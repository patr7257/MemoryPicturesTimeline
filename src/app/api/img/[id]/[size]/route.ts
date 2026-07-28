import { GetObjectCommand } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { photos } from "@/db/schema";
import { getSession } from "@/lib/session";
import { getR2, r2Bucket, r2Configured } from "@/lib/r2";

// Authenticated image proxy: stable URLs so the browser cache works (private,
// immutable), no presigned-URL expiry mid-scroll, no bucket hostname leak.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; size: string }> },
): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!r2Configured()) return new Response("Storage not configured", { status: 503 });

  const { id, size } = await params;
  if (size !== "400" && size !== "1200" && size !== "orig") {
    return new Response("Bad size", { status: 400 });
  }

  const photo = await getDb().query.photos.findFirst({ where: eq(photos.id, id) });
  if (!photo) return new Response("Not found", { status: 404 });

  const key =
    size === "orig"
      ? photo.r2KeyOriginal
      : size === "1200"
        ? photo.r2Key1200
        : photo.r2Key400;

  try {
    const obj = await getR2().send(
      new GetObjectCommand({ Bucket: r2Bucket(), Key: key }),
    );
    const headers = new Headers({
      "Content-Type":
        size === "orig" ? (obj.ContentType ?? "image/jpeg") : "image/webp",
      "Cache-Control": "private, max-age=31536000, immutable",
    });
    if (obj.ContentLength) headers.set("Content-Length", String(obj.ContentLength));
    if (size === "orig") {
      const filename = key.split("/").pop() ?? "photo.jpg";
      headers.set("Content-Disposition", `inline; filename="${filename}"`);
    }
    return new Response(obj.Body!.transformToWebStream(), { headers });
  } catch {
    return new Response("Not found in storage", { status: 404 });
  }
}
