CREATE TABLE "families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "families_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "family_people" (
	"family_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	CONSTRAINT "family_people_family_id_person_id_pk" PRIMARY KEY("family_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "trip_shares" (
	"trip_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"shared_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trip_shares_trip_id_person_id_pk" PRIMARY KEY("trip_id","person_id")
);
--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "family_people" ADD CONSTRAINT "family_people_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_people" ADD CONSTRAINT "family_people_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_shares" ADD CONSTRAINT "trip_shares_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_shares" ADD CONSTRAINT "trip_shares_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_shares" ADD CONSTRAINT "trip_shares_shared_by_user_id_fk" FOREIGN KEY ("shared_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_color_unique" UNIQUE("color");