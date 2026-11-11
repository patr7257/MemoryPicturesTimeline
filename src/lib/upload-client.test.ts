import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  UploadTimeoutError,
  batchToast,
  describeFailure,
  parseClientReport,
  uploadHint,
  withTimeout,
} from "./upload-client";

describe("withTimeout", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves with the value when the work finishes in time", async () => {
    await expect(withTimeout("presign", async () => "ok", 1000)).resolves.toBe("ok");
  });

  it("passes the work's own error through", async () => {
    const p = withTimeout("put", async () => {
      throw new TypeError("Load failed");
    }, 1000);
    await expect(p).rejects.toThrow("Load failed");
  });

  it("rejects with a timeout and aborts the signal when the work hangs", async () => {
    let signal: AbortSignal | undefined;
    const p = withTimeout("finalize", (s) => {
      signal = s;
      return new Promise<never>(() => {});
    }, 1000);
    const assertion = expect(p).rejects.toBeInstanceOf(UploadTimeoutError);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(signal?.aborted).toBe(true);
  });

  it("names the stage in the timeout message", async () => {
    const p = withTimeout("create-trip", () => new Promise<never>(() => {}), 50);
    const assertion = expect(p).rejects.toThrow("Creating the vacation took too long");
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });
});

describe("describeFailure", () => {
  it("asks to sign in again on 401, whatever the server said", () => {
    expect(describeFailure("presign", 401, "Unauthorized")).toEqual({
      message: "You were signed out. Sign in again, then press retry.",
      signIn: true,
    });
  });

  it("shows the server's own sentence when there is one", () => {
    expect(describeFailure("presign", 415, "Only photos can be uploaded").message).toBe(
      "Only photos can be uploaded",
    );
  });

  it("explains a missing answer as a connection problem", () => {
    expect(describeFailure("put", null)).toEqual({
      message: "No connection. Check the network and press retry.",
      signIn: false,
    });
  });

  it("falls back to the stage and status", () => {
    expect(describeFailure("finalize", 502).message).toBe(
      "Processing the photo failed (502). Press retry.",
    );
  });
});

describe("batchToast", () => {
  it("says nothing when nothing ran", () => {
    expect(batchToast(0, 0)).toBeNull();
  });

  it("is a success only when every photo made it", () => {
    expect(batchToast(1, 0)).toEqual({ kind: "success", text: "1 photo uploaded" });
    expect(batchToast(12, 0)).toEqual({ kind: "success", text: "12 photos uploaded" });
  });

  it("is an error when every photo failed", () => {
    expect(batchToast(0, 3)?.kind).toBe("error");
  });

  it("is a warning with both counts when some failed", () => {
    expect(batchToast(4, 2)).toEqual({
      kind: "warning",
      text: "4 photos uploaded, 2 failed. Press retry on the red rows.",
    });
  });
});

describe("uploadHint", () => {
  const base = { ready: true, fileCount: 0, pickerOpen: false, busy: false };

  it("tells the person when the page script is not running", () => {
    expect(uploadHint({ ...base, ready: false })).toMatch(/still loading/);
  });

  it("explains the wait while the photo picker prepares photos", () => {
    expect(uploadHint({ ...base, pickerOpen: true })).toMatch(/Getting your photos ready/);
  });

  it("asks for photos when none are chosen", () => {
    expect(uploadHint(base)).toMatch(/Choose photos/);
  });

  it("is silent once photos are listed or an upload runs", () => {
    expect(uploadHint({ ...base, fileCount: 3 })).toBeNull();
    expect(uploadHint({ ...base, busy: true })).toBeNull();
  });
});

describe("parseClientReport", () => {
  it("accepts a well formed report", () => {
    expect(
      parseClientReport({
        stage: "put",
        status: 403,
        message: "Storage upload failed",
        contentType: "image/jpeg",
        size: 1234.4,
      }),
    ).toEqual({
      stage: "put",
      status: 403,
      message: "Storage upload failed",
      contentType: "image/jpeg",
      size: 1234,
    });
  });

  it("rejects bodies that are not reports", () => {
    expect(parseClientReport(null)).toBeNull();
    expect(parseClientReport("x")).toBeNull();
    expect(parseClientReport({ stage: "hack", message: "x" })).toBeNull();
    expect(parseClientReport({ stage: "put" })).toBeNull();
  });

  it("drops bad numbers instead of trusting them", () => {
    const r = parseClientReport({ stage: "presign", message: "m", status: 99999, size: -1 });
    expect(r?.status).toBeNull();
    expect(r?.size).toBeNull();
  });

  it("keeps a log line on one short line", () => {
    const r = parseClientReport({ stage: "finalize", message: `a\nb\r\n${"x".repeat(500)}` });
    expect(r?.message.includes("\n")).toBe(false);
    expect(r?.message.length).toBe(300);
  });
});
