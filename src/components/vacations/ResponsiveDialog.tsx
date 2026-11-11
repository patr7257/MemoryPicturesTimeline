"use client";

// A dialog from the md breakpoint up, a bottom sheet on phones. Both are z-50,
// above the phone tab bar (z-40). The body scrolls; the header stays put.
import { useSyncExternalStore } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const QUERY = "(min-width: 768px)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}

export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const desktop = useIsDesktop();

  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[calc(100dvh-4rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-6 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-hand text-3xl font-normal">{title}</DialogTitle>
            {description && <DialogDescription className="text-sm">{description}</DialogDescription>}
          </DialogHeader>
          <div className="-mx-1 overflow-y-auto px-1 pb-1">{children}</div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] gap-0 text-base">
        <SheetHeader className="px-4 pt-4 pr-14">
          <SheetTitle className="font-hand text-3xl font-normal">{title}</SheetTitle>
          {description && <SheetDescription className="text-sm">{description}</SheetDescription>}
        </SheetHeader>
        <div className="overflow-y-auto px-4 pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
