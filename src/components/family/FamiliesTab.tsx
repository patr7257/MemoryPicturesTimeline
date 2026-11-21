"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { createFamily, deleteFamily, renameFamily, setFamilyPeople } from "@/actions/family";
import { FamilyChecks } from "@/components/family/FamilyChecks";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FAMILY_NAME_MAX, peopleWithoutFamily } from "@/lib/family-admin";
import type { FamilyWithMembers } from "@/lib/family-queries";
import type { AdminPerson } from "@/lib/member-queries";

const btn = "h-11 sm:h-8";
const iconBtn = "size-11 sm:size-7";
const inputCls = "h-11 text-base sm:h-8 sm:text-xs";

function sameSet(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

function FamilyCard({
  family,
  people,
  onDelete,
}: {
  family: FamilyWithMembers;
  people: AdminPerson[];
  onDelete: (f: FamilyWithMembers) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(family.name);
  const [picked, setPicked] = useState<string[]>(family.memberIds);
  const dirty = !sameSet(picked, family.memberIds);

  function saveName(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await renameFamily(family.id, name);
      if (res.ok) setRenaming(false);
      else toast.error(res.error);
    });
  }

  function savePeople() {
    startTransition(async () => {
      const res = await setFamilyPeople(family.id, picked);
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
            maxLength={FAMILY_NAME_MAX}
            aria-label={`New name for ${family.name}`}
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
              setName(family.name);
            }}
          >
            <X />
          </Button>
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <h3 className="font-hand min-w-0 flex-1 truncate text-xl">{family.name}</h3>
          <Button
            variant="ghost"
            className={iconBtn}
            onClick={() => setRenaming(true)}
            aria-label={`Rename ${family.name}`}
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            className={iconBtn}
            onClick={() => onDelete(family)}
            aria-label={`Delete ${family.name}`}
          >
            <Trash2 />
          </Button>
        </div>
      )}
      <FamilyChecks
        legend={`People in ${family.name}`}
        options={people}
        selected={picked}
        disabled={pending}
        onChange={setPicked}
      />
      {dirty && (
        <div className="flex gap-2">
          <Button className={btn} disabled={pending} onClick={savePeople}>
            Save people
          </Button>
          <Button variant="outline" className={btn} onClick={() => setPicked(family.memberIds)}>
            Cancel
          </Button>
        </div>
      )}
    </li>
  );
}

export function FamiliesTab({
  families,
  people,
  colors,
}: {
  families: FamilyWithMembers[];
  people: AdminPerson[];
  colors: Record<string, string>;
}) {
  const [pending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState<FamilyWithMembers | null>(null);
  const lonely = new Set(peopleWithoutFamily(people));

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    startTransition(async () => {
      const res = await createFamily(newName);
      if (res.ok) {
        toast.success(`${newName.trim()} created`);
        setNewName("");
      } else toast.error(res.error);
    });
  }

  function confirmDelete() {
    const f = deleting;
    if (!f) return;
    startTransition(async () => {
      const res = await deleteFamily(f.id);
      setDeleting(null);
      if (res.ok) toast.success(`${f.name} deleted`);
      else toast.error(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-6 text-sm">
      <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          maxLength={FAMILY_NAME_MAX}
          placeholder="Name of a new family..."
          aria-label="Name of the family to create"
          className={inputCls}
        />
        <Button type="submit" className={btn} disabled={pending || !newName.trim()}>
          <Plus data-icon="inline-start" />
          Create family
        </Button>
      </form>

      {families.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-muted-foreground">
          No families yet. Create one above, then pick who is in it.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {families.map((f) => (
            // The key holds the saved state so a saved change resets the card.
            <FamilyCard
              key={`${f.id}:${f.name}:${f.memberIds.join(",")}`}
              family={f}
              people={people}
              onDelete={setDeleting}
            />
          ))}
        </ul>
      )}

      <section aria-labelledby="no-family-heading" className="flex flex-col gap-2">
        <h2 id="no-family-heading" className="font-hand text-2xl">
          People in no family
        </h2>
        {lonely.size === 0 ? (
          <p className="text-muted-foreground">Everyone is in a family.</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              They see only themselves until you add them to a family.
            </p>
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {people
                .filter((p) => lonely.has(p.id))
                .map((p) => (
                  <li key={p.id} className="flex items-center gap-2 text-base">
                    <PersonDot hex={colors[p.id]} />
                    {p.name}
                  </li>
                ))}
            </ul>
          </>
        )}
      </section>

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The people in it stay. They just stop being grouped as {deleting?.name}, so the
              others in it no longer see them through this family.
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
              Delete family
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
