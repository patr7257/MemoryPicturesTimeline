"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, GalleryHorizontal, Images, Pencil, Plus, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

import { createPerson, deletePerson, renamePerson } from "@/actions/people";
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
import type { PersonView } from "@/lib/member-queries";

const btn = "h-11 sm:h-8";
const iconBtn = "size-11 sm:size-7";

export function PeopleManager({
  people,
  isAdmin,
}: {
  people: PersonView[];
  isAdmin: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleting, setDeleting] = useState<PersonView | null>(null);

  function add(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    startTransition(async () => {
      await createPerson(name);
      setNewName("");
      toast.success(`${name} added`);
    });
  }

  function saveRename(id: string) {
    const name = editName.trim();
    if (!name) return;
    startTransition(async () => {
      await renamePerson(id, name);
      setEditingId(null);
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
    <div className="flex flex-col gap-6">
      <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add a family member..."
          aria-label="Name of the person to add"
          className="h-11 text-base sm:h-8 sm:text-xs"
        />
        <Button type="submit" className={btn} disabled={pending || !newName.trim()}>
          <Plus data-icon="inline-start" />
          Add
        </Button>
      </form>

      <ul className="flex flex-col gap-2">
        {people.map((p) => (
          <li key={p.id} className="flex flex-col gap-2 rounded-lg border bg-card p-3">
            {editingId === p.id ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  aria-label={`New name for ${p.name}`}
                  className="h-11 text-base sm:h-8 sm:text-xs"
                  autoFocus
                />
                <Button
                  variant="ghost"
                  className={iconBtn}
                  onClick={() => saveRename(p.id)}
                  aria-label="Save"
                >
                  <Check />
                </Button>
                <Button
                  variant="ghost"
                  className={iconBtn}
                  onClick={() => setEditingId(null)}
                  aria-label="Cancel"
                >
                  <X />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="font-hand min-w-0 flex-1 truncate text-xl">{p.name}</span>
                {p.hasLogin ? (
                  <Badge variant="secondary">Has login</Badge>
                ) : (
                  <Badge variant="outline">No login</Badge>
                )}
                {isAdmin && (
                  <>
                    <Button
                      variant="ghost"
                      className={iconBtn}
                      onClick={() => {
                        setEditingId(p.id);
                        setEditName(p.name);
                      }}
                      aria-label={`Rename ${p.name}`}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      className={iconBtn}
                      onClick={() => setDeleting(p)}
                      aria-label={`Delete ${p.name}`}
                    >
                      <Trash2 />
                    </Button>
                  </>
                )}
              </div>
            )}

            {isAdmin && p.logins.length > 0 && (
              <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                {p.logins.map((l) => (
                  <li key={l.email} className="break-all">
                    {l.email} ({l.status === "active" ? "Active" : "Invited"})
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className={btn}
                nativeButton={false}
                render={<Link href={{ pathname: "/timeline", query: { person: p.id } }} />}
              >
                <Images data-icon="inline-start" />
                Timeline
              </Button>
              <Button
                variant="outline"
                className={btn}
                nativeButton={false}
                render={<Link href={{ pathname: "/slideshow", query: { person: p.id } }} />}
              >
                <GalleryHorizontal data-icon="inline-start" />
                Slideshow
              </Button>
              {isAdmin && !p.hasLogin && (
                <Button
                  className={btn}
                  nativeButton={false}
                  render={<Link href={{ pathname: "/members", query: { invite: p.id } }} />}
                >
                  <UserPlus data-icon="inline-start" />
                  Invite
                </Button>
              )}
            </div>
          </li>
        ))}
        {people.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nobody yet. Add the family so trips can be tagged with who was along.
          </p>
        )}
      </ul>

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Their trip tags disappear too.
              {deleting?.hasLogin
                ? " They still have a login: remove it on the Members page first."
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
