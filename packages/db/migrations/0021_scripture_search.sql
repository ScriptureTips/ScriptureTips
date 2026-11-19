-- Verse search keeps every word. PostgreSQL's English configuration leaves out its own list of
-- stop words ("the", "of", "before" …), so a quoted phrase couldn't match word for word. This
-- configuration stems the same way but leaves nothing out; the words a plain query ignores are
-- ScriptureTips's own and are dropped from the query, not the index (apps/api/src/search).
CREATE TEXT SEARCH DICTIONARY "scripture_stem" (TEMPLATE = snowball, Language = english);--> statement-breakpoint
CREATE TEXT SEARCH CONFIGURATION "scripture" (COPY = english);--> statement-breakpoint
ALTER TEXT SEARCH CONFIGURATION "scripture" ALTER MAPPING REPLACE english_stem WITH "scripture_stem";--> statement-breakpoint
-- The generated column is made again with the new configuration (its index goes with it).
ALTER TABLE "verse_text" drop column "search";--> statement-breakpoint
ALTER TABLE "verse_text" ADD COLUMN "search" "tsvector" GENERATED ALWAYS AS (to_tsvector('scripture', coalesce(plain, ''))) STORED;--> statement-breakpoint
CREATE INDEX "verse_text_search_idx" ON "verse_text" USING gin ("search");
