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
  fillsForCompare,
  fillsForMarks,
  fillsForUnion,
  legendFills,
  applyMarkChange,
  markAfterStatus,
  needsRemoveConfirm,
  type CountryActionResult,
  type CountryMark,
  type FillState,
  type MarkChange,
} from "@/lib/countries";
import { countryByKey } from "@/lib/country-catalog";
import type { MapFill, MapFills } from "@/lib/country-map-style";
import { PALETTE, SHARED_COLOR } from "@/lib/person-colors";

import { CountriesMap, type MapCapture, type MapLegendEntry } from "./CountriesMap";
import { CountryCard } from "./CountryCard";
import { CountryList, type RowState } from "./CountryList";
import { CountryStatsPanel } from "./CountryStatsPanel";
import { ShareMapButton } from "./ShareMapButton";
import { SuggestionChips } from "./SuggestionChips";
import { useMapProjection } from "./useMapProjection";

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
  // everyone: the union covers every person, so the share image may say "family".
  | { mode: "union"; label: string; visited: string[]; everyone: boolean };

// The page gives this a key that changes with the selection, so state never
// carries from one person to the next. The map goes above the stats in each
// mode; compare and union maps are read-only, like their lists.
export function CountriesView(props: CountriesViewProps) {
  const view = useMapProjection();
  const mapRef = useRef<MapCapture | null>(null);
  const [mapReady, setMapReady] = useState(false);
  if (props.mode === "single") return <SingleCountries {...props} view={view} />;

  if (props.mode === "compare") {
    const { a, b } = props;
    const { onlyA, onlyB, both } = comparePartition(a.visited, b.visited);
    const rows: Record<string, RowState> = {};
    for (const k of onlyA) rows[k] = { kind: "a", label: a.name };
    for (const k of onlyB) rows[k] = { kind: "b", label: b.name };
    for (const k of both) rows[k] = { kind: "both", label: "Both" };
    const legend: MapLegendEntry[] = [
      { fill: LEGACY_FILL.onlyA, label: `${a.name} only` },
      { fill: LEGACY_FILL.onlyB, label: `${b.name} only` },
      { fill: LEGACY_FILL.both, label: "Both" },
    ];
    return (
      <div className="flex flex-col gap-8">
        <CountriesMap fills={legacyFills(fillsForCompare(a.visited, b.visited))} legend={legend} {...view} />
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
  const fills = legacyFills(fillsForUnion(props.visited));
  const stats = countryStats(props.visited);
  // The share image names the family only when every person is in the union.
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <CountriesMap
          fills={fills}
          legend={legendFor(fillsForUnion(props.visited))}
          mapRef={mapRef}
          onReadyChange={setMapReady}
          {...view}
        />
        <ShareMapButton
          mapRef={mapRef}
          fills={fills}
          subject={{ kind: props.everyone ? "family" : "group" }}
          stats={stats}
          ready={mapReady}
        />
      </div>
      <CountryStatsPanel mode="single" label={props.label} stats={stats} />
      <CountryList rows={rows} />
    </div>
  );
}

const LEGEND_LABEL: Partial<Record<FillState, string>> = { visited: "Visited", wishlist: "Want to go" };

// Single and union maps: a legend entry for every fill in use, also when
// every fill is visited.
const legendFor = (fills: Record<string, FillState>): MapLegendEntry[] =>
  legendFills(fills).map((fill) => ({ fill: LEGACY_FILL[fill], label: LEGEND_LABEL[fill] ?? fill }));

// Temporary: S2a replaces compare and union. Maps the old fill states to
// map fills: the two compared people get the first two palette colours.
const LEGACY_FILL: Record<FillState, MapFill> = {
  visited: "visited",
  wishlist: "wishlist",
  onlyA: PALETTE[0].hex,
  onlyB: PALETTE[1].hex,
  both: SHARED_COLOR,
};
function legacyFills(f: Record<string, FillState>): MapFills {
  const out: MapFills = {};
  for (const [key, fill] of Object.entries(f)) out[key] = LEGACY_FILL[fill];
  return out;
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
  marks,
  suggestions,
  view,
}: Extract<CountriesViewProps, { mode: "single" }> & { view: ReturnType<typeof useMapProjection> }) {
  const editable = tier !== "view";
  // Always what the server last sent, with any pending changes on top.
  const [shown, addOptimistic] = useOptimistic(marks, applyMarkChange);
  const [pending, startTransition] = useTransition();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const mapRef = useRef<MapCapture | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Shows the change at once. Each action revalidates the page, so when its
  // transition ends the fresh marks prop is the base; a refusal or a failure
  // leaves the prop as it was and the change falls away by itself. Resolves
  // with the error text, or null on success.
  function run(
    change: MarkChange | null,
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

  // Without a year a visited mark keeps the year the server has stored.
  function setStatus(key: string, status: "visited" | "wishlist" | "dismissed", year?: number) {
    const mark = markAfterStatus(shown.find((m) => m.countryKey === key), key, status, year);
    void run({ key, mark }, () => setCountryStatus(person.id, key, status, year)).then(
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

  // A tap marks an unmarked country visited at once and opens its card; a
  // viewer only gets the read-only card.
  function pick(key: string) {
    if (editable && !byKey.has(key)) setStatus(key, "visited");
    setOpenKey(key);
  }
  // On screen an editor also sees the wishlist; the share button keeps only
  // the visited fills for the image.
  const marked = fillsForMarks(shown);
  const fills = legacyFills(marked);
  const stats = countryStats(visitedKeys);

  const openCountry = openKey ? countryByKey(openKey) : undefined;
  const hasMarks = byKey.size > 0;
  // Rendered inside the open card so it nests as a child dialog there.
  const confirmDialog = <RemoveConfirm confirm={confirm} onClose={closeConfirm} />;

  return (
    <div className="flex flex-col gap-8" data-unsaved-work={pending ? "" : undefined}>
      <div className="flex flex-col gap-3">
        <CountriesMap
          fills={fills}
          onPick={pick}
          legend={legendFor(marked)}
          mapRef={mapRef}
          onReadyChange={setMapReady}
          {...view}
        />
        <ShareMapButton
          mapRef={mapRef}
          fills={fills}
          subject={{ kind: "person", name: person.name }}
          stats={stats}
          ready={mapReady}
        />
      </div>
      <CountryStatsPanel mode="single" label={person.name} stats={stats} />

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
          onStatus={(status) => setStatus(openCountry.key, status)}
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
