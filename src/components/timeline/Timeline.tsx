"use client";

// The scrapbook timeline: sticky year markers, trips alternating around a
// center spine (single left column on mobile), and a warm "beam" that grows
// down the spine as you scroll.
import { useRef } from "react";
import Link from "next/link";
import { motion, useScroll, useSpring } from "motion/react";
import { Camera, MapPin } from "lucide-react";

import type { TimelineYear } from "@/lib/queries";
import { formatTripDates } from "@/lib/dates";
import { rotationFor } from "@/lib/scrapbook";
import { PhotoCluster } from "./PhotoCluster";

export function Timeline({ years }: { years: TimelineYear[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.7", "end 0.9"],
  });
  const beam = useSpring(scrollYProgress, { stiffness: 60, damping: 20 });

  return (
    <div ref={ref} className="relative mx-auto max-w-5xl px-6 pb-24">
      {/* spine + beam */}
      <div className="absolute inset-y-0 left-8 w-px bg-border md:left-1/2" aria-hidden>
        <motion.div
          className="absolute inset-x-0 top-0 origin-top bg-primary"
          style={{ scaleY: beam, height: "100%", width: "3px", marginLeft: "-1px" }}
        />
      </div>

      {years.map(({ year, trips }) => (
        <section key={year}>
          <div className="sticky top-4 z-20 mb-6 flex justify-start md:justify-center">
            <span
              className="font-hand inline-block bg-card px-5 py-1 text-5xl shadow-[0_2px_8px_var(--paper-shadow)]"
              style={{ rotate: `${rotationFor(String(year), 2)}deg` }}
            >
              {year}
            </span>
          </div>

          {trips.map((trip, i) => {
            const left = i % 2 === 0;
            return (
              <article
                key={trip.id}
                className={`relative mb-16 pl-16 md:w-1/2 md:pl-0 ${
                  left ? "md:pr-12 md:text-right" : "md:ml-auto md:pl-12"
                }`}
              >
                {/* dot on the spine */}
                <span
                  aria-hidden
                  className={`absolute top-2 left-8 size-3 -translate-x-1/2 rounded-full border-2 border-primary bg-background md:left-auto ${
                    left ? "md:-right-1.5 md:translate-x-1/2" : "md:-left-1.5 md:-translate-x-1/2"
                  }`}
                />
                <Link href={`/trips/${trip.id}`} className="group block">
                  <h3 className="font-hand text-3xl leading-tight group-hover:text-primary">
                    {trip.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {formatTripDates(trip.startDate, trip.endDate)}
                  </p>
                  <p className={`mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground ${left ? "md:justify-end" : ""}`}>
                    {trip.locationName && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3.5" />
                        {trip.locationName}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Camera className="size-3.5" />
                      {trip.photoCount}
                    </span>
                  </p>
                  {trip.people.length > 0 && (
                    <p className={`mt-2 flex flex-wrap gap-1.5 ${left ? "md:justify-end" : ""}`}>
                      {trip.people.map((p) => (
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
                  <PhotoCluster
                    photos={trip.previewPhotos.map((p) => ({
                      id: p.id,
                      width: p.width,
                      height: p.height,
                      caption: p.city,
                    }))}
                  />
                </Link>
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}
