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
import {
  countryStats,
  fillsForMarks,
  fillsForPeople,
  legendFills,
  applyMarkChange,
  markAfterStatus,
  multiStats,
  needsRemoveConfirm,
  partitionVisitors,
  type CountryActionResult,
  type CountryMark,
  type MarkChange,
} from "@/lib/countries";
import { countryByKey } from "@/lib/country-catalog";
import type { MapFills, ThemeFill } from "@/lib/country-map-style";
import { SHARED_COLOR, type Hex } from "@/lib/person-colors";

import { CountriesMap, type MapCapture, type MapLegendEntry } from "./CountriesMap";
import { CountryCard } from "./CountryCard";
import { CountryList, type RowState } from "./CountryList";
import { CountryStatsPanel } from "./CountryStatsPanel";
import { ShareMapButton } from "./ShareMapButton";
import { useMapProjection } from "./useMapProjection";
import { VisitorsCard } from "./VisitorsCard";

export type CountriesViewProps =
  | { mode: "empty"; message: string }
  | {
      mode: "single";
      person: { id: string; name: string };
      tier: CountriesTier;
      marks: CountryMark[];
    }
  | { mode: "multi"; people: { id: string; name: string; color: Hex; visited: string[] }[] };

type MapView = ReturnType<typeof useMapProjection>;

// The page gives this a key that changes with the selection, so state never
// carries from one person to the next. The map goes above the stats in each
// mode.
export function CountriesView(props: CountriesViewProps) {
  const view = useMapProjection();
  if (props.mode === "single") return <SingleCountries {...props} view={view} />;
  if (props.mode === "multi") return <MultiCountries {...props} view={view} />;
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Globe aria-hidden className="size-5 shrink-0 text-country-visited" />
        {props.message}
      </p>
      <CountriesMap fills={{}} {...view} />
    </div>
  );
}

const LEGEND_LABEL: Record<ThemeFill, string> = { visited: "Visited", wishlist: "Want to go" };

// A legend entry for every theme fill in use, also when every fill is visited.
const legendFor = (fills: MapFills): MapLegendEntry[] =>
  legendFills(fills).map((fill) => ({ fill, label: LEGEND_LABEL[fill] }));

const joinNames = (names: readonly string[]): string =>
  names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

// Two or more people: read-only. Each country in its one visitor's colour, or
// the shared colour; the legend names every person and "Shared", so colour is
// never the only cue. Only visited rows reach this view.
function MultiCountries({
  people,
  view,
}: Extract<CountriesViewProps, { mode: "multi" }> & { view: MapView }) {
  const mapRef = useRef<MapCapture | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const byPerson: Record<string, string[]> = {};
  const colors: Record<string, Hex> = {};
  for (const p of people) {
    byPerson[p.id] = p.visited;
    colors[p.id] = p.color;
  }
  const personOf = new Map(people.map((p) => [p.id, p]));
  const { visitorsByKey } = partitionVisitors(byPerson);
  const fills = fillsForPeople(byPerson, colors, SHARED_COLOR);
  const counts = multiStats(byPerson);
  const anyone = Object.keys(visitorsByKey);
  // The image shows every country any of them visited, in the visited colour.
  const shareFills: MapFills = Object.fromEntries(anyone.map((k) => [k, "visited" as const]));

  const legend: MapLegendEntry[] = [
    ...people.map((p) => ({ fill: p.color, label: p.name })),
    { fill: SHARED_COLOR, label: "Shared" },
  ];

  const rows: Record<string, RowState> = {};
  for (const [key, ids] of Object.entries(visitorsByKey)) {
    const names = ids.map((id) => personOf.get(id)?.name ?? "");
    rows[key] = {
      kind: "people",
      label: ids.length > 1 ? `Shared: ${joinNames(names)}` : names[0],
      color: ids.length > 1 ? SHARED_COLOR : colors[ids[0]],
    };
  }

  const openCountry = openKey ? countryByKey(openKey) : undefined;
  const visitors = (openKey ? visitorsByKey[openKey] ?? [] : []).flatMap((id) => {
    const p = personOf.get(id);
    return p ? [{ name: p.name, color: p.color }] : [];
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <CountriesMap
          fills={fills}
          onPick={setOpenKey}
          legend={legend}
          mapRef={mapRef}
          onReadyChange={setMapReady}
          label={`World map of countries visited by ${joinNames(people.map((p) => p.name))}`}
          {...view}
        />
        <ShareMapButton
          mapRef={mapRef}
          fills={shareFills}
          subject={{ kind: "group" }}
          stats={countryStats(anyone)}
          ready={mapReady}
        />
      </div>
      <CountryStatsPanel
        mode="multi"
        people={people.map((p) => ({ name: p.name, color: p.color, count: counts.perPerson[p.id] ?? 0 }))}
        shared={counts.shared}
        total={counts.total}
      />
      <CountryList rows={rows} onOpen={setOpenKey} />
      {openCountry && (
        <VisitorsCard
          key={openCountry.key}
          country={openCountry}
          visitors={visitors}
          onClose={() => setOpenKey(null)}
        />
      )}
    </div>
  );
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
  view,
}: Extract<CountriesViewProps, { mode: "single" }> & { view: MapView }) {
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
  // with the error text, or null on success. onSuccess runs inside the same
  // transition, so its state change commits together with the fresh marks.
  function run(
    change: MarkChange | null,
    action: () => Promise<CountryActionResult>,
    onSuccess?: () => void,
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
          // After an await, a state update joins the transition only when
          // wrapped again (React 19 async transitions).
          if (onSuccess) startTransition(onSuccess);
          resolve(null);
        } catch {
          resolve(FALLBACK);
        }
      });
    });
  }

  // Nothing with a year or a visible note is removed without the person
  // seeing it first. A bare mark goes at once. `confirmed` tells the server
  // the dialog was shown and accepted; without it the server refuses a row
  // that has a year or a note this page did not show.
  function confirmRemove(key: string): Promise<{ go: boolean; confirmed: boolean }> {
    const mark = byKey.get(key);
    if (!mark || !needsRemoveConfirm(mark)) return Promise.resolve({ go: true, confirmed: false });
    return new Promise((resolve) =>
      setConfirm({
        country: countryByKey(key)?.name ?? key,
        year: typeof mark.year === "number",
        note: typeof mark.note === "string" && mark.note !== "",
        resolve: (ok) => resolve({ go: ok, confirmed: ok }),
      }),
    );
  }

  function closeConfirm(ok: boolean) {
    confirm?.resolve(ok);
    setConfirm(null);
  }

  const byKey = new Map(shown.filter((m) => m.status !== "dismissed").map((m) => [m.countryKey, m]));
  const visitedKeys = shown.filter((m) => m.status === "visited").map((m) => m.countryKey);

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
    const { go, confirmed } = await confirmRemove(key);
    if (!go) return;
    const err = await run({ key, mark: null }, () => removeCountry(person.id, key, confirmed));
    if (err) toastError(err);
  }

  // Remove from the card waits for the server: deleting a year and a note is
  // not rendered optimistically (frontend-ui-patterns STA-09). On success the
  // card closes in the same transition as the revalidated marks, so the fill
  // and the card go together. A refusal is shown as a toast.
  async function removeFromCard(key: string): Promise<void> {
    const { go, confirmed } = await confirmRemove(key);
    if (!go) return;
    const err = await run(null, () => removeCountry(person.id, key, confirmed), () => setOpenKey(null));
    if (err) toastError(err);
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

  // A tap only opens the card. Nothing is stored until "Visited" or "Want to
  // go" is pressed there (or a list checkbox is ticked).
  const pick = (key: string) => setOpenKey(key);
  // On screen an editor also sees the wishlist; the share button keeps only
  // the visited fills for the image (shareFills).
  const fills = fillsForMarks(shown);
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
          legend={legendFor(fills)}
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
