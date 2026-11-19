"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { personCountries } from "@/db/schema";
import { getViewer } from "@/lib/access";
import {
  removeCountryCore,
  setCountryNoteCore,
  setCountryStatusCore,
  setCountryYearCore,
  type CountryStore,
} from "@/lib/country-actions-core";
import { getPersonTarget } from "@/lib/country-queries";
import type { CountryActionResult } from "@/lib/countries";

// Thin wrappers: every decision (validation, check order, permission, refusal
// texts, the removal rule) lives in country-actions-core.ts. Expected refusals
// come back as results; anything unexpected (a database error) still throws.

// The Drizzle-backed store the core decides against.
function dbStore(): CountryStore {
  const db = getDb();
  const match = (personId: string, countryKey: string) =>
    and(eq(personCountries.personId, personId), eq(personCountries.countryKey, countryKey));
  return {
    async findPerson(personId) {
      const person = await getPersonTarget(personId);
      return person ? { id: person.id, hasLogin: person.hasLogin } : null;
    },
    async upsertStatus({ personId, countryKey, status, year, keepYear, updatedBy }) {
      const now = new Date();
      await db
        .insert(personCountries)
        .values({ personId, countryKey, status, year, updatedBy, updatedAt: now })
        .onConflictDoUpdate({
          target: [personCountries.personId, personCountries.countryKey],
          // keepYear leaves year out of the update, so a stored year stays.
          set: keepYear ? { status, updatedBy, updatedAt: now } : { status, year, updatedBy, updatedAt: now },
        });
    },
    async updateYear(personId, countryKey, year, updatedBy) {
      const rows = await db
        .update(personCountries)
        .set({ year, updatedBy, updatedAt: new Date() })
        .where(and(match(personId, countryKey), eq(personCountries.status, "visited")))
        .returning({ countryKey: personCountries.countryKey });
      return rows.length;
    },
    async updateNote(personId, countryKey, note, updatedBy) {
      const rows = await db
        .update(personCountries)
        .set({ note, updatedBy, updatedAt: new Date() })
        .where(
          and(match(personId, countryKey), inArray(personCountries.status, ["visited", "wishlist"])),
        )
        .returning({ countryKey: personCountries.countryKey });
      return rows.length;
    },
    async deleteMark(personId, countryKey, { onlyWithoutNote }) {
      // One statement: with onlyWithoutNote a row carrying a note is never deleted.
      const rows = await db
        .delete(personCountries)
        .where(
          onlyWithoutNote
            ? and(match(personId, countryKey), isNull(personCountries.note))
            : match(personId, countryKey),
        )
        .returning({ countryKey: personCountries.countryKey });
      return rows.length;
    },
    async markExists(personId, countryKey) {
      const [row] = await db
        .select({ countryKey: personCountries.countryKey })
        .from(personCountries)
        .where(match(personId, countryKey))
        .limit(1);
      return row !== undefined;
    },
    async noteExists(personId, countryKey) {
      // Only the existence is read, never the note itself.
      const [row] = await db
        .select({ countryKey: personCountries.countryKey })
        .from(personCountries)
        .where(and(match(personId, countryKey), isNotNull(personCountries.note)))
        .limit(1);
      return row !== undefined;
    },
  };
}

function afterWrite(result: CountryActionResult): CountryActionResult {
  if (result.ok) revalidatePath("/countries");
  return result;
}

export async function setCountryStatus(
  personId: string,
  countryKey: string,
  status: "visited" | "wishlist" | "dismissed",
  year?: unknown,
): Promise<CountryActionResult> {
  const viewer = await getViewer();
  return afterWrite(
    await setCountryStatusCore(
      dbStore(),
      viewer,
      { personId, countryKey, status, year },
      new Date().getUTCFullYear(),
    ),
  );
}

export async function setCountryYear(
  personId: string,
  countryKey: string,
  year: unknown,
): Promise<CountryActionResult> {
  const viewer = await getViewer();
  return afterWrite(
    await setCountryYearCore(dbStore(), viewer, { personId, countryKey, year }, new Date().getUTCFullYear()),
  );
}

export async function setCountryNote(
  personId: string,
  countryKey: string,
  note: unknown,
): Promise<CountryActionResult> {
  const viewer = await getViewer();
  return afterWrite(await setCountryNoteCore(dbStore(), viewer, { personId, countryKey, note }));
}

export async function removeCountry(personId: string, countryKey: string): Promise<CountryActionResult> {
  const viewer = await getViewer();
  return afterWrite(await removeCountryCore(dbStore(), viewer, { personId, countryKey }));
}
