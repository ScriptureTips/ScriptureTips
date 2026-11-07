CREATE TABLE "scripture_link" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"owner_id" uuid NOT NULL,
	"source_start" text NOT NULL,
	"source_end" text NOT NULL,
	"source_range" "int4range" NOT NULL,
	"target_start" text NOT NULL,
	"target_end" text NOT NULL,
	"target_range" "int4range" NOT NULL,
	"entered_scheme" text NOT NULL,
	"entered_ref" text NOT NULL,
	"relationship_type" text,
	"note" text,
	"visibility" text DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scripture_link" ADD CONSTRAINT "scripture_link_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scripture_link_owner_idx" ON "scripture_link" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "scripture_link_source_idx" ON "scripture_link" USING gist ("source_range");--> statement-breakpoint
CREATE INDEX "scripture_link_target_idx" ON "scripture_link" USING gist ("target_range");