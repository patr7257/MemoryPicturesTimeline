"use client";

import { useState } from "react";
import { Check, Fingerprint, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { deviceHint, formatAdded, isLastPasskey, passkeyLabel } from "@/lib/passkeys";
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

type Row = {
  id: string;
  name?: string | undefined;
  createdAt: Date | string;
  deviceType: string;
  backedUp: boolean;
};

export function PasskeyManager() {
  // The hook refetches itself after add, rename and delete (plugin signals).
  const { data, isPending } = authClient.useListPasskeys();
  const passkeys: Row[] = data ?? [];

  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [removing, setRemoving] = useState(false);

  // Runs directly in the click handler (WebAuthn user-gesture requirement:
  // no await before the passkey call).
  function addPasskey() {
    setAdding(true);
    const name = newName.trim();
    void authClient.passkey
      .addPasskey(name ? { name } : undefined)
      .then((res) => {
        if (res?.error) {
          toast.error("Could not add a passkey on this device.");
        } else {
          setNewName("");
          toast.success("Passkey added. Next time, sign in with one tap.");
        }
      })
      .finally(() => setAdding(false));
  }

  function startEdit(row: Row) {
    setEditingId(row.id);
    setDraft(row.name?.trim() ?? "");
  }

  async function saveEdit(id: string) {
    const name = draft.trim();
    if (!name) return;
    setSaving(true);
    const res = await authClient.passkey.updatePasskey({ id, name });
    setSaving(false);
    if (res.error) {
      toast.error("Could not rename the passkey.");
    } else {
      setEditingId(null);
      toast.success("Passkey renamed.");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setRemoving(true);
    const res = await authClient.passkey.deletePasskey({ id: deleting.id });
    setRemoving(false);
    if (res.error) {
      toast.error("Could not delete the passkey.");
    } else {
      toast.success("Passkey deleted.");
      setDeleting(null);
    }
  }

  const last = isLastPasskey(passkeys.length);

  return (
    <div className="space-y-4">
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading passkeys...</p>
      ) : passkeys.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          A passkey lets you sign in with your fingerprint, face or screen lock instead of waiting
          for an email link. Add one on each device you use.
        </p>
      ) : (
        <ul className="divide-y divide-border border border-border bg-card">
          {passkeys.map((row) => {
            const hint = deviceHint(row.deviceType, row.backedUp);
            const added = formatAdded(row.createdAt);
            return (
              <li key={row.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                <Fingerprint className="size-5 shrink-0 text-muted-foreground" />
                {editingId === row.id ? (
                  <form
                    className="flex min-w-0 flex-1 items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveEdit(row.id);
                    }}
                  >
                    <Input
                      autoFocus
                      aria-label="Passkey name"
                      value={draft}
                      maxLength={60}
                      onChange={(e) => setDraft(e.target.value)}
                      className="h-9"
                    />
                    <Button
                      type="submit"
                      size="icon"
                      aria-label="Save name"
                      disabled={saving || !draft.trim()}
                    >
                      <Check />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Cancel rename"
                      onClick={() => setEditingId(null)}
                    >
                      <X />
                    </Button>
                  </form>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{passkeyLabel(row.name)}</p>
                      <p className="text-xs text-muted-foreground">
                        {[added && `Added ${added}`, hint].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-11 md:size-8"
                      aria-label={`Rename ${passkeyLabel(row.name)}`}
                      onClick={() => startEdit(row)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-11 md:size-8"
                      aria-label={`Delete ${passkeyLabel(row.name)}`}
                      onClick={() => setDeleting(row)}
                    >
                      <Trash2 />
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Name for the new passkey (optional)"
          placeholder="Name, e.g. Anna's iPhone (optional)"
          value={newName}
          maxLength={60}
          onChange={(e) => setNewName(e.target.value)}
          className="h-10 min-w-0 flex-1 basis-48"
        />
        <Button className="h-10" onClick={addPasskey} disabled={adding}>
          <Fingerprint data-slot="icon" />
          Add passkey
        </Button>
      </div>

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleting ? passkeyLabel(deleting.name) : "passkey"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {last
                ? "This is your last passkey. You will sign in by email link until you add a new one."
                : "You will no longer be able to sign in with it on that device."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={removing}
              onClick={() => void confirmDelete()}
            >
              {removing ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
