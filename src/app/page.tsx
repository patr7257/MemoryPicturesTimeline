import Link from "next/link";
import { Camera } from "lucide-react";

import { requireSession } from "@/lib/session";
import { getTimelineData } from "@/lib/queries";
import { Header } from "@/components/site/Header";
import { PersonFilter } from "@/components/timeline/PersonFilter";
import { Timeline } from "@/components/timeline/Timeline";
import { Button } from "@/components/ui/button";

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string }>;
}) {
  await requireSession();
  const { person } = await searchParams;
  const { years, allPeople, totalTrips } = await getTimelineData(person);

  return (
    <main>
      <Header />
      <PersonFilter people={allPeople} activeId={person} basePath="/" />

      {totalTrips === 0 ? (
        <section className="mx-auto max-w-md px-6 py-24 text-center">
          <Camera className="mx-auto size-10 text-muted-foreground" />
          <p className="font-hand mt-4 text-3xl">
            {person ? "No trips with this person yet." : "Memory lane is still empty."}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Add the first vacation photos and the timeline starts here.
          </p>
          <Button size="lg" className="mt-6" nativeButton={false} render={<Link href="/upload" />}>
            Add the first photos
          </Button>
        </section>
      ) : (
        <Timeline years={years} />
      )}
    </main>
  );
}
