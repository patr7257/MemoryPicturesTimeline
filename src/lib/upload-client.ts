// Pure helpers behind the upload form: request timeouts, what a failure tells
// the person, the end-of-batch message, the hint under the button, and the
// shape of the failure report the phone sends home. No React, no I/O of its
// own: everything here is unit tested (upload-client.test.ts).
//
// Why this exists: on 2026-11-11 an iPhone upload "did nothing" and left no
// trace on the server. Every way the form can stall must now say so on screen
// and, where the network still works, in the server log.

export type UploadStage = "presign" | "put" | "finalize" | "create-trip";

export const UPLOAD_STAGES: readonly UploadStage[] = ["presign", "put", "finalize", "create-trip"];

// Generous on purpose: a 30 MB original over a weak mobile link is slow, but
// a request that has not answered after this long is never going to.
export const STAGE_TIMEOUT_MS: Record<UploadStage, number> = {
  presign: 20_000,
  put: 180_000,
  finalize: 90_000,
  "create-trip": 20_000,
};

export class UploadTimeoutError extends Error {
  constructor(public readonly stage: UploadStage) {
    super(`${STAGE_LABEL[stage]} took too long`);
    this.name = "UploadTimeoutError";
  }
}

const STAGE_LABEL: Record<UploadStage, string> = {
  presign: "Preparing the upload",
  put: "Sending the photo",
  finalize: "Processing the photo",
  "create-trip": "Creating the vacation",
};

// Runs `run` with an AbortSignal that fires after the stage's timeout, and
// rejects with UploadTimeoutError when it does. Callers that cannot take a
// signal (server actions) still get the rejection, so the form never waits
// forever.
export function withTimeout<T>(
  stage: UploadStage,
  run: (signal: AbortSignal) => Promise<T>,
  ms: number = STAGE_TIMEOUT_MS[stage],
): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new UploadTimeoutError(stage));
    }, ms);
    run(controller.signal).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export type FailureInfo = {
  message: string;
  // True when the session is gone: the row offers a sign-in link.
  signIn: boolean;
};

// The sentence shown on a failed row. status is null when no HTTP answer
// arrived at all (offline, timeout, CORS).
export function describeFailure(
  stage: UploadStage,
  status: number | null,
  serverError?: string | null,
): FailureInfo {
  if (status === 401) {
    return { message: "You were signed out. Sign in again, then press retry.", signIn: true };
  }
  if (serverError) return { message: serverError, signIn: false };
  if (status === null) {
    return { message: "No connection. Check the network and press retry.", signIn: false };
  }
  return { message: `${STAGE_LABEL[stage]} failed (${status}). Press retry.`, signIn: false };
}

export type BatchToast = { kind: "success" | "warning" | "error"; text: string };

const photos = (n: number) => `${n} photo${n === 1 ? "" : "s"}`;

// The message after a batch. Null when nothing was attempted.
export function batchToast(done: number, failed: number): BatchToast | null {
  if (done === 0 && failed === 0) return null;
  if (failed === 0) return { kind: "success", text: `${photos(done)} uploaded` };
  if (done === 0) {
    return { kind: "error", text: `No photos were uploaded. Press retry on the red rows.` };
  }
  return {
    kind: "warning",
    text: `${photos(done)} uploaded, ${failed} failed. Press retry on the red rows.`,
  };
}

export type HintInput = {
  // False until the form's script is running. Server-rendered HTML shows the
  // "not ready" hint, so a page whose script never started says so.
  ready: boolean;
  fileCount: number;
  // The photo picker was opened and has not handed any photos back yet.
  pickerOpen: boolean;
  busy: boolean;
};

// The line under the upload button explaining why nothing can happen yet.
export function uploadHint({ ready, fileCount, pickerOpen, busy }: HintInput): string | null {
  if (!ready) {
    return "The uploader is still loading. If this stays, close the app completely and open it again.";
  }
  if (busy || fileCount > 0) return null;
  if (pickerOpen) {
    return "Getting your photos ready. With many photos this can take a minute, they appear in a list here when ready.";
  }
  return "Choose photos above. They are listed here before you upload.";
}

// ------------------------------------------------------------ failure report

export type ClientReport = {
  stage: UploadStage;
  status: number | null;
  message: string;
  contentType: string | null;
  size: number | null;
};

const MAX_MESSAGE = 300;
const MAX_TYPE = 100;

// Validates what the phone posts to /api/upload/report. Null when the body is
// not a report; strings are clamped so a log line stays one short line.
export function parseClientReport(body: unknown): ClientReport | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.stage !== "string" || !(UPLOAD_STAGES as readonly string[]).includes(b.stage)) {
    return null;
  }
  if (typeof b.message !== "string") return null;
  const status =
    typeof b.status === "number" && Number.isInteger(b.status) && b.status >= 0 && b.status < 1000
      ? b.status
      : null;
  const size =
    typeof b.size === "number" && Number.isFinite(b.size) && b.size >= 0 ? Math.round(b.size) : null;
  const contentType = typeof b.contentType === "string" ? oneLine(b.contentType, MAX_TYPE) : null;
  return {
    stage: b.stage as UploadStage,
    status,
    message: oneLine(b.message, MAX_MESSAGE),
    contentType: contentType || null,
    size,
  };
}

function oneLine(text: string, max: number): string {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

// At most this many failure reports per batch, so 200 failing photos do not
// become 200 requests.
export const MAX_REPORTS_PER_BATCH = 5;
