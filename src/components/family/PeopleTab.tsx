"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Palette, Pencil, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

import {
  assignMissingColors,
  deletePerson,
  renamePerson,
  setPersonColor,
  setPersonFamilies,
} from "@/actions/family";
import { AddOrInviteForm } from "@/components/family/AddOrInviteForm";
import { ColorSwatches } from "@/components/family/ColorSwatches";
import { FamilyChecks } from "@/components/family/FamilyChecks";
import { LoginsList } from "@/components/family/LoginsList";
import { PersonDot } from "@/components/family/PersonDot";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NO_FAMILY,
  defaultFilter,
  filterForPerson,
  initialFilter,
  loginsForFilter,
  peopleForFilter,
  resolveFilter,
} from "@/lib/family-admin";
import { cn } from "@/lib/utils";
import type { FamilyWithMembers } from "@/lib/family-queries";
import type { AdminPerson } from "@/lib/member-queries";
import type { LoginEntry } from "@/lib/members";
import { isPaletteKey } from "@/lib/person-colors";
import { soleTripsNote } from "@/lib/share-rules";

const FILTER_PARAM = "family";
const btn = "h-11 sm:h-8";
const iconBtn = "size-11 sm:size-7";
const inputCls = "h-11 text-base sm:h-8 sm:text-xs";

function sameSet(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

function PersonCard({
  person,
  families,
  takenKeys,
  hex,
  onDelete,
  onInvite,
}: {
  person: AdminPerson;
  families: FamilyWithMembers[];
  takenKeys: ReadonlySet<string>;
  hex: string;
  onDelete: (p: AdminPerson) => void;
  onInvite: (personId: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(person.name);
  const [picked, setPicked] = useState<string[]>(person.familyIds);
  const dirty = !sameSet(picked, person.familyIds);
  const hasLogin = person.logins.length > 0;

  function saveName(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await renamePerson(person.id, name);
      if (res.ok) setRenaming(false);
      else toast.error(res.error);
    });
  }

  function pickColor(key: string | null) {
    startTransition(async () => {
      const res = await setPersonColor(person.id, key);
      if (!res.ok) toast.error(res.error);
    });
  }

  function saveFamilies() {
    startTransition(async () => {
      const res = await setPersonFamilies(person.id, picked);
      if (res.ok) toast.success("Saved");
      else toast.error(res.error);
    });
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border bg-card p-3">
      {renaming ? (
        <form onSubmit={saveName} className="flex items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label={`New name for ${person.name}`}
            className={inputCls}
            autoFocus
          />
          <Button
            type="submit"
            variant="ghost"
            className={iconBtn}
            disabled={pending}
            aria-label="Save name"
          >
            <Check />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={iconBtn}
            aria-label="Cancel"
            onClick={() => {
              setRenaming(false);
              setName(person.name);
            }}
          >
            <X />
          </Button>
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <PersonDot hex={hex} className="size-4" />
          <h3 className="font-hand min-w-0 flex-1 truncate text-xl">{person.name}</h3>
          {hasLogin ? (
            <Badge variant="secondary">Has login</Badge>
          ) : (
            <Badge variant="outline">No login</Badge>
          )}
          <Button
            variant="ghost"
            className={iconBtn}
            onClick={() => setRenaming(true)}
            aria-label={`Rename ${person.name}`}
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            className={iconBtn}
            onClick={() => onDelete(person)}
            aria-label={`Delete ${person.name}`}
          >
            <Trash2 />
          </Button>
        </div>
      )}

      {hasLogin && (
        <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          {person.logins.map((l) => (
            <li key={l.email} className="break-all">
              {l.email} ({l.status === "active" ? "Active" : "Invited"})
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">
          Colour{!isPaletteKey(person.color) && " (none yet, a fallback is shown)"}
        </span>
        <ColorSwatches
          label={`Colour for ${person.name}`}
          current={isPaletteKey(person.color) ? person.color : null}
          takenKeys={takenKeys}
          disabled={pending}
          onPick={pickColor}
        />
      </div>

      <FamilyChecks
        legend={`Families of ${person.name}`}
        options={families}
        selected={picked}
        disabled={pending}
        onChange={setPicked}
      />
      {dirty && (
        <div className="flex gap-2">
          <Button className={btn} disabled={pending} onClick={saveFamilies}>
            Save families
          </Button>
          <Button variant="outline" className={btn} onClick={() => setPicked(person.familyIds)}>
            Cancel
          </Button>
        </div>
      )}

      {!hasLogin && (
        <div>
          <Button className={btn} onClick={() => onInvite(person.id)}>
            <UserPlus data-icon="inline-start" />
            Invite {person.name}
          </Button>
        </div>
      )}
    </li>
  );
}

export function PeopleTab({
  families,
  people,
  logins,
  colors,
  viewerEmail,
  invitePersonId,
}: {
  families: FamilyWithMembers[];
  people: AdminPerson[];
  logins: LoginEntry[];
  colors: Record<string, string>;
  viewerEmail: string;
  invitePersonId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLDivElement>(null);
  const [deleting, setDeleting] = useState<AdminPerson | null>(null);
  // The key remounts the form so a new prefill takes effect.
  const [form, setForm] = useState({
    key: 0,
    personId: invitePersonId,
    email: "",
    sendEmail: true,
  });
  // One family at a time, kept in the URL as ?family=<id|none>. The server
  // cannot see it for the first paint, so it is read right after mount.
  const [filter, setFilter] = useState(() =>
    initialFilter({ raw: null, invitePerson: invitePersonId, people, families }),
  );

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get(FILTER_PARAM);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the query only exists in the browser
    setFilter(initialFilter({ raw, invitePerson: invitePersonId, people, families }));
    // Only on mount: later changes come from the chips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A deleted family cannot stay selected.
  const activeFilter = resolveFilter(filter, families) ?? defaultFilter(families, people);
  const shown = peopleForFilter(people, activeFilter);
  const shownIds = new Set(shown.map((p) => p.id));
  const shownLogins = loginsForFilter(logins, shownIds, activeFilter);
  const activeName =
    activeFilter === NO_FAMILY ? "No family" : (families.find((f) => f.id === activeFilter)?.name ?? "");

  const familyOptions = families.map((f) => ({ id: f.id, name: f.name }));
  const personOptions = people.map((p) => ({ id: p.id, name: p.name }));
  const missingColors = people.filter((p) => !isPaletteKey(p.color)).length;

  function chooseFilter(next: string) {
    setFilter(next);
    const url = new URL(window.location.href);
    url.searchParams.set(FILTER_PARAM, next);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function startInvite(personId: string | null, email: string, sendEmail: boolean) {
    const person = personId ? people.find((p) => p.id === personId) : undefined;
    if (person) setFilter(filterForPerson(person, activeFilter));
    setForm((f) => ({ key: f.key + 1, personId, email, sendEmail }));
    formRef.current?.scrollIntoView({ block: "start" });
  }

  function giveColors() {
    startTransition(async () => {
      const res = await assignMissingColors();
      if (!res.ok) toast.error(res.error);
      else toast.success(res.assigned === 0 ? "Nobody could be given a colour" : `${res.assigned} given a colour`);
    });
  }

  function confirmDelete() {
    const p = deleting;
    if (!p) return;
    startTransition(async () => {
      const res = await deletePerson(p.id);
      setDeleting(null);
      if (res.ok) toast.success(`${p.name} removed`);
      else toast.error(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-8 text-sm">
      <div role="group" aria-label="Show one family" className="flex flex-wrap gap-2">
        {[...families.map((f) => ({ id: f.id, name: f.name })), { id: NO_FAMILY, name: "No family" }].map(
          (c) => {
            const on = c.id === activeFilter;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => chooseFilter(c.id)}
                className={cn(
                  "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm transition-colors sm:min-h-8 sm:px-3",
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {c.name}
              </button>
            );
          },
        )}
      </div>

      <div ref={formRef} className="scroll-mt-24">
        <AddOrInviteForm
          key={form.key}
          families={familyOptions}
          people={people}
          filter={activeFilter}
          initialPersonId={form.personId}
          prefillEmail={form.email}
          defaultSendEmail={form.sendEmail}
          onDone={() => startInvite(null, "", true)}
        />
      </div>

      <section aria-labelledby="people-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="people-heading" className="font-hand flex-1 text-2xl">
            People{activeName ? `: ${activeName}` : ""}
          </h2>
          {missingColors > 0 && (
            <Button variant="outline" className={btn} disabled={pending} onClick={giveColors}>
              <Palette data-icon="inline-start" />
              Give everyone a colour
            </Button>
          )}
        </div>
        {shown.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-muted-foreground">
            Nobody in {activeName || "this view"} yet. Add the first person above.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {shown.map((p) => (
              <PersonCard
                key={`${p.id}:${p.name}:${p.color}:${p.familyIds.join(",")}`}
                person={p}
                families={families}
                takenKeys={
                  new Set(
                    people
                      .filter((o) => o.id !== p.id && isPaletteKey(o.color))
                      .map((o) => o.color as string),
                  )
                }
                hex={colors[p.id]}
                onDelete={setDeleting}
                onInvite={(id) => startInvite(id, "", true)}
              />
            ))}
          </ul>
        )}
      </section>

      <LoginsList
        logins={shownLogins}
        people={personOptions}
        viewerEmail={viewerEmail}
        onLinkConfigLogin={(email) => startInvite(null, email, false)}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Their vacation tags and country marks disappear too.
              {deleting && deleting.soleTrips > 0
                ? ` ${soleTripsNote(deleting.name, deleting.soleTrips, deleting.soleTripPhotos)}`
                : ""}
              {deleting && deleting.logins.length > 0
                ? " They still have a login: remove it in the Logins list first."
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={btn}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className={btn}
              disabled={pending}
              onClick={confirmDelete}
            >
              Remove person
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
