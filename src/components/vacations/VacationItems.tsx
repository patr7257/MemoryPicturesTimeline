"use client";

// One vacation drawn as a card (phones, or by choice) and as a dense table row
// (md and up), plus the shared action buttons.
import Link from "next/link";
import { motion } from "motion/react";
import { Camera, ExternalLink, ImageOff, MapPin, MoreHorizontal, Pencil, Play, Trash2 } from "lucide-react";

import { formatTripDates } from "@/lib/dates";
import { imgUrl } from "@/lib/img-url";
import { lengthInDays, type VacationListItem } from "@/lib/vacations-view";
import { BlurhashImage } from "@/components/timeline/BlurhashImage";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type ItemHandlers = {
  onQuickEdit: (trip: VacationListItem) => void;
  onDelete: (trip: VacationListItem) => void;
};

const days = (t: VacationListItem) => lengthInDays(t.startDate, t.endDate);

function Cover({ trip, className }: { trip: VacationListItem; className?: string }) {
  if (!trip.coverPhotoId) {
    return (
      <div className={cn("flex items-center justify-center bg-muted text-muted-foreground", className)}>
        <ImageOff className="size-5" aria-hidden />
      </div>
    );
  }
  return (
    <BlurhashImage
      src={imgUrl(trip.coverPhotoId, 400)}
      alt=""
      blurhash={trip.coverBlurhash}
      className={className}
    />
  );
}

function People({ trip, className }: { trip: VacationListItem; className?: string }) {
  if (trip.people.length === 0) {
    return <span className="text-xs text-muted-foreground">Nobody tagged</span>;
  }
  return (
    <ul className={cn("flex flex-wrap gap-1", className)}>
      {trip.people.map((p) => (
        <li
          key={p.id}
          className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground"
        >
          {p.name}
        </li>
      ))}
    </ul>
  );
}

// Slideshow, Quick edit and a "more" menu (full edit page, delete). Edit and
// delete only show when the viewer may manage the vacation.
export function VacationActions({
  trip,
  onQuickEdit,
  onDelete,
  compact = false,
}: { trip: VacationListItem; compact?: boolean } & ItemHandlers) {
  const label = (text: string) => (compact ? <span className="sr-only">{text}</span> : text);
  const size = compact ? "icon" : "default";
  const touch = compact ? "size-11 md:size-8" : "h-11 px-3 md:h-8 md:px-2.5";
  return (
    <div className="relative z-10 flex items-center gap-1">
      <Button
        variant="ghost"
        size={size}
        nativeButton={false}
        render={<Link href={`/trips/${trip.id}/slideshow`} />}
        className={touch}
        title="Slideshow"
      >
        <Play />
        {label("Slideshow")}
      </Button>
      {trip.canManage && (
        <>
          <Button
            variant="ghost"
            size={size}
            onClick={() => onQuickEdit(trip)}
            className={touch}
            title="Quick edit"
          >
            <Pencil />
            {label("Quick edit")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" className="size-11 md:size-8" />}
              aria-label={`More actions for ${trip.title}`}
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                render={<Link href={`/trips/${trip.id}/edit`} />}
                className="min-h-11 text-sm md:min-h-0 md:text-xs"
              >
                <ExternalLink />
                Full edit page
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDelete(trip)}
                className="min-h-11 text-sm md:min-h-0 md:text-xs"
              >
                <Trash2 />
                Delete vacation
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </div>
  );
}

export function VacationCard({
  trip,
  index,
  ...handlers
}: { trip: VacationListItem; index: number } & ItemHandlers) {
  const n = days(trip);
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.22, delay: Math.min(index, 8) * 0.03 }}
      className="group relative flex flex-col overflow-hidden border border-border bg-card shadow-[0_2px_10px_var(--paper-shadow)] transition-shadow hover:shadow-[0_6px_18px_var(--paper-shadow)]"
    >
      <Cover trip={trip} className="aspect-[4/3] w-full" />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="font-hand text-2xl leading-tight break-words">
          <Link
            href={`/trips/${trip.id}`}
            className="after:absolute after:inset-0 after:content-[''] hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
          >
            {trip.title}
          </Link>
        </h3>
        <p className="text-sm text-muted-foreground">
          {formatTripDates(trip.startDate, trip.endDate)}
          {n > 1 && <span> · {n} days</span>}
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {trip.locationName && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden />
              {trip.locationName}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Camera className="size-3.5" aria-hidden />
            {trip.photoCount} {trip.photoCount === 1 ? "photo" : "photos"}
          </span>
        </p>
        <People trip={trip} />
        <div className="mt-auto -mb-1 flex justify-end border-t border-border/60 pt-1">
          <VacationActions trip={trip} {...handlers} />
        </div>
      </div>
    </motion.li>
  );
}

const CELL = "px-3 py-2 align-middle";

export function VacationRow({ trip, ...handlers }: { trip: VacationListItem } & ItemHandlers) {
  const n = days(trip);
  return (
    <tr className="border-b border-border/70 transition-colors last:border-0 hover:bg-muted/50 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
      <td className={cn(CELL, "w-16")}>
        <Cover trip={trip} className="h-12 w-14" />
      </td>
      <td className={cn(CELL, "max-w-72 min-w-44")}>
        <Link href={`/trips/${trip.id}`} className="font-hand block text-xl leading-tight hover:text-primary">
          {trip.title}
        </Link>
      </td>
      <td className={cn(CELL, "text-sm whitespace-nowrap text-muted-foreground")}>
        {formatTripDates(trip.startDate, trip.endDate)}
      </td>
      <td className={cn(CELL, "text-sm whitespace-nowrap text-muted-foreground tabular-nums")}>
        {n} {n === 1 ? "day" : "days"}
      </td>
      <td className={cn(CELL, "max-w-48 text-sm text-muted-foreground")}>
        <span className="line-clamp-2">{trip.locationName ?? ""}</span>
      </td>
      <td className={cn(CELL, "max-w-64")}>
        <People trip={trip} />
      </td>
      <td className={cn(CELL, "text-sm whitespace-nowrap text-muted-foreground tabular-nums")}>
        {trip.photoCount}
      </td>
      <td className={cn(CELL, "text-right")}>
        <div className="flex justify-end">
          <VacationActions trip={trip} compact {...handlers} />
        </div>
      </td>
    </tr>
  );
}
