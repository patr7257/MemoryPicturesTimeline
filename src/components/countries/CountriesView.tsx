"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { Globe, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  removeCountry,
  setCountryNote,
  setCountryStatus,
  setCountryYear,
} from "@/actions/countries";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { CountriesTier } from "@/lib/access-policy";
import type { CountrySuggestion } from "@/lib/country-suggestions";
import {
  comparePartition,
  countryStats,
  needsRemoveConfirm,
  type CountryActionResult,
  type CountryMark,
} from "@/lib/countries";
import { countryByKey } from "@/lib/country-catalog";

import { CountryCard } from "./CountryCard";
import { CountryList, type RowState } from "./CountryList";
import { CountryStatsPanel } from "./CountryStatsPanel";
import { SuggestionChips } from "./SuggestionChips";

export type CountriesViewProps =
  | {
      mode: "single";
      person: { id: string; name: string };
      tier: CountriesTier;
      marks: CountryMark[];
      suggestions: CountrySuggestion[];
    }
  | {
      mode: "compare";
      a: { id: string; name: string; visited: string[] };
      b: { id: string; name: string; visited: string[] };
    }
  | { mode: "union"; label: string; visited: string[] };

// The page gives this a key that changes with the selection, so state never
// carries from one person to the next. A map block goes above the stats in
// each mode later.
export function CountriesView(props: CountriesViewProps) {
  if (props.mode === "single") return <SingleCountries {...props} />;

  if (props.mode === "compare") {
    const { a, b } = props;
    const { onlyA, onlyB, both } = comparePartition(a.visited, b.visited);
    const rows: Record<string, RowState> = {};
    for (const k of onlyA) rows[k] = { kind: "a", label: a.name };
    for (const k of onlyB) rows[k] = { kind: "b", label: b.name };
    for (const k of both) rows[k] = { kind: "both", label: "Both" };
    return (
      <div className="flex flex-col gap-8">
        <CountryStatsPanel
          mode="compare"
          a={{ name: a.name, total: countryStats(a.visited).total }}
          b={{ name: b.name, total: countryStats(b.visited).total }}
          onlyA={onlyA.length}
          onlyB={onlyB.length}
          both={both.length}
        />
        <CountryList rows={rows} />
      </div>
    );
  }

  const rows: Record<string, RowState> = {};
  for (const k of props.visited) rows[k] = { kind: "visited" };
  return (
    <div className="flex flex-col gap-8">
      <CountryStatsPanel mode="single" label={props.label} stats={countryStats(props.visited)} />
      <CountryList rows={rows} />
    </div>
  );
}

type Change = { key: string; mark: CountryMark | null };

function applyChange(marks: CountryMark[], change: Change): CountryMark[] {
  const rest = marks.filter((m) => m.countryKey !== change.key);
  return change.mark ? [...rest, change.mark] : rest;
}

// Expected refusals arrive as results; a thrown error is unexpected and
// production hides its message, so it gets the fallback text.
const FALLBACK = "Could not save. Try again.";

type Confirm = { country: string; year: boolean; note: boolean; resolve: (ok: boolean) => void };

// Errors stay until dismissed (frontend-ui-patterns CMP-02).
const toastError = (message: string) => toast.error(message, { duration: Infinity, closeButton: true });

function SingleCountries({
  person,
  tier,
  marks: initialMarks,
  suggestions,
}: Extract<CountriesViewProps, { mode: "single" }>) {
  const editable = tier !== "view";
  const [marks, setMarks] = useState(initialMarks);
  const [shown, addOptimistic] = useOptimistic(marks, applyChange);
  const [pending, startTransition] = useTransition();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  // Shows the change at once; the committed marks only move when the action
  // succeeds, so a refusal or a failure brings the previous state back by
  // itself. Resolves with the error text, or null on success.
  function run(
    change: Change | null,
    action: () => Promise<CountryActionResult>,
  ): Promise<string | null> {
    return new Promise((resolve) => {
      startTransition(async () => {
        if (change) addOptimistic(change);
        try {
          const result = await action();
          if (!result.ok) {
            resolve(result.error);
            return;
          }
          if (change) startTransition(() => setMarks((m) => applyChange(m, change)));
          resolve(null);
        } catch {
          resolve(FALLBACK);
        }
      });
    });
  }

  // Nothing with a year or a visible note is removed without the person
  // seeing it first. A bare mark goes at once.
  function confirmRemove(key: string): Promise<boolean> {
    const mark = byKey.get(key);
    if (!mark || !needsRemoveConfirm(mark)) return Promise.resolve(true);
    return new Promise((resolve) =>
      setConfirm({
        country: countryByKey(key)?.name ?? key,
        year: typeof mark.year === "number",
        note: typeof mark.note === "string" && mark.note !== "",
        resolve,
      }),
    );
  }

  function closeConfirm(ok: boolean) {
    confirm?.resolve(ok);
    setConfirm(null);
  }

  const byKey = new Map(shown.filter((m) => m.status !== "dismissed").map((m) => [m.countryKey, m]));
  const visitedKeys = shown.filter((m) => m.status === "visited").map((m) => m.countryKey);
  const anyKey = new Set(shown.map((m) => m.countryKey));
  const openSuggestions = editable ? suggestions.filter((s) => !anyKey.has(s.countryKey)) : [];

  const rows: Record<string, RowState> = {};
  for (const [k, m] of byKey) {
    rows[k] = m.status === "visited" ? { kind: "visited", year: m.year } : { kind: "wishlist" };
  }

  function setStatus(key: string, status: "visited" | "wishlist" | "dismissed", year: number | null = null) {
    const prev = byKey.get(key);
    const mark: CountryMark = { countryKey: key, status, year: status === "visited" ? year : null };
    if (prev && "note" in prev) mark.note = prev.note;
    void run({ key, mark }, () => setCountryStatus(person.id, key, status, year ?? undefined)).then(
      (err) => err && toastError(err),
    );
  }

  async function remove(key: string) {
    if (!(await confirmRemove(key))) return;
    const err = await run({ key, mark: null }, () => removeCountry(person.id, key));
    if (err) toastError(err);
  }

  // Remove from the card waits for the server: deleting a year and a note is
  // not rendered optimistically (frontend-ui-patterns STA-09). A refusal is
  // shown as a toast, like every other removal.
  async function removeFromCard(key: string): Promise<void> {
    if (!(await confirmRemove(key))) return;
    const err = await run(null, () => removeCountry(person.id, key));
    if (err) {
      toastError(err);
      return;
    }
    setMarks((m) => applyChange(m, { key, mark: null }));
    setOpenKey(null);
  }

  function saveYear(key: string, raw: string): Promise<string | null> {
    const prev = byKey.get(key);
    if (!prev) return Promise.resolve(null);
    const year = raw === "" ? null : Number(raw);
    return run({ key, mark: { ...prev, year } }, () => setCountryYear(person.id, key, raw));
  }

  function saveNote(key: string, note: string): Promise<string | null> {
    const prev = byKey.get(key);
    if (!prev) return Promise.resolve(null);
    const trimmed = note.trim();
    return run({ key, mark: { ...prev, note: trimmed === "" ? null : trimmed } }, () =>
      setCountryNote(person.id, key, note),
    );
  }

  const openCountry = openKey ? countryByKey(openKey) : undefined;
  const hasMarks = byKey.size > 0;
  // Rendered inside the open card so it nests as a child dialog there.
  const confirmDialog = <RemoveConfirm confirm={confirm} onClose={closeConfirm} />;

  return (
    <div className="flex flex-col gap-8" data-unsaved-work={pending ? "" : undefined}>
      <CountryStatsPanel mode="single" label={person.name} stats={countryStats(visitedKeys)} />

      {openSuggestions.length > 0 && (
        <SuggestionChips
          suggestions={openSuggestions}
          onAdd={(s) => setStatus(s.countryKey, "visited", s.year)}
          onDismiss={(s) => setStatus(s.countryKey, "dismissed")}
        />
      )}

      <div className="flex flex-col gap-4">
        {editable && !hasMarks && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Globe aria-hidden className="size-5 shrink-0 text-country-visited" />
            No countries yet. Tick the first place you have been and the stats fill in.
          </p>
        )}
        <CountryList
          rows={rows}
          editable={editable}
          onToggle={(key, checked) => (checked ? setStatus(key, "visited") : void remove(key))}
          onOpen={setOpenKey}
        />
      </div>

      {openCountry && (
        <CountryCard
          key={openCountry.key}
          country={openCountry}
          mark={byKey.get(openCountry.key) ?? null}
          tier={tier}
          onClose={() => setOpenKey(null)}
          onStatus={(status) => setStatus(openCountry.key, status, byKey.get(openCountry.key)?.year ?? null)}
          onRemove={() => removeFromCard(openCountry.key)}
          onSaveYear={(raw) => saveYear(openCountry.key, raw)}
          onSaveNote={(note) => saveNote(openCountry.key, note)}
        >
          {confirmDialog}
        </CountryCard>
      )}
      {!openCountry && confirmDialog}
    </div>
  );
}

// Asks before a year or a note is lost. Focus starts on Cancel and the
// confirm button names the action (frontend-ui-patterns CMP-35, CMP-34).
function RemoveConfirm({
  confirm,
  onClose,
}: {
  confirm: Confirm | null;
  onClose: (ok: boolean) => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const lost =
    confirm?.year && confirm.note
      ? "Its year and note are removed too."
      : confirm?.year
        ? "Its year is removed too."
        : "Its note is removed too.";
  return (
    <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && onClose(false)}>
      <AlertDialogContent initialFocus={cancelRef}>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {confirm?.country}?</AlertDialogTitle>
          <AlertDialogDescription>{lost}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancelRef} className="h-11 sm:h-8">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" className="h-11 sm:h-8" onClick={() => onClose(true)}>
            <Trash2 data-icon="inline-start" /> Remove {confirm?.country}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
