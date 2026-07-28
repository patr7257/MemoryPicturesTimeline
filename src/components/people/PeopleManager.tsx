"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { createPerson, deletePerson, renamePerson } from "@/actions/people";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Person = { id: string; name: string };

export function PeopleManager({ people }: { people: Person[] }) {
  const [pending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

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

  function remove(p: Person) {
    if (!confirm(`Remove ${p.name}? Their trip tags disappear too.`)) return;
    startTransition(async () => {
      await deletePerson(p.id);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={add} className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add a family member..."
        />
        <Button type="submit" disabled={pending || !newName.trim()}>
          <Plus data-icon="inline-start" />
          Add
        </Button>
      </form>

      <ul className="flex flex-col gap-2">
        {people.map((p) => (
          <li key={p.id} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
            {editingId === p.id ? (
              <>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-7"
                  autoFocus
                />
                <Button variant="ghost" size="icon-sm" onClick={() => saveRename(p.id)} aria-label="Save">
                  <Check />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => setEditingId(null)} aria-label="Cancel">
                  <X />
                </Button>
              </>
            ) : (
              <>
                <span className="font-hand text-xl">{p.name}</span>
                <span className="ml-auto" />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    setEditingId(p.id);
                    setEditName(p.name);
                  }}
                  aria-label={`Rename ${p.name}`}
                >
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => remove(p)} aria-label={`Delete ${p.name}`}>
                  <Trash2 />
                </Button>
              </>
            )}
          </li>
        ))}
        {people.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nobody yet. Add the family so trips can be tagged with who was along.
          </p>
        )}
      </ul>
    </div>
  );
}
