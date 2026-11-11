// Vacation header shared by all tabs: title, dates, place, people, notes text,
// photo count. Server component; the tab bar below it is the only client part.
import { Images, MapPin } from "lucide-react";

import { formatTripDates } from "@/lib/dates";
import { rotationFor } from "@/lib/scrapbook";

export function TripHeader({
  trip,
  people,
  photoCount,
}: {
  trip: {
    title: string;
    startDate: string;
    endDate: string | null;
    locationName: string | null;
    description: string | null;
  };
  people: { id: string; name: string }[];
  photoCount: number;
}) {
  return (
    <header className="py-5 sm:py-6">
      <h1 className="font-hand text-4xl leading-tight break-words sm:text-5xl">{trip.title}</h1>
      <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>{formatTripDates(trip.startDate, trip.endDate)}</span>
        {trip.locationName && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden />
            {trip.locationName}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <Images className="size-3.5" aria-hidden />
          {photoCount} {photoCount === 1 ? "photo" : "photos"}
        </span>
      </p>
      {people.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Who was along">
          {people.map((p) => (
            <li
              key={p.id}
              className="font-hand inline-block bg-accent px-2 py-0.5 text-base text-accent-foreground shadow-sm"
              style={{ rotate: `${rotationFor(p.id, 3)}deg` }}
            >
              {p.name}
            </li>
          ))}
        </ul>
      )}
      {trip.description && (
        <p className="mt-3 max-w-prose text-sm whitespace-pre-wrap">{trip.description}</p>
      )}
    </header>
  );
}
