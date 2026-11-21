"use client";

// "Share with people": a button that opens a checkbox list of the people the
// viewer may share this vacation with, current shares ticked. The server
// decides who may be picked; this list is only a convenience.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";

import { setTripShares } from "@/actions/trips";
import { Button } from "@/components/ui/button";
import { FamilyChecks } from "@/components/family/FamilyChecks";
import { ResponsiveDialog } from "@/components/vacations/ResponsiveDialog";

type Target = { id: string; name: string };

export function ShareWithPeople({
  tripId,
  targets,
  sharedIds,
}: {
  tripId: string;
  targets: Target[];
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
            targets={targets}
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
  targets,
  sharedIds,
  onDone,
}: {
  tripId: string;
  targets: Target[];
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
      <FamilyChecks
        legend="People to share with"
        options={targets}
        selected={selected}
        disabled={busy}
        onChange={setSelected}
      />
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
