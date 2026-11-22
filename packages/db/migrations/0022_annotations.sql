CREATE TABLE "annotation" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"owner_id" uuid NOT NULL,
	"source_start" text NOT NULL,
	"source_end" text NOT NULL,
	"source_range" "int4range" NOT NULL,
	"quote" text,
	"anchor" jsonb,
	"body" text NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "annotation_collection" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "annotation_collection_owner_id_title_unique" UNIQUE("owner_id","title")
);
--> statement-breakpoint
CREATE TABLE "annotation_collection_item" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"collection_id" uuid NOT NULL,
	"link_id" uuid,
	"annotation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "annotation_collection_item_collection_id_link_id_unique" UNIQUE("collection_id","link_id"),
	CONSTRAINT "annotation_collection_item_collection_id_annotation_id_unique" UNIQUE("collection_id","annotation_id"),
	CONSTRAINT "annotation_collection_item_one" CHECK (("annotation_collection_item"."link_id" IS NULL) <> ("annotation_collection_item"."annotation_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "annotation" ADD CONSTRAINT "annotation_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotation_collection" ADD CONSTRAINT "annotation_collection_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotation_collection_item" ADD CONSTRAINT "annotation_collection_item_collection_id_annotation_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."annotation_collection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotation_collection_item" ADD CONSTRAINT "annotation_collection_item_link_id_scripture_link_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."scripture_link"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotation_collection_item" ADD CONSTRAINT "annotation_collection_item_annotation_id_annotation_id_fk" FOREIGN KEY ("annotation_id") REFERENCES "public"."annotation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "annotation_owner_idx" ON "annotation" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "annotation_source_idx" ON "annotation" USING gist ("source_range");--> statement-breakpoint
CREATE INDEX "annotation_collection_item_link_idx" ON "annotation_collection_item" USING btree ("link_id");--> statement-breakpoint
CREATE INDEX "annotation_collection_item_annotation_idx" ON "annotation_collection_item" USING btree ("annotation_id");