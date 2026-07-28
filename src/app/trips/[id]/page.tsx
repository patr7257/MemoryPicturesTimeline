import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Pencil } from "lucide-react";

import { requireSession } from "@/lib/session";
import { getTripWithPhotos } from "@/lib/queries";
import { formatTripDates } from "@/lib/dates";
import { rotationFor } from "@/lib/scrapbook";
import { TripAlbum } from "@/components/trip/TripAlbum";
import { Button } from "@/components/ui/button";

export default async function TripPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const data = await getTripWithPhotos(id);
  if (!data) notFound();
  const { trip, photos, people } = data;

  return (
    <main className="mx-auto max-w-5xl px-6 pb-24">
      <header className="flex flex-wrap items-start justify-between gap-3 py-6">
        <div className="flex items-start gap-3">
          <Link href="/" className="mt-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="font-hand text-5xl leading-tight">{trip.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatTripDates(trip.startDate, trip.endDate)}
              {trip.locationName && (
                <span className="ml-3 inline-flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {trip.locationName}
                </span>
              )}
            </p>
            {people.length > 0 && (
              <p className="mt-2 flex flex-wrap gap-1.5">
                {people.map((p) => (
                  <span
                    key={p.id}
                    className="font-hand inline-block bg-accent px-2 py-0.5 text-sm text-accent-foreground shadow-sm"
                    style={{ rotate: `${rotationFor(p.id, 3)}deg` }}
                  >
                    {p.name}
                  </span>
                ))}
              </p>
            )}
            {trip.description && (
              <p className="mt-3 max-w-prose text-sm">{trip.description}</p>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/trips/${trip.id}/edit`} />}>
          <Pencil data-icon="inline-start" />
          Edit trip
        </Button>
      </header>

      {photos.length === 0 ? (
        <p className="font-hand py-16 text-center text-2xl text-muted-foreground">
          No photos here yet.
        </p>
      ) : (
        <TripAlbum
          photos={photos.map((p) => ({
            id: p.id,
            width: p.width,
            height: p.height,
            city: p.city,
          }))}
        />
      )}
    </main>
  );
}
