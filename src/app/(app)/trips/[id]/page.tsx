import { notFound } from "next/navigation";

import { TripOverview } from "@/components/trip/TripOverview";
import { getTripOverviewData } from "@/lib/photo-queries";

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getTripOverviewData(id);
  if (!data) notFound();

  return (
    <TripOverview
      tripId={data.trip.id}
      tripName={data.trip.title}
      startDate={data.trip.startDate}
      photos={data.photos}
      comments={data.comments}
    />
  );
}
