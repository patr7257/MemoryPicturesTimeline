"use client";

// The /vacations overview: summary strip, toolbar (search, person, year, sort,
// view) and the list as cards or a table. Filter, sort and view live in the
// URL query string and are written with the History API, so typing never
// causes a server round trip and the back button steps through the changes.
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "motion/react";
import { LayoutGrid, Plane, Plus, Rows3, Search, X } from "lucide-react";
import { toast } from "sonner";

import { deleteTrip } from "@/actions/trips";
import {
  SORT_KEYS,
  SORT_LABELS,
  applyViewState,
  availableYears,
  computeStats,
  formatYearSpan,
  hasActiveFilters,
  parseViewState,
  serializeViewState,
  type SortKey,
  type ViewMode,
  type ViewState,
  type VacationListItem,
} from "@/lib/vacations-view";
import type { PersonRef } from "@/lib/queries";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { QuickEditVacation } from "./QuickEditVacation";
import { ResponsiveDialog } from "./ResponsiveDialog";
import { VacationForm } from "./VacationForm";
import { VacationCard, VacationRow } from "./VacationItems";

const SELECT =
  "h-11 w-full min-w-0 border border-input bg-card px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 md:h-8 md:w-auto md:text-xs";

export function VacationsOverview({
  vacations,
  people,
  viewerPersonId,
}: {
  vacations: VacationListItem[];
  people: PersonRef[];
  viewerPersonId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const state = useMemo(() => parseViewState(searchParams), [searchParams]);

  // The search box keeps its own text so typing is instant; the URL follows.
  const [qInput, setQInput] = useState(state.q);
  const [seenUrlQ, setSeenUrlQ] = useState(state.q);
  if (state.q !== seenUrlQ) {
    // The URL changed from outside (back button): adopt it.
    setSeenUrlQ(state.q);
    if (state.q !== qInput.trim()) setQInput(state.q);
  }

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<VacationListItem | null>(null);
  const [deleting, setDeleting] = useState<VacationListItem | null>(null);
  const [deletePending, startDelete] = useTransition();

  function update(patch: Partial<ViewState>, mode: "push" | "replace" = "push") {
    const qs = serializeViewState({ ...state, ...patch });
    const url = qs ? `${pathname}?${qs}` : pathname;
    if (mode === "replace") window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
  }

  const effective: ViewState = { ...state, q: qInput };
  const shown = useMemo(() => applyViewState(vacations, effective), [vacations, qInput, state]); // eslint-disable-line react-hooks/exhaustive-deps
  const stats = useMemo(() => computeStats(vacations), [vacations]);
  const years = useMemo(() => availableYears(vacations), [vacations]);
  const taggedPeople = useMemo(() => {
    const seen = new Map<string, PersonRef>();
    for (const v of vacations) for (const p of v.people) seen.set(p.id, p);
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, "en"));
  }, [vacations]);
  const filtered = hasActiveFilters(effective);

  function clearFilters() {
    setQInput("");
    update({ q: "", person: null, year: null });
  }

  function confirmDelete() {
    const target = deleting;
    if (!target) return;
    startDelete(async () => {
      try {
        await deleteTrip(target.id);
        toast.success(`Deleted "${target.title}"`);
        setDeleting(null);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not delete the vacation");
      }
    });
  }

  const handlers = { onQuickEdit: setEditing, onDelete: setDeleting };

  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div>
            <h1 className="font-hand text-4xl leading-none sm:text-5xl">Vacations</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Every vacation you can see, with the details to find and edit them.
            </p>
          </div>
          <Button onClick={() => setCreating(true)} className="h-11 px-4 md:h-8 md:px-2.5">
            <Plus />
            New vacation
          </Button>
        </header>

        {vacations.length === 0 ? (
          <EmptyAll onCreate={() => setCreating(true)} />
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
              <Stat label="Vacations" value={String(stats.count)} />
              <Stat label="Photos" value={stats.photos.toLocaleString("en-GB")} />
              <Stat label="Years" value={formatYearSpan(stats)} />
              <Stat label="Places" value={String(stats.places)} />
            </dl>

            <div role="search" className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
              <div className="relative md:w-72">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  type="search"
                  value={qInput}
                  onChange={(e) => {
                    setQInput(e.target.value);
                    update({ q: e.target.value }, "replace");
                  }}
                  placeholder="Search title, place or notes"
                  aria-label="Search vacations"
                  className="h-11 bg-card pl-9 text-base md:h-8 md:text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2 md:flex md:items-center">
                <select
                  aria-label="Filter by person"
                  value={state.person ?? ""}
                  onChange={(e) => update({ person: e.target.value || null })}
                  className={SELECT}
                >
                  <option value="">Everyone</option>
                  {taggedPeople.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Filter by year"
                  value={state.year ?? ""}
                  onChange={(e) => update({ year: e.target.value ? Number(e.target.value) : null })}
                  className={SELECT}
                >
                  <option value="">All years</option>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Sort"
                  value={state.sort}
                  onChange={(e) => update({ sort: e.target.value as SortKey })}
                  className={cn(SELECT, "col-span-2 md:col-span-1")}
                >
                  {SORT_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {SORT_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
              <ViewSwitch value={state.view} onChange={(view) => update({ view })} />
            </div>

            <p className="flex min-h-6 flex-wrap items-center gap-x-3 text-sm text-muted-foreground" aria-live="polite">
              <span>
                Showing {shown.length} of {vacations.length}
              </span>
              {filtered && (
                <Button variant="link" size="sm" onClick={clearFilters} className="h-auto px-0 text-sm">
                  <X />
                  Clear filters
                </Button>
              )}
            </p>

            {shown.length === 0 ? (
              <NoMatches onClear={clearFilters} />
            ) : (
              <LayoutGroup>
                {/* Cards: always on phones, and everywhere when chosen. */}
                <ul
                  className={cn(
                    "grid grid-cols-1 gap-4 min-[600px]:grid-cols-2 lg:grid-cols-3",
                    state.view === "table" && "md:hidden",
                  )}
                >
                  <AnimatePresence>
                    {shown.map((trip, i) => (
                      <VacationCard key={trip.id} trip={trip} index={i} {...handlers} />
                    ))}
                  </AnimatePresence>
                </ul>

                {/* Table: md and up, the default there. */}
                {state.view === "table" && (
                  <div className="hidden overflow-x-auto border border-border bg-card shadow-[0_2px_10px_var(--paper-shadow)] md:block">
                    <table className="w-full border-collapse text-left">
                      <caption className="sr-only">Vacations</caption>
                      <thead>
                        <tr className="border-b border-border bg-muted/60 text-xs text-muted-foreground">
                          <th scope="col" className="px-3 py-2 font-medium">
                            <span className="sr-only">Cover</span>
                          </th>
                          <th scope="col" className="px-3 py-2 font-medium">Vacation</th>
                          <th scope="col" className="px-3 py-2 font-medium">Dates</th>
                          <th scope="col" className="px-3 py-2 font-medium">Length</th>
                          <th scope="col" className="px-3 py-2 font-medium">Place</th>
                          <th scope="col" className="px-3 py-2 font-medium">People</th>
                          <th scope="col" className="px-3 py-2 font-medium">Photos</th>
                          <th scope="col" className="px-3 py-2 text-right font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shown.map((trip) => (
                          <VacationRow key={trip.id} trip={trip} {...handlers} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </LayoutGroup>
            )}
          </>
        )}
      </div>

      <ResponsiveDialog
        open={creating}
        onOpenChange={setCreating}
        title="New vacation"
        description="Tag who was there. They will be able to see it."
      >
        {creating && (
          <VacationForm
            people={people}
            viewerPersonId={viewerPersonId}
            onCreated={(id) => router.push(`/trips/${id}`)}
            onCancel={() => setCreating(false)}
          />
        )}
      </ResponsiveDialog>

      <QuickEditVacation trip={editing} people={people} onClose={() => setEditing(null)} />

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !deletePending) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this vacation?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleting?.title}&quot; and its {deleting?.photoCount ?? 0} photo
              {deleting?.photoCount === 1 ? "" : "s"} will be removed for everyone. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending} className="h-11 md:h-8">
              Keep it
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deletePending}
              onClick={confirmDelete}
              className="h-11 md:h-8"
            >
              {deletePending ? "Deleting..." : "Delete vacation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MotionConfig>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="border border-border bg-card px-3 py-2.5 shadow-[0_1px_6px_var(--paper-shadow)]"
    >
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-hand text-3xl leading-tight">{value}</dd>
    </motion.div>
  );
}

// Table or cards. Hidden on phones: they always get cards.
function ViewSwitch({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  const item = (mode: ViewMode, label: string, icon: React.ReactNode) => (
    <Button
      type="button"
      variant={value === mode ? "default" : "outline"}
      size="sm"
      aria-pressed={value === mode}
      onClick={() => onChange(mode)}
      className="h-8"
    >
      {icon}
      {label}
    </Button>
  );
  return (
    <div role="group" aria-label="View" className="hidden gap-1 md:ml-auto md:flex">
      {item("table", "Table", <Rows3 />)}
      {item("cards", "Cards", <LayoutGrid />)}
    </div>
  );
}

function EmptyAll({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <Plane className="size-10 text-muted-foreground" aria-hidden />
      <p className="font-hand mt-4 text-3xl">No vacations yet.</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Vacations show up here when you create one, or when someone tags you in theirs.
      </p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Button size="lg" onClick={onCreate} className="h-11 md:h-9">
          <Plus />
          New vacation
        </Button>
        <Button
          size="lg"
          variant="outline"
          nativeButton={false}
          render={<Link href="/upload" />}
          className="h-11 md:h-9"
        >
          Add photos
        </Button>
      </div>
    </section>
  );
}

function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <section className="mx-auto flex max-w-md flex-col items-center py-14 text-center">
      <Search className="size-9 text-muted-foreground" aria-hidden />
      <p className="font-hand mt-4 text-3xl">No vacations match these filters.</p>
      <p className="mt-2 text-sm text-muted-foreground">Try a different search, or start over.</p>
      <Button variant="outline" onClick={onClear} className="mt-5 h-11 md:h-8">
        Clear filters
      </Button>
    </section>
  );
}
