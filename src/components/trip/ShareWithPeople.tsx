"use client";

// "Share with people": a button that opens a checkbox list of the people the
// viewer may share this vacation with, current shares ticked. The server
// decides who may be picked; this list is only a convenience.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";

import { setTripShares } from "@/actions/trips";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ResponsiveDialog } from "@/components/vacations/ResponsiveDialog";
import { groupState, type ShareGroup } from "@/lib/share-rules";

type Group = ShareGroup<{ id: string; name: string }>;

export function ShareWithPeople({
  tripId,
  groups,
  sharedIds,
}: {
  tripId: string;
  groups: Group[];
  sharedIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const count = sharedIds.length;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="min-h-11 sm:min-h-8"
      >
        <Share2 data-icon="inline-start" />
        Share with people
        {count > 0 && <span className="text-muted-foreground">({count})</span>}
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title="Share with people"
        description="They can see this vacation, its photos and notes. Sharing does not tag them."
      >
        {/* keyed by the saved set so reopening starts from the current shares */}
        {open && (
          <ShareBody
            key={sharedIds.join(",")}
            tripId={tripId}
            groups={groups}
            sharedIds={sharedIds}
            onDone={() => setOpen(false)}
          />
        )}
      </ResponsiveDialog>
    </>
  );
}

function ShareBody({
  tripId,
  groups,
  sharedIds,
  onDone,
}: {
  tripId: string;
  groups: Group[];
  sharedIds: string[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(sharedIds);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await setTripShares(tripId, selected);
      if (!res.ok) {
        // Errors stay until dismissed; the dialog stays open with the ticks.
        toast.error(res.error, { duration: Infinity, closeButton: true });
        setBusy(false);
        return;
      }
      toast.success("Sharing saved");
      router.refresh();
      onDone();
    } catch {
      toast.error("Could not save the sharing. Check the connection and try again.", {
        duration: Infinity,
        closeButton: true,
      });
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} className="flex flex-col gap-5">
      <FamilyGroups groups={groups} selected={selected} disabled={busy} onChange={setSelected} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onDone} disabled={busy} className="h-11 md:h-8">
          Cancel
        </Button>
        <Button type="submit" disabled={busy} className="h-11 md:h-8">
          {busy && <Loader2 className="animate-spin" />}
          Save
        </Button>
      </div>
    </form>
  );
}

const groupKey = (g: Group) => g.id ?? "none";

// One person, one state: a person under two families is one id in `selected`.
function FamilyGroups({
  groups,
  selected,
  disabled,
  onChange,
}: {
  groups: Group[];
  selected: string[];
  disabled: boolean;
  onChange: (next: string[]) => void;
}) {
  // Open when someone in it is ticked; a lone family always starts open.
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      groups.map((g) => [groupKey(g), groups.length === 1 || g.people.some((p) => selected.includes(p.id))]),
    ),
  );

  function togglePerson(pid: string, on: boolean) {
    onChange(on ? [...selected, pid] : selected.filter((x) => x !== pid));
  }

  function toggleGroup(g: Group, state: "none" | "some" | "all") {
    const ids = g.people.map((p) => p.id);
    onChange(
      state === "all"
        ? selected.filter((x) => !ids.includes(x))
        : [...selected, ...ids.filter((x) => !selected.includes(x))],
    );
  }

  return (
    <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-1">
      <legend className="mb-1 text-sm font-medium">People to share with</legend>
      {groups.map((g) => {
        const key = groupKey(g);
        const state = groupState(
          g.people.map((p) => p.id),
          selected,
        );
        const expanded = open[key] ?? false;
        const panelId = `share-group-${key}`;
        const count = g.people.length;
        return (
          <div key={key}>
            <div className="flex min-h-11 items-center gap-3 sm:min-h-8">
              <Checkbox
                checked={state === "all"}
                indeterminate={state === "some"}
                disabled={disabled}
                onCheckedChange={() => toggleGroup(g, state)}
                aria-label={`${g.name}, all ${count} ${count === 1 ? "person" : "people"}`}
              />
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setOpen({ ...open, [key]: !expanded })}
                className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 text-left text-sm font-medium sm:min-h-8"
              >
                <span className="min-w-0 truncate">{g.name}</span>
                <ChevronRight
                  aria-hidden
                  className={`size-4 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none ${expanded ? "rotate-90" : ""}`}
                />
              </button>
            </div>
            <ul id={panelId} hidden={!expanded} className="pl-7">
              {g.people.map((p) => (
                <li key={p.id}>
                  <label className="flex min-h-11 items-center gap-3 text-sm sm:min-h-8">
                    <Checkbox
                      checked={selected.includes(p.id)}
                      disabled={disabled}
                      onCheckedChange={(c) => togglePerson(p.id, c)}
                    />
                    <span className="min-w-0 truncate">{p.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </fieldset>
  );
}
