// Pure display helpers for the passkey list on /account.

export function passkeyLabel(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : "Unnamed passkey";
}

// Fixed locale and time zone so the server render and the client render
// produce identical text (no hydration mismatch).
const addedFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Copenhagen",
});

export function formatAdded(value: Date | string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : addedFormat.format(date);
}

export function deviceHint(
  deviceType: string | null | undefined,
  backedUp: boolean | null | undefined,
): string {
  if (deviceType === "multiDevice") {
    return backedUp ? "Synced across your devices" : "Can sync across devices";
  }
  if (deviceType === "singleDevice") return "Stored on one device";
  return "";
}

export function isLastPasskey(count: number): boolean {
  return count === 1;
}
