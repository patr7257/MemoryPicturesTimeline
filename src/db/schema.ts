import { sql } from "drizzle-orm";
import {
  boolean,
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
  // The member who created the trip: always sees it and may manage it
  // (src/lib/access-policy.ts). Null only when that login was removed.
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
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
  // True when lat/lng/city/country were copied from a photo taken the same
  // day (src/lib/infer-location.mjs), not read from GPS or set by hand.
  locationInferred: boolean("location_inferred").notNull().default(false),
  // Short description written by the uploader or a super admin.
  caption: text("caption"),
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

// The in-app login allowlist. A row means "this email may sign in" and ties
// that login to exactly one person, which is what trip visibility is derived
// from (a member sees the trips their person is tagged on). Emails are stored
// lowercase. role is "member" or "super_admin"; SUPER_ADMIN_EMAILS in the env
// bootstraps super admins that have no row here. (people.userId predates this
// table and is unused.)
export const members = pgTable("members", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  personId: uuid("person_id")
    .notNull()
    .references(() => people.id, { onDelete: "restrict" }),
  role: text("role").notNull().default("member"),
  invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Notes on a trip (photoId null) or on one photo of that trip. tripId is
// always set so visibility checks need only the trip.
export const comments = pgTable("comments", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tripId: uuid("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  photoId: uuid("photo_id").references(() => photos.id, { onDelete: "cascade" }),
  authorId: text("author_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// One row per device/browser. Upsert by endpoint re-keys user_id so a shared
// device follows whoever signed in last.
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// One row per user and notification type. A missing row means the registry
// default (src/lib/push/registry.ts); reads never insert.
export const notificationPrefs = pgTable(
  "notification_prefs",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    enabled: boolean("enabled").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.type] })],
);

// Idempotency ledger for scheduled pushes. key = "<type>:<yyyy-mm-dd>"
// (Copenhagen day); the primary key makes a second run the same day a no-op.
export const pushDispatchLog = pgTable("push_dispatch_log", {
  key: text("key").primaryKey(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
});
