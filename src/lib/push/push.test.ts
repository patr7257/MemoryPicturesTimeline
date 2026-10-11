import { describe, expect, it } from "vitest";

import { onThisDayPayload, photosAddedPayload, tripCreatedPayload } from "./copy";
import { isAllowedPushEndpoint } from "./endpoint";
import { pushConfig, selectRecipients, type SubRow } from "./gate";
import { copenhagenDay, dayKey, tripsOnThisDay } from "./on-this-day";
import { fitPushPayload, pushSnippet } from "./payload";
import { effectivePref, effectivePrefs, isNotificationType } from "./registry";
import {
  pushSupport,
  safePath,
  shouldTearDownSubscription,
  type PushEnv,
} from "./client-decisions";

describe("registry", () => {
  it("missing row means the registry default (on)", () => {
    expect(effectivePref("photos_added", [])).toBe(true);
  });
  it("a saved row switches a type off, others stay on", () => {
    const rows = [{ type: "trip_created", enabled: false }];
    expect(effectivePrefs(rows)).toEqual({
      photos_added: true,
      trip_created: false,
      on_this_day: true,
    });
  });
  it("validates keys, including inherited names", () => {
    expect(isNotificationType("on_this_day")).toBe(true);
    expect(isNotificationType("toString")).toBe(false);
    expect(isNotificationType(5)).toBe(false);
  });
});

describe("pushConfig (dev must never push to prod subscriptions)", () => {
  const keys = { VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv" };
  it("disabled without PUSH_SEND=1 even with keys", () => {
    expect(pushConfig(keys).enabled).toBe(false);
    expect(pushConfig({ ...keys, PUSH_SEND: "0" }).enabled).toBe(false);
    expect(pushConfig({ ...keys, PUSH_SEND: "true" }).enabled).toBe(false);
  });
  it("disabled when a key is missing", () => {
    expect(pushConfig({ PUSH_SEND: "1", VAPID_PUBLIC_KEY: "pub" }).enabled).toBe(false);
  });
  it("enabled with PUSH_SEND=1 and both keys", () => {
    const c = pushConfig({ ...keys, PUSH_SEND: "1", VAPID_SUBJECT: "mailto:a@b.c" });
    expect(c).toMatchObject({ enabled: true, subject: "mailto:a@b.c" });
  });
});

describe("selectRecipients", () => {
  const sub = (id: string, userId: string): SubRow => ({
    id,
    userId,
    endpoint: `https://fcm.googleapis.com/${id}`,
    p256dh: "k",
    auth: "a",
  });
  const subs = [sub("1", "mom"), sub("2", "dad"), sub("3", "dad"), sub("4", "kid")];
  it("excludes the actor and everyone who switched the type off", () => {
    const prefs = new Map([["kid", [{ type: "photos_added", enabled: false }]]]);
    const out = selectRecipients(subs, prefs, "photos_added", { excludeUserId: "mom" });
    expect(out.map((s) => s.id)).toEqual(["2", "3"]);
  });
  it("a pref for another type does not mute this one", () => {
    const prefs = new Map([["kid", [{ type: "trip_created", enabled: false }]]]);
    expect(selectRecipients(subs, prefs, "photos_added").map((s) => s.id)).toContain("4");
  });
});

describe("copy", () => {
  it("photos_added: uploader, count, trip, deep link", () => {
    const p = photosAddedPayload({ uploaderName: "Mom", count: 24, tripId: "t1", tripTitle: "Mallorca 2025" });
    expect(p.body).toBe("Mom added 24 photos to Mallorca 2025");
    expect(p.url).toBe("/trips/t1");
  });
  it("photos_added: singular", () => {
    const p = photosAddedPayload({ uploaderName: "Mom", count: 1, tripId: "t1", tripTitle: "X" });
    expect(p.body).toBe("Mom added 1 photo to X");
  });
  it("trip_created and photos_added share a tag so the device collapses them", () => {
    const a = tripCreatedPayload({ tripId: "t1", tripTitle: "Skagen 2026" });
    const b = photosAddedPayload({ uploaderName: "Mom", count: 3, tripId: "t1", tripTitle: "Skagen 2026" });
    expect(a.body).toBe("New trip: Skagen 2026");
    expect(a.tag).toBe(b.tag);
  });
  it("on_this_day: one trip links to the trip, several link to /", () => {
    const one = onThisDayPayload([{ id: "t1", title: "Mallorca 2023", yearsAgo: 3 }], "2026-10-11");
    expect(one?.body).toBe("3 years ago today: Mallorca 2023");
    expect(one?.url).toBe("/trips/t1");
    const many = onThisDayPayload(
      [
        { id: "t1", title: "Mallorca 2023", yearsAgo: 3 },
        { id: "t2", title: "Skagen", yearsAgo: 1 },
      ],
      "2026-10-11",
    );
    expect(many?.body).toBe("Mallorca 2023 (3 years ago), Skagen (1 year ago)");
    expect(many?.url).toBe("/");
    expect(onThisDayPayload([], "2026-10-11")).toBeNull();
  });
});

describe("payload size", () => {
  it("snippet truncates on a word boundary with one ellipsis", () => {
    expect(pushSnippet("alpha beta gamma delta", 12)).toBe("alpha beta…");
    expect(pushSnippet("short")).toBe("short");
  });
  it("snippet never splits a surrogate pair", () => {
    const s = pushSnippet("\u{1F600}".repeat(10), 5);
    expect(Array.from(s)).toHaveLength(5);
    expect(s.endsWith("…")).toBe(true);
  });
  it("fit shrinks only the body and measures UTF-8 bytes", () => {
    const p = { title: "T", body: "æøå ".repeat(1500), tag: "x" };
    const out = fitPushPayload(p);
    expect(out.title).toBe("T");
    expect(out.tag).toBe("x");
    expect(Buffer.byteLength(JSON.stringify(out), "utf8")).toBeLessThanOrEqual(3072);
    expect(out.body!.length).toBeGreaterThan(0);
  });
});

describe("on this day, Copenhagen calendar", () => {
  it("uses Copenhagen, not UTC, near midnight (summer, UTC+2)", () => {
    // 22:30 UTC on 10 Jul is already 11 Jul 00:30 in Copenhagen.
    expect(copenhagenDay(new Date("2026-07-10T22:30:00Z"))).toEqual({ year: 2026, month: 7, day: 11 });
    expect(copenhagenDay(new Date("2026-07-10T21:30:00Z"))).toEqual({ year: 2026, month: 7, day: 10 });
  });
  it("uses Copenhagen in winter (UTC+1)", () => {
    expect(copenhagenDay(new Date("2026-12-31T23:30:00Z"))).toEqual({ year: 2027, month: 1, day: 1 });
    expect(copenhagenDay(new Date("2026-12-31T22:30:00Z"))).toEqual({ year: 2026, month: 12, day: 31 });
  });
  it("dayKey pads", () => {
    expect(dayKey({ year: 2026, month: 3, day: 5 })).toBe("2026-03-05");
  });
  it("matches same month/day in earlier years only, oldest first", () => {
    const trips = [
      { id: "a", title: "Today this year", startDate: "2026-07-11" },
      { id: "b", title: "Mallorca 2023", startDate: "2023-07-11" },
      { id: "c", title: "Other day", startDate: "2023-07-12" },
      { id: "d", title: "Older", startDate: "2019-07-11" },
      { id: "e", title: "Future", startDate: "2030-07-11" },
      { id: "f", title: "Bad", startDate: "nope" },
    ];
    const out = tripsOnThisDay(trips, { year: 2026, month: 7, day: 11 });
    expect(out.map((t) => [t.id, t.yearsAgo])).toEqual([
      ["d", 7],
      ["b", 3],
    ]);
  });
});

describe("push endpoint allowlist", () => {
  it("accepts the browser push services over https", () => {
    for (const e of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://web.push.apple.com/Qabc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://wns2-par02p.notify.windows.com/w/?token=x",
    ]) {
      expect(isAllowedPushEndpoint(e)).toBe(true);
    }
  });
  it("rejects http, internal hosts, lookalikes, ports and junk", () => {
    for (const e of [
      "http://fcm.googleapis.com/x",
      "https://169.254.169.254/latest",
      "https://localhost/x",
      "https://evilfcm.googleapis.com.attacker.example/x",
      "https://notpush.apple.com.evil.test/x",
      "https://fcm.googleapis.com:8443/x",
      "not a url",
      42,
      undefined,
    ]) {
      expect(isAllowedPushEndpoint(e)).toBe(false);
    }
  });
});

describe("client decisions", () => {
  it("tears down only on a deliberate sign-out", () => {
    expect(shouldTearDownSubscription("signed-out")).toBe(true);
    expect(shouldTearDownSubscription("lapsed")).toBe(false);
    expect(shouldTearDownSubscription("unauthorized")).toBe(false);
  });
  it("safePath allows root-relative paths only", () => {
    expect(safePath("/trips/abc")).toBe("/trips/abc");
    expect(safePath("//evil.example")).toBeNull();
    expect(safePath("https://evil.example")).toBeNull();
    expect(safePath("/\\evil.example")).toBeNull();
    expect(safePath(null)).toBeNull();
  });
  const base: PushEnv = {
    userAgent: "Mozilla/5.0 (Linux; Android 14)",
    platform: "Linux armv8l",
    maxTouchPoints: 5,
    standalone: false,
    hasServiceWorker: true,
    hasPushManager: true,
  };
  it("iPhone in Safari needs install first; installed is supported", () => {
    const ios = { ...base, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)", platform: "iPhone" };
    expect(pushSupport(ios)).toBe("ios-needs-install");
    expect(pushSupport({ ...ios, standalone: true })).toBe("supported");
  });
  it("iPadOS reporting as Mac is treated as iOS", () => {
    expect(pushSupport({ ...base, userAgent: "Macintosh", platform: "MacIntel" })).toBe("ios-needs-install");
  });
  it("android supported, no PushManager unsupported", () => {
    expect(pushSupport(base)).toBe("supported");
    expect(pushSupport({ ...base, hasPushManager: false })).toBe("unsupported");
  });
});
