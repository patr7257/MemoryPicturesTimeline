"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { personCountries } from "@/db/schema";
import { getViewer } from "@/lib/access";
import { canEditCountries, canReadCountryNotes, type Viewer } from "@/lib/access-policy";
import { isCountryKey } from "@/lib/country-catalog";
import { getPersonTarget, type PersonTarget } from "@/lib/country-queries";
import { cleanNote, parseYear, type CountryActionResult } from "@/lib/countries";
import { parsePersonParam } from "@/lib/person-filter";

const STATUSES: readonly unknown[] = ["visited", "wishlist", "dismissed"];

const UNKNOWN_COUNTRY = "Unknown country";
const UNKNOWN_STATUS = "Unknown status";
const PERSON_NOT_FOUND = "Person not found";
const NOT_ALLOWED = "You cannot change this map";
const BAD_YEAR = "Enter a year like 2019";
const NOTE_TOO_LONG = "Note is too long";
const PRIVATE_NOTE = "This country has a private note, so only its owner can remove it.";

const refuse = (error: string): CountryActionResult => ({ ok: false, error });

type Edit = { viewer: Viewer; person: PersonTarget; key: string };

// Order: viewer, country key, person id shape, person exists, permission.
// Input parsing and the write follow in each action. Expected refusals come
// back as results; anything unexpected (a database error) still throws.
async function requireEdit(personId: unknown, countryKey: unknown): Promise<Edit | CountryActionResult> {
  const viewer = await getViewer();
  if (!isCountryKey(countryKey)) return refuse(UNKNOWN_COUNTRY);
  const id = typeof personId === "string" ? parsePersonParam(personId)[0] : undefined;
  if (id === undefined) return refuse(PERSON_NOT_FOUND);
  const person = await getPersonTarget(id);
  if (!person) return refuse(PERSON_NOT_FOUND);
  if (!canEditCountries(viewer, person.id)) return refuse(NOT_ALLOWED);
  return { viewer, person, key: countryKey };
}

const isRefusal = (r: Edit | CountryActionResult): r is CountryActionResult => "ok" in r;

export async function setCountryStatus(
  personId: string,
  countryKey: string,
  status: "visited" | "wishlist" | "dismissed",
  year?: unknown,
): Promise<CountryActionResult> {
  const edit = await requireEdit(personId, countryKey);
  if (isRefusal(edit)) return edit;
  const { viewer, person, key } = edit;
  if (!STATUSES.includes(status)) return refuse(UNKNOWN_STATUS);
  // Only a visited mark has a year; any year passed with another status is ignored.
  let stored: number | null = null;
  if (status === "visited") {
    const parsed = parseYear(year, new Date().getUTCFullYear());
    if (!parsed.ok) return refuse(BAD_YEAR);
    stored = parsed.year;
  }
  const now = new Date();
  await getDb()
    .insert(personCountries)
    .values({
      personId: person.id,
      countryKey: key,
      status,
      year: stored,
      updatedBy: viewer.userId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [personCountries.personId, personCountries.countryKey],
      set: { status, year: stored, updatedBy: viewer.userId, updatedAt: now },
    });
  revalidatePath("/countries");
  return { ok: true };
}

export async function setCountryYear(
  personId: string,
  countryKey: string,
  year: unknown,
): Promise<CountryActionResult> {
  const edit = await requireEdit(personId, countryKey);
  if (isRefusal(edit)) return edit;
  const { viewer, person, key } = edit;
  const parsed = parseYear(year, new Date().getUTCFullYear());
  if (!parsed.ok) return refuse(BAD_YEAR);
  await getDb()
    .update(personCountries)
    .set({ year: parsed.year, updatedBy: viewer.userId, updatedAt: new Date() })
    .where(
      and(
        eq(personCountries.personId, person.id),
        eq(personCountries.countryKey, key),
        eq(personCountries.status, "visited"),
      ),
    );
  revalidatePath("/countries");
  return { ok: true };
}

export async function setCountryNote(
  personId: string,
  countryKey: string,
  note: unknown,
): Promise<CountryActionResult> {
  const edit = await requireEdit(personId, countryKey);
  if (isRefusal(edit)) return edit;
  const { viewer, person, key } = edit;
  if (!canReadCountryNotes(viewer, person)) return refuse(NOT_ALLOWED);
  const cleaned = cleanNote(note);
  if (!cleaned.ok) return refuse(NOTE_TOO_LONG);
  await getDb()
    .update(personCountries)
    .set({ note: cleaned.note, updatedBy: viewer.userId, updatedAt: new Date() })
    .where(
      and(
        eq(personCountries.personId, person.id),
        eq(personCountries.countryKey, key),
        inArray(personCountries.status, ["visited", "wishlist"]),
      ),
    );
  revalidatePath("/countries");
  return { ok: true };
}

export async function removeCountry(
  personId: string,
  countryKey: string,
): Promise<CountryActionResult> {
  const edit = await requireEdit(personId, countryKey);
  if (isRefusal(edit)) return edit;
  const { viewer, person, key } = edit;
  const db = getDb();
  const match = and(eq(personCountries.personId, person.id), eq(personCountries.countryKey, key));

  if (canReadCountryNotes(viewer, person)) {
    await db.delete(personCountries).where(match);
    revalidatePath("/countries");
    return { ok: true };
  }

  // A viewer who may not read the notes must never delete one unseen: one
  // statement deletes only a row without a note.
  const deleted = await db
    .delete(personCountries)
    .where(and(match, isNull(personCountries.note)))
    .returning({ countryKey: personCountries.countryKey });
  if (deleted.length > 0) {
    revalidatePath("/countries");
    return { ok: true };
  }
  const [still] = await db
    .select({ countryKey: personCountries.countryKey })
    .from(personCountries)
    .where(match)
    .limit(1);
  return still ? refuse(PRIVATE_NOTE) : { ok: true };
}
