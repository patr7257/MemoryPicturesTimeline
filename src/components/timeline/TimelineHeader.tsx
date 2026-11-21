// The /timeline page header: title and the count line on the left, the
// search and the buttons (when there are vacations) on the right. No hooks,
// so the server page and the client view render the same markup.
import type { ReactNode } from "react";

export function TimelineHeader({ subtitle, children }: { subtitle: string; children?: ReactNode }) {
  return (
    <header className="mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-x-4 gap-y-3 px-4 pt-6 sm:px-6">
      <div>
        <h1 className="font-hand text-4xl leading-none sm:text-5xl">Timeline</h1>
        <p aria-live="polite" className="mt-1 text-sm text-muted-foreground">
          {subtitle}
        </p>
      </div>
      {children}
    </header>
  );
}
