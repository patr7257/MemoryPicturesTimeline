import { notFound } from "next/navigation";

import { TripHeader } from "@/components/trip/TripHeader";
import { TripTabs } from "@/components/trip/TripTabs";
import { getTripPageData } from "@/lib/photo-queries";

// Shared by Overview, Slideshow and Edit: header plus the section tabs. The
// data is cached per request, so the pages reuse it instead of fetching again.
export default async function TripLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getTripPageData(id);
  if (!data) notFound();

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
      <TripHeader trip={data.trip} people={data.people} photoCount={data.photos.length} />
      <TripTabs tripId={data.trip.id} canManage={data.canManage} />
      <div className="pt-6">{children}</div>
    </main>
  );
}
