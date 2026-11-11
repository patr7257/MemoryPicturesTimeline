import { getViewer } from "@/lib/access";
import { getAllPeople, getVisibleTripOptions } from "@/lib/queries";
import { UploadForm } from "@/components/upload/UploadForm";

export default async function UploadPage() {
  const viewer = await getViewer();
  const [tripOptions, people] = await Promise.all([getVisibleTripOptions(viewer), getAllPeople()]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <h1 className="font-hand pb-6 text-4xl leading-none sm:text-5xl">Add memories</h1>
      <UploadForm trips={tripOptions} people={people} viewerPersonId={viewer.personId} />
    </main>
  );
}
