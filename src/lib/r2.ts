// Cloudflare R2 (S3-compatible) client + helpers. Server-only.
//
// R2 quirks handled here: newer AWS SDK v3 versions default to sending CRC32
// checksum headers that R2 rejects on some operations, so both checksum modes
// are pinned to WHEN_REQUIRED; path-style addressing avoids bucket-subdomain
// DNS issues.
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let cached: S3Client | undefined;

export function getR2(): S3Client {
  if (!cached) {
    cached = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
      },
      forcePathStyle: true,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return cached;
}

export function r2Bucket(): string {
  return process.env.R2_BUCKET ?? "";
}

export function r2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET,
  );
}

// Browser PUTs the original directly against this URL (keeps file bytes out
// of the app server entirely).
export async function presignPut(
  key: string,
  contentType: string,
): Promise<string> {
  return getSignedUrl(
    getR2(),
    new PutObjectCommand({
      Bucket: r2Bucket(),
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 600 },
  );
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const res = await getR2().send(
    new GetObjectCommand({ Bucket: r2Bucket(), Key: key }),
  );
  const bytes = await res.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await getR2().send(
    new PutObjectCommand({
      Bucket: r2Bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

// Deletes up to 1000 keys in one call. Throws when the call fails or any key
// is reported back as an error, so the caller decides how loud to be.
export async function deleteObjects(keys: string[]): Promise<void> {
  const unique = Array.from(new Set(keys.filter(Boolean)));
  if (unique.length === 0) return;
  const res = await getR2().send(
    new DeleteObjectsCommand({
      Bucket: r2Bucket(),
      Delete: { Objects: unique.map((Key) => ({ Key })), Quiet: true },
    }),
  );
  if (res.Errors && res.Errors.length > 0) {
    throw new Error(`${res.Errors.length} object(s) could not be deleted`);
  }
}
