import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getViewer } from "@/lib/access";
import { getAllPeople, getTripWithPhotos } from "@/lib/queries";
import { EditTripForm } from "@/components/trip/EditTripForm";

export default async function EditTripPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await getViewer();
  const { id } = await params;
  const [data, allPeople] = await Promise.all([getTripWithPhotos(viewer, id), getAllPeople()]);
  // Editing belongs to the creator and super admins.
  if (!data || !data.canManage) notFound();

  return (
    <main className="mx-auto max-w-2xl px-6 pb-24">
      <header className="flex items-center gap-3 py-6">
        <Link href={`/trips/${id}`} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="font-hand text-4xl">Edit trip</h1>
      </header>
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
    </main>
  );
}
