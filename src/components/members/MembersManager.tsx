"use client";

import { useRef, useState, useTransition } from "react";
import { Link2, Mail, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { removeMember, resendInvite, updateMember } from "@/actions/members";
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
import { InviteForm } from "@/components/members/InviteForm";
import type { LoginEntry } from "@/lib/members";

type Person = { id: string; name: string };
type MemberEntry = Extract<LoginEntry, { kind: "member" }>;

const btn = "h-11 sm:h-8";
const selectClass =
  "h-11 w-full border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:text-sm";

function StatusBadge({ entry }: { entry: LoginEntry }) {
  if (entry.status === "invited") return <Badge variant="outline">Invited</Badge>;
  const n = entry.passkeyCount;
  return (
    <Badge variant="secondary">
      Active{n > 0 ? `, ${n} passkey${n === 1 ? "" : "s"}` : ""}
    </Badge>
  );
}

export function MembersManager({
  logins,
  people,
  viewerEmail,
  invitePersonId,
}: {
  logins: LoginEntry[];
  people: Person[];
  viewerEmail: string;
  invitePersonId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLDivElement>(null);
  // The key remounts the form so a new prefill takes effect.
  const [form, setForm] = useState({
    key: 0,
    personId: invitePersonId,
    email: "",
    sendEmail: true,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("member");
  const [editPerson, setEditPerson] = useState("");
  const [removing, setRemoving] = useState<MemberEntry | null>(null);

  const members = logins.filter((l): l is MemberEntry => l.kind === "member");
  const configLogins = logins.filter((l) => l.kind !== "member");
  const isSelf = (email: string) => email.toLowerCase() === viewerEmail.toLowerCase();

  function linkConfigLogin(email: string) {
    setForm((f) => ({ key: f.key + 1, personId: null, email, sendEmail: false }));
    formRef.current?.scrollIntoView({ block: "start" });
  }

  function resend(m: MemberEntry) {
    startTransition(async () => {
      const res = await resendInvite(m.id);
      if (res.ok) toast.success(`Invite sent to ${m.email}`);
      else toast.error(res.error);
    });
  }

  function saveEdit(m: MemberEntry) {
    startTransition(async () => {
      const res = await updateMember({ id: m.id, role: editRole, personId: editPerson });
      if (res.ok) {
        toast.success("Saved");
        setEditingId(null);
      } else toast.error(res.error);
    });
  }

  function confirmRemove() {
    const m = removing;
    if (!m) return;
    startTransition(async () => {
      const res = await removeMember(m.id);
      setRemoving(null);
      if (res.ok) toast.success(`${m.email} removed`);
      else toast.error(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div ref={formRef} className="scroll-mt-24">
        <InviteForm
          key={form.key}
          people={people}
          initialPersonId={form.personId}
          prefillEmail={form.email}
          defaultSendEmail={form.sendEmail}
          onDone={() =>
            setForm((f) => ({ key: f.key + 1, personId: null, email: "", sendEmail: true }))
          }
        />
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="members-heading">
        <h2 id="members-heading" className="font-hand text-2xl">
          Members
        </h2>
        {members.length === 0 && (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No members yet. Start with the form above: choose who they are in People (or create
            them), then enter their email. They can then request a sign-in link on the login page
            and add a passkey.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {members.map((m) => {
            const self = isSelf(m.email);
            const editing = editingId === m.id;
            return (
              <li key={m.id} className="flex flex-col gap-3 rounded-lg border bg-card p-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-hand text-xl">{m.personName}</span>
                  <Badge variant={m.role === "super_admin" ? "default" : "secondary"}>
                    {m.role === "super_admin" ? "Super admin" : "Member"}
                  </Badge>
                  <StatusBadge entry={m} />
                  {self && <Badge variant="outline">You</Badge>}
                </div>
                <p className="min-w-0 text-sm break-all text-muted-foreground">{m.email}</p>

                {editing ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <label className="flex flex-1 flex-col gap-1 text-xs">
                      Person
                      <select
                        value={editPerson}
                        onChange={(e) => setEditPerson(e.target.value)}
                        className={selectClass}
                      >
                        {people.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-1 flex-col gap-1 text-xs">
                      Role
                      <select
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value)}
                        disabled={self}
                        className={selectClass}
                      >
                        <option value="member">Member</option>
                        <option value="super_admin">Super admin</option>
                      </select>
                    </label>
                    <Button className={btn} disabled={pending} onClick={() => saveEdit(m)}>
                      Save
                    </Button>
                    <Button variant="outline" className={btn} onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      className={btn}
                      disabled={pending}
                      onClick={() => resend(m)}
                    >
                      <Mail data-icon="inline-start" />
                      Resend invite
                    </Button>
                    <Button
                      variant="outline"
                      className={btn}
                      onClick={() => {
                        setEditingId(m.id);
                        setEditRole(m.role);
                        setEditPerson(m.personId);
                      }}
                    >
                      <Pencil data-icon="inline-start" />
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      className={btn}
                      disabled={self}
                      onClick={() => setRemoving(m)}
                      aria-label={`Remove ${m.email}`}
                    >
                      <Trash2 data-icon="inline-start" />
                      Remove
                    </Button>
                  </div>
                )}
                {self && (
                  <p className="text-xs text-muted-foreground">
                    This is your own login. You cannot remove or demote it, so you cannot lock
                    yourself out.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {configLogins.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="config-heading">
          <h2 id="config-heading" className="font-hand text-2xl">
            Logins from server config
          </h2>
          <p className="text-xs text-muted-foreground">
            These can sign in but are not in the member list. They are read-only here: link one to
            a person to manage it in the app.
          </p>
          <ul className="flex flex-col gap-2">
            {configLogins.map((c) => (
              <li
                key={c.email}
                className="flex flex-col gap-2 rounded-lg border border-dashed bg-card p-3 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-sm break-all">{c.email}</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">
                      {c.kind === "config_super_admin"
                        ? "Super admin from server config"
                        : "Legacy allowlist, not linked to a person"}
                    </Badge>
                    <StatusBadge entry={c} />
                  </div>
                </div>
                <Button variant="outline" className={btn} onClick={() => linkConfigLogin(c.email)}>
                  <Link2 data-icon="inline-start" />
                  Link to a person
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <AlertDialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {removing?.personName} ({removing?.email})?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They lose access straight away and are signed out everywhere. Their photos and
              comments stay. You can invite them again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={btn}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className={btn}
              disabled={pending}
              onClick={confirmRemove}
            >
              Remove login
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
