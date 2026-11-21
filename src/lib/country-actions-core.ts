// The decisions behind the country server actions: validation, check order,
// permission, refusal texts and the removal rule. Storage comes in through
// CountryStore, so this file has no database, auth or Next imports and is
// unit tested with a fake store (country-actions-core.test.ts).
import { canEditCountries, canReadCountryNotes, type Viewer } from "./access-policy";
import { cleanNote, parseYear, type CountryActionResult } from "./countries";
import { isCountryKey } from "./country-catalog";
import { parsePersonParam } from "./person-filter";

export type CountryStore = {
  // The person and whether a members row points at them, or null when missing.
  findPerson(personId: string): Promise<{ id: string; hasLogin: boolean } | null>;
  upsertStatus(row: {
    personId: string;
    countryKey: string;
    status: "visited" | "wishlist" | "dismissed";
    year: number | null;
    // True: insert with `year`, but leave the year of an existing row as it is.
    keepYear: boolean;
    updatedBy: string;
  }): Promise<void>;
  // Each returns the number of rows changed.
  updateYear(personId: string, countryKey: string, year: number | null, updatedBy: string): Promise<number>;
  updateNote(personId: string, countryKey: string, note: string | null, updatedBy: string): Promise<number>;
  deleteMark(personId: string, countryKey: string, opts: { onlyWithoutNote: boolean }): Promise<number>;
  // A visited row becomes dismissed with year and note cleared, so it is
  // never added again automatically. With onlyWithoutNote a row carrying a
  // note is left alone. One statement; returns the number of rows changed.
  dismissMark(personId: string, countryKey: string, opts: { onlyWithoutNote: boolean }): Promise<number>;
  // The row's status and whether it has a year or a note, never the note
  // itself; null when there is no row.
  findMark(
    personId: string,
    countryKey: string,
  ): Promise<{ status: "visited" | "wishlist" | "dismissed"; hasYear: boolean; hasNote: boolean } | null>;
  // Whether the row exists and carries a note. Asked only for an editor who
  // may not read the notes.
  noteExists(personId: string, countryKey: string): Promise<boolean>;
};

const STATUSES = ["visited", "wishlist", "dismissed"] as const;
type Status = (typeof STATUSES)[number];
const isStatus = (s: unknown): s is Status => (STATUSES as readonly unknown[]).includes(s);

const UNKNOWN_COUNTRY = "Unknown country";
const UNKNOWN_STATUS = "Unknown status";
const PERSON_NOT_FOUND = "Person not found";
const NOT_ALLOWED = "You cannot change this map";
const BAD_YEAR = "Enter a year like 2019";
const NOTE_TOO_LONG = "Note is too long";
const PRIVATE_NOTE = "This country has a private note, so only its owner can change or remove it.";
const NO_LONGER_MARKED = "This country is no longer marked. Reload the page.";
const UNSEEN_DETAILS = "This country has a year or a note this page did not show. Reload the page.";

const refuse = (error: string): CountryActionResult => ({ ok: false, error });
const OK: CountryActionResult = { ok: true };

type Edit = { person: { id: string; hasLogin: boolean }; key: string };

// Order: country key, person id shape, person exists, permission. Input
// parsing and the write follow in each action. No store call happens before
// the person id has the right shape.
async function requireEdit(
  store: CountryStore,
  viewer: Viewer,
  personId: unknown,
  countryKey: unknown,
): Promise<Edit | CountryActionResult> {
  if (!isCountryKey(countryKey)) return refuse(UNKNOWN_COUNTRY);
  const id = typeof personId === "string" ? parsePersonParam(personId)[0] : undefined;
  if (id === undefined) return refuse(PERSON_NOT_FOUND);
  const person = await store.findPerson(id);
  if (!person) return refuse(PERSON_NOT_FOUND);
  if (!canEditCountries(viewer, person.id)) return refuse(NOT_ALLOWED);
  return { person, key: countryKey };
}

const isRefusal = (r: Edit | CountryActionResult): r is CountryActionResult => "ok" in r;

// An editor who may not read the notes must not hide, move or re-date a row
// whose note they cannot see.
async function noteHidden(store: CountryStore, viewer: Viewer, edit: Edit): Promise<boolean> {
  if (canReadCountryNotes(viewer, edit.person)) return false;
  return store.noteExists(edit.person.id, edit.key);
}

export async function setCountryStatusCore(
  store: CountryStore,
  viewer: Viewer,
  input: { personId: unknown; countryKey: unknown; status: unknown; year?: unknown },
  currentYear: number,
): Promise<CountryActionResult> {
  const edit = await requireEdit(store, viewer, input.personId, input.countryKey);
  if (isRefusal(edit)) return edit;
  if (!isStatus(input.status)) return refuse(UNKNOWN_STATUS);
  // Only a visited mark has a year; any year passed with another status is
  // ignored. Visited without a year (undefined) keeps a stored year, so a
  // tap from a stale view never wipes one; an explicit null clears it.
  let year: number | null = null;
  const keepYear = input.status === "visited" && input.year === undefined;
  if (input.status === "visited" && !keepYear) {
    const parsed = parseYear(input.year, currentYear);
    if (!parsed.ok) return refuse(BAD_YEAR);
    year = parsed.year;
  }
  // Visited keeping the year is the one status write that leaves such a row as it was.
  if (!keepYear && (await noteHidden(store, viewer, edit))) return refuse(PRIVATE_NOTE);
  await store.upsertStatus({
    personId: edit.person.id,
    countryKey: edit.key,
    status: input.status,
    year,
    keepYear,
    updatedBy: viewer.userId,
  });
  return OK;
}

export async function setCountryYearCore(
  store: CountryStore,
  viewer: Viewer,
  input: { personId: unknown; countryKey: unknown; year: unknown },
  currentYear: number,
): Promise<CountryActionResult> {
  const edit = await requireEdit(store, viewer, input.personId, input.countryKey);
  if (isRefusal(edit)) return edit;
  const parsed = parseYear(input.year, currentYear);
  if (!parsed.ok) return refuse(BAD_YEAR);
  if (await noteHidden(store, viewer, edit)) return refuse(PRIVATE_NOTE);
  // No row changed: the mark was removed or changed elsewhere since the view loaded.
  const changed = await store.updateYear(edit.person.id, edit.key, parsed.year, viewer.userId);
  return changed > 0 ? OK : refuse(NO_LONGER_MARKED);
}

export async function setCountryNoteCore(
  store: CountryStore,
  viewer: Viewer,
  input: { personId: unknown; countryKey: unknown; note: unknown },
): Promise<CountryActionResult> {
  const edit = await requireEdit(store, viewer, input.personId, input.countryKey);
  if (isRefusal(edit)) return edit;
  if (!canReadCountryNotes(viewer, edit.person)) return refuse(NOT_ALLOWED);
  const cleaned = cleanNote(input.note);
  if (!cleaned.ok) return refuse(NOTE_TOO_LONG);
  const changed = await store.updateNote(edit.person.id, edit.key, cleaned.note, viewer.userId);
  return changed > 0 ? OK : refuse(NO_LONGER_MARKED);
}

// Removing a visited country keeps it as dismissed (year and note cleared),
// so auto-visited never adds it again; removing a wishlist entry deletes it.
// `confirmed` is true only when the person saw and accepted the confirmation
// that a year or a note goes too. Without it, a row that has a year or a
// readable note is refused: the page that sent the removal did not show them.
export async function removeCountryCore(
  store: CountryStore,
  viewer: Viewer,
  input: { personId: unknown; countryKey: unknown; confirmed: unknown },
): Promise<CountryActionResult> {
  const edit = await requireEdit(store, viewer, input.personId, input.countryKey);
  if (isRefusal(edit)) return edit;
  const found = await store.findMark(edit.person.id, edit.key);
  if (found === null || found.status === "dismissed") return OK;
  const readsNotes = canReadCountryNotes(viewer, edit.person);
  // A viewer who may not read the notes must never remove one unseen.
  if (found.hasNote && !readsNotes) return refuse(PRIVATE_NOTE);
  if (input.confirmed !== true && (found.hasYear || found.hasNote)) return refuse(UNSEEN_DETAILS);
  // The guard stays in the write too, for a note added after findMark.
  const onlyWithoutNote = !readsNotes;
  const changed =
    found.status === "wishlist"
      ? await store.deleteMark(edit.person.id, edit.key, { onlyWithoutNote })
      : await store.dismissMark(edit.person.id, edit.key, { onlyWithoutNote });
  return changed === 0 && onlyWithoutNote ? refuse(PRIVATE_NOTE) : OK;
}
