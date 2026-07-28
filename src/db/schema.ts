import { sql } from "drizzle-orm";
import {
  date,
  doublePrecision,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";

// Tag targets for "who was on this trip". A person MAY be linked to a login
// (userId) but does not have to be: family members who never log in are still
// taggable.
export const people = pgTable("people", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const trips = pgTable("trips", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  // startDate drives year grouping and ordering on the timeline.
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  locationName: text("location_name"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  // Intentionally no FK (circular ref with photos); resolved in queries with
  // a fallback to the trip's first photo by takenAt.
  coverPhotoId: uuid("cover_photo_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const photos = pgTable("photos", {
  // Generated server-side at presign time; the client carries it through the
  // upload flow so finalize is idempotent.
  id: uuid("id").primaryKey(),
  tripId: uuid("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  // UNIQUE makes finalize idempotent: retry after a half-done finalize hits
  // the conflict and returns the existing row.
  r2KeyOriginal: text("r2_key_original").notNull().unique(),
  r2Key400: text("r2_key_400").notNull(),
  r2Key1200: text("r2_key_1200").notNull(),
  // True pixel size of the original (from sharp, server-trusted); the album
  // layout needs real aspect ratios.
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  blurhash: text("blurhash"),
  takenAt: timestamp("taken_at"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  city: text("city"),
  country: text("country"),
  uploaderId: text("uploader_id")
    .notNull()
    .references(() => user.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tripPeople = pgTable(
  "trip_people",
  {
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.tripId, t.personId] })],
);
