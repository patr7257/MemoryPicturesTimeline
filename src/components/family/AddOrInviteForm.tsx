"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { addPerson, inviteMember, setPersonFamilies } from "@/actions/family";
import { FamilyChecks } from "@/components/family/FamilyChecks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NO_FAMILY, peopleForFilter, planSubmit, submitLabel } from "@/lib/family-admin";
import type { AdminPerson } from "@/lib/member-queries";

const selectClass =
  "h-11 w-full border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:text-sm";
const inputClass = "h-11 text-base sm:h-9 sm:text-sm";

type Who = "new" | "existing";

// One form for the one act: a Person, with or without a login. Without an
// email it adds (or regroups) a person who never signs in; with an email the
// login is created for that person too. The actions run in order and stop at
// the first refusal.
export function AddOrInviteForm({
  families,
  people,
  filter,
  initialPersonId,
  prefillEmail,
  defaultSendEmail,
  onDone,
}: {
  families: { id: string; name: string }[];
  people: AdminPerson[];
  filter: string;
  initialPersonId: string | null;
  prefillEmail: string;
  defaultSendEmail: boolean;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [who, setWho] = useState<Who>(initialPersonId ? "existing" : "new");
  const [name, setName] = useState("");
  const [personId, setPersonId] = useState(initialPersonId ?? "");
  // null = follow the default (the filter's family, or the person's own).
  const [newFamilies, setNewFamilies] = useState<string[] | null>(null);
  const [existingFamilies, setExistingFamilies] = useState<string[] | null>(null);
  const [email, setEmail] = useState(prefillEmail);
  const [role, setRole] = useState("member");
  const [sendEmail, setSendEmail] = useState(defaultSendEmail);
  const [error, setError] = useState<string | null>(null);
  // A person created by this form whose invite was refused: they exist even
  // while the page data has not caught up yet.
  const [created, setCreated] = useState<{ id: string; name: string; familyIds: string[] } | null>(
    null,
  );

  const knownPerson =
    people.find((p) => p.id === personId) ??
    (created && created.id === personId ? { ...created } : null);
  const currentFamilyIds = knownPerson?.familyIds ?? [];
  const inFilter = peopleForFilter(people, filter).filter((p) => p.logins.length === 0);
  const options: { id: string; name: string }[] = [...inFilter];
  if (knownPerson && !options.some((o) => o.id === knownPerson.id)) options.push(knownPerson);

  const familyIds =
    who === "new"
      ? (newFamilies ?? (filter === NO_FAMILY ? [] : [filter]))
      : (existingFamilies ?? currentFamilyIds);
  const hasEmail = email.trim().length > 0;
  const input = { who, name, personId, familyIds, currentFamilyIds, email };
  const plan = planSubmit(input);

  function chooseWho(next: Who) {
    setWho(next);
    setError(null);
  }

  function choosePerson(id: string) {
    setPersonId(id);
    setExistingFamilies(null);
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!plan.ok || pending) return;
    setError(null);
    const steps = plan.steps;
    startTransition(async () => {
      try {
        let id = personId;
        let personName = knownPerson?.name ?? "";
        for (const step of steps) {
          if (step === "addPerson") {
            const res = await addPerson({ name, familyIds });
            if (!res.ok) {
              setError(res.error);
              return;
            }
            id = res.id;
            personName = name.trim();
            if (steps.includes("inviteMember")) {
              // Keep the person selected, so a refused invite can be retried.
              setCreated({ id, name: personName, familyIds: [...familyIds] });
              setWho("existing");
              setPersonId(id);
              setExistingFamilies(null);
            }
          } else if (step === "setPersonFamilies") {
            const res = await setPersonFamilies(id, familyIds);
            if (!res.ok) {
              setError(res.error);
              return;
            }
          } else {
            const res = await inviteMember({ personId: id, email, role, sendEmail });
            if (!res.ok) {
              setError(
                steps[0] === "addPerson"
                  ? `${personName || "The person"} was added, but the invite did not go out: ${res.error}`
                  : res.error,
              );
              return;
            }
            if (res.mailSent === false) {
              toast.warning(
                "Invited, but the mail could not be sent. Use Resend invite to try again.",
                { duration: 7000 },
              );
            } else {
              toast.success(res.mailSent ? "Invited, mail sent" : "Login added");
            }
            onDone();
            return;
          }
        }
        toast.success(steps[0] === "addPerson" ? `${personName} added` : "Saved");
        onDone();
      } catch {
        setError("Something went wrong. Try again.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      <h2 className="font-hand text-2xl">Add or invite someone</h2>

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-medium">Who</legend>
        <div className="flex flex-wrap gap-x-6">
          {(
            [
              ["new", "Someone new"],
              ["existing", "Someone already here"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex min-h-11 items-center gap-3 text-sm sm:min-h-8">
              <input
                type="radio"
                name="add-or-invite-who"
                value={value}
                checked={who === value}
                onChange={() => chooseWho(value)}
                className="size-5 sm:size-4"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {who === "new" ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="add-invite-name" className="text-sm font-medium">
            Name
          </label>
          <Input
            id="add-invite-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            className={inputClass}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <label htmlFor="add-invite-person" className="text-sm font-medium">
            Person
          </label>
          <select
            id="add-invite-person"
            value={personId}
            onChange={(e) => choosePerson(e.target.value)}
            aria-describedby="add-invite-person-hint"
            className={selectClass}
          >
            <option value="">Choose a person...</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <p id="add-invite-person-hint" className="text-xs text-muted-foreground">
            {inFilter.length === 0
              ? "Everyone in this view already has a login."
              : "People in the family shown above who have no login yet."}
          </p>
        </div>
      )}

      {(who === "new" || personId !== "") && (
        <FamilyChecks
          legend={who === "new" ? "Families" : `Families of ${knownPerson?.name ?? "this person"}`}
          options={families}
          selected={familyIds}
          disabled={pending}
          onChange={who === "new" ? setNewFamilies : setExistingFamilies}
        />
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="add-invite-email" className="text-sm font-medium">
          Email (optional)
        </label>
        <Input
          id="add-invite-email"
          type="email"
          inputMode="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby="add-invite-email-hint"
          className={inputClass}
        />
        <p id="add-invite-email-hint" className="text-xs text-muted-foreground">
          Leave empty for someone who will not sign in. They can still be tagged on vacations and
          have their own countries map.
        </p>
      </div>

      {hasEmail && (
        <>
          <div className="flex flex-col gap-2">
            <label htmlFor="add-invite-role" className="text-sm font-medium">
              Role
            </label>
            <select
              id="add-invite-role"
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
        </>
      )}

      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" disabled={!plan.ok || pending} className="h-11 sm:h-8 sm:self-start">
        {submitLabel(input)}
      </Button>
    </form>
  );
}
