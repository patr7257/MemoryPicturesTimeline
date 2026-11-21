"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

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
import { currentYearIn, YEAR_ZONE, type CountryActionResult, type CountryStatus } from "@/lib/countries";

// Thin wrappers: every decision (validation, check order, permission, refusal
// texts, the removal rule) lives in country-actions-core.ts. Expected refusals
// come back as results; anything unexpected (a database error) still throws.

// The Drizzle-backed store the core decides against. viewerId is written as
// updated_by where the store interface carries no author.
function dbStore(viewerId: string): CountryStore {
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
    async dismissMark(personId, countryKey, { onlyWithoutNote }) {
      // One statement: only a visited row, and with onlyWithoutNote only one
      // without a note, becomes dismissed with year and note cleared.
      const visited = and(match(personId, countryKey), eq(personCountries.status, "visited"));
      const rows = await db
        .update(personCountries)
        .set({ status: "dismissed", year: null, note: null, updatedBy: viewerId, updatedAt: new Date() })
        .where(onlyWithoutNote ? and(visited, isNull(personCountries.note)) : visited)
        .returning({ countryKey: personCountries.countryKey });
      return rows.length;
    },
    async findMark(personId, countryKey) {
      // Whether a year or a note exists is computed in SQL; the note itself
      // is never selected.
      const [row] = await db
        .select({
          status: personCountries.status,
          hasYear: sql<boolean>`${personCountries.year} is not null`,
          hasNote: sql<boolean>`${personCountries.note} is not null`,
        })
        .from(personCountries)
        .where(match(personId, countryKey))
        .limit(1);
      return row ? { status: row.status as CountryStatus, hasYear: row.hasYear === true, hasNote: row.hasNote === true } : null;
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
      dbStore(viewer.userId),
      viewer,
      { personId, countryKey, status, year },
      currentYearIn(YEAR_ZONE, new Date()),
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
    await setCountryYearCore(
      dbStore(viewer.userId),
      viewer,
      { personId, countryKey, year },
      currentYearIn(YEAR_ZONE, new Date()),
    ),
  );
}

export async function setCountryNote(
  personId: string,
  countryKey: string,
  note: unknown,
): Promise<CountryActionResult> {
  const viewer = await getViewer();
  return afterWrite(await setCountryNoteCore(dbStore(viewer.userId), viewer, { personId, countryKey, note }));
}

// confirmed: the person saw and accepted that a year or a note goes too.
export async function removeCountry(
  personId: string,
  countryKey: string,
  confirmed: boolean,
): Promise<CountryActionResult> {
  const viewer = await getViewer();
  return afterWrite(
    await removeCountryCore(dbStore(viewer.userId), viewer, { personId, countryKey, confirmed }),
  );
}
