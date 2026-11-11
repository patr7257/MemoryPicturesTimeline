import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SlideshowLauncher } from "@/components/slideshow/SlideshowLauncher";
import { getViewer } from "@/lib/access";
import { getSlideshowPhotos } from "@/lib/slideshow-queries";

export const metadata: Metadata = { title: "Slideshow" };
export const dynamic = "force-dynamic";

// Only the slideshow content: the vacation title and tabs come from the
// vacation layout around this page.
export default async function TripSlideshowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const viewer = await getViewer();
  const photos = await getSlideshowPhotos(viewer, { tripId: id });
  if (!photos) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <SlideshowLauncher photos={photos} />
    </div>
  );
}
