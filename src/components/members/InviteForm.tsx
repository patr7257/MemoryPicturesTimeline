"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";

import { inviteMember } from "@/actions/members";
import { createPerson } from "@/actions/people";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const selectClass =
  "h-11 w-full border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:text-sm";
const inputClass = "h-11 text-base sm:h-9 sm:text-sm";

type Person = { id: string; name: string };

const NEW = "__new__";

// Step 1 is the person (existing or new), only then email and role. The
// server action rejects a missing person too.
export function InviteForm({
  people,
  initialPersonId,
  prefillEmail,
  defaultSendEmail,
  onDone,
}: {
  people: Person[];
  initialPersonId: string | null;
  prefillEmail: string;
  defaultSendEmail: boolean;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [choice, setChoice] = useState<string>(initialPersonId ?? "");
  const [newName, setNewName] = useState("");
  const [email, setEmail] = useState(prefillEmail);
  const [role, setRole] = useState("member");
  const [sendEmail, setSendEmail] = useState(defaultSendEmail);

  const creating = choice === NEW;
  const personReady = creating ? newName.trim().length > 0 : choice !== "";
  const canSubmit = personReady && email.trim().length > 0 && !pending;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    startTransition(async () => {
      try {
        let personId = choice;
        if (creating) {
          personId = (await createPerson(newName)).id;
          setChoice(personId);
        }
        const res = await inviteMember({ personId, email, role, sendEmail });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        if (res.mailSent === false) {
          toast.warning("Invited, but the mail could not be sent. Use Resend invite to try again.");
        } else {
          toast.success(res.mailSent ? "Invited, mail sent" : "Login added");
        }
        onDone();
      } catch {
        toast.error("Something went wrong. Try again.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      <h2 className="font-hand text-2xl">Invite someone</h2>

      <div className="flex flex-col gap-2">
        <label htmlFor="invite-person" className="text-sm font-medium">
          1. Who are they?
        </label>
        <select
          id="invite-person"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className={selectClass}
        >
          <option value="">Choose a person...</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value={NEW}>+ New person...</option>
        </select>
        {creating && (
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name of the new person"
            aria-label="Name of the new person"
            className={inputClass}
            autoFocus
          />
        )}
        <p className="text-xs text-muted-foreground">
          Every login belongs to someone in People. Pick them, or create them here.
        </p>
      </div>

      <fieldset disabled={!personReady} className="flex flex-col gap-4 disabled:opacity-50">
        <div className="flex flex-col gap-2">
          <label htmlFor="invite-email" className="text-sm font-medium">
            2. Their email
          </label>
          <Input
            id="invite-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="invite-role" className="text-sm font-medium">
            3. Role
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className={selectClass}
          >
            <option value="member">Member</option>
            <option value="super_admin">Super admin</option>
          </select>
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
            className="size-5"
          />
          Send the invitation mail now
        </label>
      </fieldset>

      <Button type="submit" disabled={!canSubmit} className="h-11 sm:h-8 sm:self-start">
        <Send data-icon="inline-start" />
        {sendEmail ? "Invite and send mail" : "Add login"}
      </Button>
    </form>
  );
}
