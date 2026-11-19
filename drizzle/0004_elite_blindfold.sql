CREATE TABLE "person_countries" (
	"person_id" uuid NOT NULL,
	"country_key" text NOT NULL,
	"status" text NOT NULL,
	"year" integer,
	"note" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "person_countries_person_id_country_key_pk" PRIMARY KEY("person_id","country_key")
);
--> statement-breakpoint
ALTER TABLE "person_countries" ADD CONSTRAINT "person_countries_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_countries" ADD CONSTRAINT "person_countries_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;