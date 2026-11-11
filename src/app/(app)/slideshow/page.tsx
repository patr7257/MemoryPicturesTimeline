import type { Metadata } from "next";
import Link from "next/link";

import { SlideshowLauncher } from "@/components/slideshow/SlideshowLauncher";
import { getViewer } from "@/lib/access";
import { getAllPeople } from "@/lib/queries";
import { getSlideshowPhotos } from "@/lib/slideshow-queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Slideshow" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const chip =
  "inline-flex min-h-11 items-center rounded-full border px-4 text-sm transition-colors";

export default async function SlideshowPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string | string[] }>;
}) {
  const viewer = await getViewer();
  const { person } = await searchParams;
  const raw = Array.isArray(person) ? person[0] : person;

  const everyone = await getAllPeople();
  // Unknown or malformed ids behave like no filter.
  const selected = raw && UUID.test(raw) ? everyone.find((p) => p.id === raw) : undefined;

  const photos = (await getSlideshowPhotos(viewer, { personId: selected?.id })) ?? [];

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="font-hand text-4xl">
        Slideshow: {selected ? selected.name : "everyone"}
      </h1>

      <nav aria-label="Whose vacations" className="flex flex-wrap gap-2">
        <Link
          href="/slideshow"
          aria-current={selected ? undefined : "page"}
          className={cn(
            chip,
            selected
              ? "border-border bg-background hover:bg-muted"
              : "border-primary bg-primary text-primary-foreground",
          )}
        >
          All my vacations
        </Link>
        {everyone.map((p) => {
          const active = p.id === selected?.id;
          return (
            <Link
              key={p.id}
              href={{ pathname: "/slideshow", query: { person: p.id } }}
              aria-current={active ? "page" : undefined}
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

      <SlideshowLauncher key={selected?.id ?? "all"} photos={photos} />
    </main>
  );
}
