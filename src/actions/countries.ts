"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { personCountries } from "@/db/schema";
import { getViewer } from "@/lib/access";
import { AccessError, canEditCountries, canReadCountryNotes } from "@/lib/access-policy";
import { isCountryKey } from "@/lib/country-catalog";
import { getPersonTarget } from "@/lib/country-queries";
import { cleanNote, parseYear } from "@/lib/countries";

const STATUSES: readonly unknown[] = ["visited", "wishlist", "dismissed"];

// Order: viewer, country key, person exists, permission. Input parsing and the
// write follow in each action.
async function requireEdit(personId: string, countryKey: unknown) {
  const viewer = await getViewer();
  if (!isCountryKey(countryKey)) throw new Error("Unknown country");
  const person = await getPersonTarget(personId);
  if (!person) throw new Error("Person not found");
  if (!canEditCountries(viewer, person.id)) throw new AccessError();
  return { viewer, person, key: countryKey };
}

export async function setCountryStatus(
  personId: string,
  countryKey: string,
  status: "visited" | "wishlist" | "dismissed",
  year?: unknown,
): Promise<void> {
  const { viewer, person, key } = await requireEdit(personId, countryKey);
  if (!STATUSES.includes(status)) throw new Error("Unknown status");
  const parsed = parseYear(year, new Date().getUTCFullYear());
  if (!parsed.ok) throw new Error("Enter a year like 2019");
  const stored = status === "visited" ? parsed.year : null;
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
}

export async function setCountryYear(
  personId: string,
  countryKey: string,
  year: unknown,
): Promise<void> {
  const { viewer, person, key } = await requireEdit(personId, countryKey);
  const parsed = parseYear(year, new Date().getUTCFullYear());
  if (!parsed.ok) throw new Error("Enter a year like 2019");
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
}

export async function setCountryNote(
  personId: string,
  countryKey: string,
  note: unknown,
): Promise<void> {
  const { viewer, person, key } = await requireEdit(personId, countryKey);
  if (!canReadCountryNotes(viewer, person)) throw new AccessError();
  const cleaned = cleanNote(note);
  if (!cleaned.ok) throw new Error("Note is too long");
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
}

export async function removeCountry(personId: string, countryKey: string): Promise<void> {
  const { person, key } = await requireEdit(personId, countryKey);
  await getDb()
    .delete(personCountries)
    .where(and(eq(personCountries.personId, person.id), eq(personCountries.countryKey, key)));
  revalidatePath("/countries");
}
