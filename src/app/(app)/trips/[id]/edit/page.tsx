import { notFound } from "next/navigation";

import { CoverPicker } from "@/components/trip/CoverPicker";
import { EditTripForm } from "@/components/trip/EditTripForm";
import { getViewer } from "@/lib/access";
import { getTripPageData } from "@/lib/photo-queries";
import { getTagTargets } from "@/lib/share-queries";

export default async function EditTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getTripPageData(id);
  // Editing belongs to the creator and super admins.
  if (!data || !data.canManage) notFound();
  // Who may be tagged: the people the viewer sees plus those already tagged.
  const allPeople = await getTagTargets(await getViewer(), data.people.map((p) => p.id));

  return (
    <div className="flex max-w-2xl flex-col gap-10">
      <section aria-labelledby="cover-heading" className="flex flex-col gap-3">
        <h2 id="cover-heading" className="font-hand text-3xl leading-tight">
          Cover photo
        </h2>
        <CoverPicker
          tripId={data.trip.id}
          photos={data.photos.map((p) => ({ id: p.id, hasLocation: p.lat !== null && p.lng !== null }))}
          coverPhotoId={data.trip.coverPhotoId}
        />
      </section>
      <section aria-labelledby="details-heading" className="flex flex-col gap-3">
        <h2 id="details-heading" className="font-hand text-3xl leading-tight">
          Details
        </h2>
        <EditTripForm
          trip={{
            id: data.trip.id,
            title: data.trip.title,
            startDate: data.trip.startDate,
            endDate: data.trip.endDate,
            locationName: data.trip.locationName,
            description: data.trip.description,
          }}
          allPeople={allPeople}
          taggedIds={data.people.map((p) => p.id)}
        />
      </section>
    </div>
  );
}
