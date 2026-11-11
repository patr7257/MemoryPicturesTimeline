import type { Metadata } from "next";
import Link from "next/link";

import { SlideshowLauncher } from "@/components/slideshow/SlideshowLauncher";
import { getViewer } from "@/lib/access";
import { getAllPeople } from "@/lib/queries";
import { parsePersonParam, selectionTitle, togglePerson } from "@/lib/slideshow";
import { getSlideshowPhotos } from "@/lib/slideshow-queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Slideshow" };
export const dynamic = "force-dynamic";

const chip =
  "inline-flex min-h-11 items-center rounded-full border px-4 text-sm transition-colors";

// /slideshow?person=<id>&person=<id>: photos of the vacations ANY of these people
// is on. One param still works (links from the People page); none means all.
export default async function SlideshowPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string | string[] }>;
}) {
  const viewer = await getViewer();
  const { person } = await searchParams;

  const everyone = await getAllPeople();
  // Unknown or malformed ids are ignored: no valid selection behaves like no filter.
  const wanted = new Set(parsePersonParam(person));
  const selected = everyone.filter((p) => wanted.has(p.id));
  const selectedIds = selected.map((p) => p.id);

  const photos =
    (await getSlideshowPhotos(viewer, {
      personIds: selectedIds.length > 0 ? selectedIds : undefined,
    })) ?? [];

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="font-hand text-4xl">
        Slideshow: {selectionTitle(selected.map((p) => p.name))}
      </h1>

      <nav aria-label="Whose vacations (pick one or more)" className="flex flex-wrap gap-2">
        <Link
          href="/slideshow"
          aria-current={selected.length > 0 ? undefined : "page"}
          className={cn(
            chip,
            selected.length > 0
              ? "border-border bg-background hover:bg-muted"
              : "border-primary bg-primary text-primary-foreground",
          )}
        >
          All my vacations
        </Link>
        {everyone.map((p) => {
          const active = wanted.has(p.id);
          const next = togglePerson(selectedIds, p.id);
          return (
            <Link
              key={p.id}
              href={
                next.length > 0
                  ? { pathname: "/slideshow", query: { person: next } }
                  : "/slideshow"
              }
              aria-current={active ? "true" : undefined}
              className={cn(
                chip,
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted",
              )}
            >
              {p.name}
            </Link>
          );
        })}
      </nav>

      <SlideshowLauncher key={selectedIds.join(",") || "all"} photos={photos} />
    </main>
  );
}
