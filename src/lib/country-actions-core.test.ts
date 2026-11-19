import { describe, expect, it } from "vitest";

import type { Viewer } from "./access-policy";
import {
  removeCountryCore,
  setCountryNoteCore,
  setCountryStatusCore,
  setCountryYearCore,
  type CountryStore,
} from "./country-actions-core";
import { NOTE_MAX } from "./countries";

const OWNER_PERSON = "11111111-1111-4111-8111-111111111111";
const OTHER_PERSON = "22222222-2222-4222-8222-222222222222";
const NO_LOGIN_PERSON = "33333333-3333-4333-8333-333333333333";
const MISSING_PERSON = "44444444-4444-4444-8444-444444444444";
const DK = "208";
const NOW = 2026;

const owner: Viewer = { userId: "u-owner", email: "o@x.dk", name: "O", role: "member", personId: OWNER_PERSON };
const otherMember: Viewer = { userId: "u-other", email: "m@x.dk", name: "M", role: "member", personId: OTHER_PERSON };
const admin: Viewer = { userId: "u-admin", email: "a@x.dk", name: "A", role: "super_admin", personId: null };

type Row = { status: "visited" | "wishlist" | "dismissed"; year: number | null; note: string | null };
type Call = [string, ...unknown[]];

// A hand-written store: rows in a Map, every call recorded in order. It
// honours the same row restrictions as the real SQL.
function fakeStore(rows: Record<string, Row> = {}) {
  const people: Record<string, { id: string; hasLogin: boolean }> = {
    [OWNER_PERSON]: { id: OWNER_PERSON, hasLogin: true },
    [OTHER_PERSON]: { id: OTHER_PERSON, hasLogin: true },
    [NO_LOGIN_PERSON]: { id: NO_LOGIN_PERSON, hasLogin: false },
  };
  const data = new Map<string, Row>(Object.entries(rows));
  const calls: Call[] = [];
  const id = (p: string, k: string) => `${p}/${k}`;
  const store: CountryStore = {
    async findPerson(personId) {
      calls.push(["findPerson", personId]);
      return people[personId] ?? null;
    },
    async upsertStatus(row) {
      calls.push(["upsertStatus", row]);
      const prev = data.get(id(row.personId, row.countryKey));
      // keepYear: insert with the given year, but leave a stored year alone.
      const year = row.keepYear && prev ? prev.year : row.year;
      data.set(id(row.personId, row.countryKey), { status: row.status, year, note: prev?.note ?? null });
    },
    async updateYear(personId, countryKey, year, updatedBy) {
      calls.push(["updateYear", personId, countryKey, year, updatedBy]);
      const r = data.get(id(personId, countryKey));
      if (!r || r.status !== "visited") return 0;
      r.year = year;
      return 1;
    },
    async updateNote(personId, countryKey, note, updatedBy) {
      calls.push(["updateNote", personId, countryKey, note, updatedBy]);
      const r = data.get(id(personId, countryKey));
      if (!r || r.status === "dismissed") return 0;
      r.note = note;
      return 1;
    },
    async deleteMark(personId, countryKey, opts) {
      calls.push(["deleteMark", personId, countryKey, opts]);
      const r = data.get(id(personId, countryKey));
      if (!r) return 0;
      if (opts.onlyWithoutNote && r.note !== null) return 0;
      data.delete(id(personId, countryKey));
      return 1;
    },
    async markExists(personId, countryKey) {
      calls.push(["markExists", personId, countryKey]);
      return data.has(id(personId, countryKey));
    },
    async noteExists(personId, countryKey) {
      calls.push(["noteExists", personId, countryKey]);
      return (data.get(id(personId, countryKey))?.note ?? null) !== null;
    },
  };
  const names = () => calls.map((c) => c[0]);
  const writes = () =>
    names().filter((n) => ["upsertStatus", "updateYear", "updateNote", "deleteMark"].includes(n));
  return { store, data, calls, names, writes, row: (p: string, k = DK) => data.get(id(p, k)) };
}

const NOT_ALLOWED = { ok: false, error: "You cannot change this map" };
const PRIVATE_NOTE = { ok: false, error: "This country has a private note, so only its owner can change or remove it." };

describe("check order and refusals", () => {
  it.each(["36", 36, "nowhere"])("refuses the unknown country key %j before any store call", async (key) => {
    const f = fakeStore();
    const r = await setCountryStatusCore(f.store, owner, { personId: OWNER_PERSON, countryKey: key, status: "visited" }, NOW);
    expect(r).toEqual({ ok: false, error: "Unknown country" });
    expect(f.calls).toEqual([]);
  });

  it("refuses a person id that is not a uuid before any store call", async () => {
    const f = fakeStore();
    const r = await removeCountryCore(f.store, owner, { personId: "not-a-uuid", countryKey: DK });
    expect(r).toEqual({ ok: false, error: "Person not found" });
    expect(f.calls).toEqual([]);
  });

  it("refuses a missing person after exactly one lookup", async () => {
    const f = fakeStore();
    const r = await setCountryYearCore(f.store, admin, { personId: MISSING_PERSON, countryKey: DK, year: "2019" }, NOW);
    expect(r).toEqual({ ok: false, error: "Person not found" });
    expect(f.calls).toEqual([["findPerson", MISSING_PERSON]]);
  });

  it("refuses another member's map without writing", async () => {
    const f = fakeStore();
    const r = await setCountryStatusCore(f.store, otherMember, { personId: OWNER_PERSON, countryKey: DK, status: "visited" }, NOW);
    expect(r).toEqual(NOT_ALLOWED);
    expect(f.writes()).toEqual([]);
  });

  it("refuses an unknown status without writing", async () => {
    const f = fakeStore();
    const r = await setCountryStatusCore(f.store, owner, { personId: OWNER_PERSON, countryKey: DK, status: "maybe" }, NOW);
    expect(r).toEqual({ ok: false, error: "Unknown status" });
    expect(f.writes()).toEqual([]);
  });

  it.each(["1899", String(NOW + 1)])("refuses the visited year %s without writing", async (year) => {
    const f = fakeStore();
    const r = await setCountryStatusCore(f.store, owner, { personId: OWNER_PERSON, countryKey: DK, status: "visited", year }, NOW);
    expect(r).toEqual({ ok: false, error: "Enter a year like 2019" });
    expect(f.writes()).toEqual([]);
  });

  it("ignores a nonsense year for a wishlist entry and stores null", async () => {
    const f = fakeStore();
    const r = await setCountryStatusCore(f.store, owner, { personId: OWNER_PERSON, countryKey: DK, status: "wishlist", year: "soon" }, NOW);
    expect(r).toEqual({ ok: true });
    expect(f.calls.at(-1)).toEqual([
      "upsertStatus",
      { personId: OWNER_PERSON, countryKey: DK, status: "wishlist", year: null, keepYear: false, updatedBy: "u-owner" },
    ]);
  });

  it("upserts a visited mark with its year and the viewer as author", async () => {
    const f = fakeStore();
    const r = await setCountryStatusCore(f.store, owner, { personId: OWNER_PERSON, countryKey: DK, status: "visited", year: "2019" }, NOW);
    expect(r).toEqual({ ok: true });
    expect(f.calls).toEqual([
      ["findPerson", OWNER_PERSON],
      ["upsertStatus", { personId: OWNER_PERSON, countryKey: DK, status: "visited", year: 2019, keepYear: false, updatedBy: "u-owner" }],
    ]);
  });

  it("refuses a year on another member's map and a bad year on one's own, without writing", async () => {
    const f = fakeStore({ [`${OWNER_PERSON}/${DK}`]: { status: "visited", year: null, note: null } });
    expect(await setCountryYearCore(f.store, otherMember, { personId: OWNER_PERSON, countryKey: DK, year: "2019" }, NOW)).toEqual(NOT_ALLOWED);
    expect(await setCountryYearCore(f.store, owner, { personId: OWNER_PERSON, countryKey: DK, year: "19" }, NOW)).toEqual({
      ok: false,
      error: "Enter a year like 2019",
    });
    expect(f.writes()).toEqual([]);
    expect(await setCountryYearCore(f.store, owner, { personId: OWNER_PERSON, countryKey: DK, year: "2019" }, NOW)).toEqual({ ok: true });
    expect(f.row(OWNER_PERSON)?.year).toBe(2019);
  });
});

describe("notes", () => {
  const marked = (p: string) => ({ [`${p}/${DK}`]: { status: "visited" as const, year: null, note: null } });

  it("lets the owner write a trimmed note", async () => {
    const f = fakeStore(marked(OWNER_PERSON));
    const r = await setCountryNoteCore(f.store, owner, { personId: OWNER_PERSON, countryKey: DK, note: "  Fjords  " });
    expect(r).toEqual({ ok: true });
    expect(f.calls.at(-1)).toEqual(["updateNote", OWNER_PERSON, DK, "Fjords", "u-owner"]);
  });

  it("stores a blank note as null", async () => {
    const f = fakeStore(marked(OWNER_PERSON));
    await setCountryNoteCore(f.store, owner, { personId: OWNER_PERSON, countryKey: DK, note: "   " });
    expect(f.calls.at(-1)).toEqual(["updateNote", OWNER_PERSON, DK, null, "u-owner"]);
  });

  it("refuses a note over NOTE_MAX without writing", async () => {
    const f = fakeStore(marked(OWNER_PERSON));
    const r = await setCountryNoteCore(f.store, owner, { personId: OWNER_PERSON, countryKey: DK, note: "x".repeat(NOTE_MAX + 1) });
    expect(r).toEqual({ ok: false, error: "Note is too long" });
    expect(f.writes()).toEqual([]);
  });

  it("refuses a super admin on a person with a login", async () => {
    const f = fakeStore(marked(OWNER_PERSON));
    const r = await setCountryNoteCore(f.store, admin, { personId: OWNER_PERSON, countryKey: DK, note: "hi" });
    expect(r).toEqual(NOT_ALLOWED);
    expect(f.writes()).toEqual([]);
  });

  it("lets a super admin write the note of a person without a login", async () => {
    const f = fakeStore(marked(NO_LOGIN_PERSON));
    const r = await setCountryNoteCore(f.store, admin, { personId: NO_LOGIN_PERSON, countryKey: DK, note: "hi" });
    expect(r).toEqual({ ok: true });
    expect(f.row(NO_LOGIN_PERSON)?.note).toBe("hi");
  });
});

describe("removal", () => {
  const withNote = (p: string) => ({ [`${p}/${DK}`]: { status: "visited" as const, year: 2019, note: "Private" } });
  const bare = (p: string) => ({ [`${p}/${DK}`]: { status: "visited" as const, year: null, note: null } });

  it("lets a note reader delete a row that has a note", async () => {
    const f = fakeStore(withNote(OWNER_PERSON));
    const r = await removeCountryCore(f.store, owner, { personId: OWNER_PERSON, countryKey: DK });
    expect(r).toEqual({ ok: true });
    expect(f.calls).toContainEqual(["deleteMark", OWNER_PERSON, DK, { onlyWithoutNote: false }]);
    expect(f.row(OWNER_PERSON)).toBeUndefined();
  });

  it("keeps a row with a private note when the remover may not read it", async () => {
    const f = fakeStore(withNote(OWNER_PERSON));
    const r = await removeCountryCore(f.store, admin, { personId: OWNER_PERSON, countryKey: DK });
    expect(r).toEqual(PRIVATE_NOTE);
    expect(f.calls).toContainEqual(["deleteMark", OWNER_PERSON, DK, { onlyWithoutNote: true }]);
    expect(f.row(OWNER_PERSON)).toEqual({ status: "visited", year: 2019, note: "Private" });
  });

  it("deletes a bare row for a remover who may not read notes", async () => {
    const f = fakeStore(bare(OWNER_PERSON));
    const r = await removeCountryCore(f.store, admin, { personId: OWNER_PERSON, countryKey: DK });
    expect(r).toEqual({ ok: true });
    expect(f.calls).toContainEqual(["deleteMark", OWNER_PERSON, DK, { onlyWithoutNote: true }]);
    expect(f.row(OWNER_PERSON)).toBeUndefined();
  });

  it("is ok when the row is already gone for a remover who may not read notes", async () => {
    const f = fakeStore();
    const r = await removeCountryCore(f.store, admin, { personId: OWNER_PERSON, countryKey: DK });
    expect(r).toEqual({ ok: true });
    expect(f.names()).toEqual(["findPerson", "deleteMark", "markExists"]);
  });

  it("refuses another member without writing", async () => {
    const f = fakeStore(bare(OWNER_PERSON));
    const r = await removeCountryCore(f.store, otherMember, { personId: OWNER_PERSON, countryKey: DK });
    expect(r).toEqual(NOT_ALLOWED);
    expect(f.writes()).toEqual([]);
    expect(f.row(OWNER_PERSON)).toBeDefined();
  });
});

describe("a stale view", () => {
  const STALE = { ok: false, error: "This country is no longer marked. Reload the page." };
  const row = (status: Row["status"], year: number | null = null, note: string | null = null) => ({
    [`${OWNER_PERSON}/${DK}`]: { status, year, note },
  });

  it("refuses a year on a row that is gone", async () => {
    const f = fakeStore();
    expect(await setCountryYearCore(f.store, owner, { personId: OWNER_PERSON, countryKey: DK, year: "2019" }, NOW)).toEqual(STALE);
    expect(f.row(OWNER_PERSON)).toBeUndefined();
  });

  it("refuses a year on a wishlist row", async () => {
    const f = fakeStore(row("wishlist"));
    expect(await setCountryYearCore(f.store, owner, { personId: OWNER_PERSON, countryKey: DK, year: "2019" }, NOW)).toEqual(STALE);
    expect(f.row(OWNER_PERSON)).toEqual({ status: "wishlist", year: null, note: null });
  });

  it("refuses a note on a row that is gone", async () => {
    const f = fakeStore();
    expect(await setCountryNoteCore(f.store, owner, { personId: OWNER_PERSON, countryKey: DK, note: "Fjords" })).toEqual(STALE);
    expect(f.row(OWNER_PERSON)).toBeUndefined();
  });

  it("refuses a note on a dismissed row", async () => {
    const f = fakeStore(row("dismissed"));
    expect(await setCountryNoteCore(f.store, owner, { personId: OWNER_PERSON, countryKey: DK, note: "Fjords" })).toEqual(STALE);
    expect(f.row(OWNER_PERSON)).toEqual({ status: "dismissed", year: null, note: null });
  });
});

describe("the stored year on a status change", () => {
  const visited2019 = { [`${OWNER_PERSON}/${DK}`]: { status: "visited" as const, year: 2019, note: null } };
  const set = (f: ReturnType<typeof fakeStore>, status: string, year?: unknown) =>
    setCountryStatusCore(
      f.store,
      owner,
      year === undefined
        ? { personId: OWNER_PERSON, countryKey: DK, status }
        : { personId: OWNER_PERSON, countryKey: DK, status, year },
      NOW,
    );

  it("keeps a stored year when visited is set without one", async () => {
    const f = fakeStore(visited2019);
    expect(await set(f, "visited")).toEqual({ ok: true });
    expect(f.row(OWNER_PERSON)?.year).toBe(2019);
    expect(f.calls.at(-1)).toEqual([
      "upsertStatus",
      { personId: OWNER_PERSON, countryKey: DK, status: "visited", year: null, keepYear: true, updatedBy: "u-owner" },
    ]);
  });

  it("inserts a new visited row without a year", async () => {
    const f = fakeStore();
    expect(await set(f, "visited")).toEqual({ ok: true });
    expect(f.row(OWNER_PERSON)).toEqual({ status: "visited", year: null, note: null });
  });

  it("overwrites the year when visited comes with one", async () => {
    const f = fakeStore(visited2019);
    expect(await set(f, "visited", "2021")).toEqual({ ok: true });
    expect(f.row(OWNER_PERSON)?.year).toBe(2021);
  });

  it("clears the year when visited comes with an explicit null", async () => {
    const f = fakeStore(visited2019);
    expect(await set(f, "visited", null)).toEqual({ ok: true });
    expect(f.row(OWNER_PERSON)?.year).toBeNull();
  });

  it("clears the year for a wishlist entry", async () => {
    const f = fakeStore(visited2019);
    expect(await set(f, "wishlist")).toEqual({ ok: true });
    expect(f.row(OWNER_PERSON)).toEqual({ status: "wishlist", year: null, note: null });
  });
});

describe("a row with a note the editor may not read", () => {
  const noted = { [`${OWNER_PERSON}/${DK}`]: { status: "visited" as const, year: 2019, note: "Private" } };
  const bare = { [`${OWNER_PERSON}/${DK}`]: { status: "visited" as const, year: 2019, note: null } };
  const status = (f: ReturnType<typeof fakeStore>, v: Viewer, s: string, year?: unknown) =>
    setCountryStatusCore(
      f.store,
      v,
      year === undefined
        ? { personId: OWNER_PERSON, countryKey: DK, status: s }
        : { personId: OWNER_PERSON, countryKey: DK, status: s, year },
      NOW,
    );
  const year = (f: ReturnType<typeof fakeStore>, v: Viewer, y: unknown) =>
    setCountryYearCore(f.store, v, { personId: OWNER_PERSON, countryKey: DK, year: y }, NOW);

  it("refuses dismissing it and leaves the row alone", async () => {
    const f = fakeStore(noted);
    expect(await status(f, admin, "dismissed")).toEqual(PRIVATE_NOTE);
    expect(f.writes()).toEqual([]);
    expect(f.row(OWNER_PERSON)).toEqual({ status: "visited", year: 2019, note: "Private" });
  });

  it("refuses moving it to the wishlist", async () => {
    const f = fakeStore(noted);
    expect(await status(f, admin, "wishlist")).toEqual(PRIVATE_NOTE);
    expect(f.writes()).toEqual([]);
  });

  it("refuses changing its year, by status or by year", async () => {
    const f = fakeStore(noted);
    expect(await status(f, admin, "visited", "2021")).toEqual(PRIVATE_NOTE);
    expect(await status(f, admin, "visited", null)).toEqual(PRIVATE_NOTE);
    expect(await year(f, admin, "2021")).toEqual(PRIVATE_NOTE);
    expect(f.writes()).toEqual([]);
    expect(f.row(OWNER_PERSON)).toEqual({ status: "visited", year: 2019, note: "Private" });
  });

  it("allows marking it visited again without a year", async () => {
    const f = fakeStore(noted);
    expect(await status(f, admin, "visited")).toEqual({ ok: true });
    expect(f.row(OWNER_PERSON)).toEqual({ status: "visited", year: 2019, note: "Private" });
  });

  it("allows every change on a row without a note", async () => {
    const f = fakeStore(bare);
    expect(await year(f, admin, "2021")).toEqual({ ok: true });
    expect(await status(f, admin, "visited", "2020")).toEqual({ ok: true });
    expect(await status(f, admin, "wishlist")).toEqual({ ok: true });
    expect(await status(f, admin, "dismissed")).toEqual({ ok: true });
    expect(f.row(OWNER_PERSON)).toEqual({ status: "dismissed", year: null, note: null });
  });

  it("lets the owner change everything without asking about the note", async () => {
    const f = fakeStore(noted);
    expect(await year(f, owner, "2021")).toEqual({ ok: true });
    expect(await status(f, owner, "wishlist")).toEqual({ ok: true });
    expect(await status(f, owner, "dismissed")).toEqual({ ok: true });
    expect(f.row(OWNER_PERSON)).toEqual({ status: "dismissed", year: null, note: "Private" });
    expect(f.names()).not.toContain("noteExists");
  });
});
