import { describe, expect, it } from "vitest";

import { deviceHint, formatAdded, isLastPasskey, passkeyLabel } from "./passkeys";

describe("passkeyLabel", () => {
  it("uses the name when present", () => {
    expect(passkeyLabel("Work laptop")).toBe("Work laptop");
    expect(passkeyLabel("  Phone  ")).toBe("Phone");
  });

  it("falls back for missing or blank names", () => {
    expect(passkeyLabel(undefined)).toBe("Unnamed passkey");
    expect(passkeyLabel(null)).toBe("Unnamed passkey");
    expect(passkeyLabel("   ")).toBe("Unnamed passkey");
  });
});

describe("formatAdded", () => {
  it("formats in a fixed locale and time zone", () => {
    // 23:30 UTC on 31 Dec is already 1 Jan in Copenhagen.
    expect(formatAdded(new Date("2026-12-31T23:30:00Z"))).toBe("1 Jan 2027");
    expect(formatAdded(new Date("2026-06-15T10:00:00Z"))).toBe("15 Jun 2026");
  });

  it("accepts ISO strings from the JSON client", () => {
    expect(formatAdded("2026-06-15T10:00:00.000Z")).toBe("15 Jun 2026");
  });

  it("returns an empty string for a missing or invalid date", () => {
    expect(formatAdded(undefined)).toBe("");
    expect(formatAdded("nope")).toBe("");
  });
});

describe("deviceHint", () => {
  it("says synced for multi-device backed-up passkeys", () => {
    expect(deviceHint("multiDevice", true)).toBe("Synced across your devices");
  });

  it("says this device only for single-device passkeys", () => {
    expect(deviceHint("singleDevice", false)).toBe("Stored on one device");
  });

  it("is quiet when the data says nothing useful", () => {
    expect(deviceHint(undefined, undefined)).toBe("");
    expect(deviceHint("multiDevice", false)).toBe("Can sync across devices");
  });
});

describe("isLastPasskey", () => {
  it("is true only when exactly one passkey remains", () => {
    expect(isLastPasskey(1)).toBe(true);
    expect(isLastPasskey(2)).toBe(false);
    expect(isLastPasskey(0)).toBe(false);
  });
});
