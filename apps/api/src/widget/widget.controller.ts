import { Controller, Get, Header, Inject, Query } from "@nestjs/common";
import { z } from "zod";
import { kindsOf, SearchParams } from "../search/search.controller.ts";
import { type SearchResponse, SearchService, type Suggestion } from "../search/search.service.ts";
import { ZodPipe } from "../zod-pipe.ts";
import {
  type WidgetBook,
  type WidgetPassage,
  WidgetService,
  type WidgetTranslation,
} from "./widget.service.ts";

/** A canonical or entered passage in OSIS: `Gen.1.1`, `Isa.53.4-Isa.53.6`, `Rev.13.1!a`. */
const Osis =
  /^[1-3A-Za-z]{2,10}\.\d{1,3}\.\d{1,3}(![a-z])?(-[1-3A-Za-z]{2,10}\.\d{1,3}\.\d{1,3}(![a-z])?)?$/;

const PassageQuery = z
  .object({
    translation: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
    ref: z.string().regex(Osis),
    /** The numbering `ref` is in; a page's references are read in the KJV's. `own`: the translation's own (what a search result's reference is in). */
    scheme: z.enum(["kjv", "hebrew", "latin", "greek", "canonical", "own"]).default("kjv"),
  })
  .strict();

const BookQuery = z
  .object({
    translation: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
  })
  .strict();

const ChapterQuery = z
  .object({
    translation: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
    book: z.string().regex(/^[1-3A-Za-z]{2,10}$/),
    chapter: z.coerce.number().int().min(1).max(200),
  })
  .strict();

/**
 * The public side for website plugins and the browser extension (vision §3.6). Read by other
 * sites' pages from the visitor's browser, so every answer is open to any origin (a plain GET with
 * no credentials: no preflight, no cookies) and cacheable.
 */
@Controller("widget")
export class WidgetController {
  constructor(
    @Inject(WidgetService) private readonly widget: WidgetService,
    @Inject(SearchService) private readonly search: SearchService,
  ) {}

  /** The translations a search may use: those asked for that may be shown, else all of them. */
  private async allowed(asked: string[] | undefined): Promise<string[]> {
    const shown = (await this.widget.list()).map((t) => t.id);
    return asked?.length ? asked.filter((id) => shown.includes(id)) : shown;
  }

  /**
   * The search widget's search (vision §3.14): the core search over the translations that may be
   * shown on other sites, with passages, words and Strong's numbers in one field.
   */
  @Get("search")
  @Header("access-control-allow-origin", "*")
  @Header("cache-control", "public, max-age=60")
  async find(
    @Query(new ZodPipe(SearchParams)) p: z.infer<typeof SearchParams>,
  ): Promise<SearchResponse> {
    const { known, unknown } = kindsOf(p.kinds);
    const translations = await this.allowed(p.translations);
    // Shown in a translation only if it may be shown here; one that may not is ignored.
    const showIn = p.showIn ? ((await this.allowed([p.showIn]))[0] ?? null) : null;
    const found = await this.search.search({
      q: p.q,
      kinds: known,
      translations,
      showIn,
      limit: p.limit,
      offset: p.offset,
      previewLength: p.previewLength,
    });
    return { ...found, unavailable: unknown };
  }

  /** What the text typed so far could become, for the search widget's suggestions. */
  @Get("suggest")
  @Header("access-control-allow-origin", "*")
  @Header("cache-control", "public, max-age=300")
  async suggest(
    @Query(new ZodPipe(SearchParams)) p: z.infer<typeof SearchParams>,
  ): Promise<{ query: string; suggestions: Suggestion[] }> {
    const { known } = kindsOf(p.kinds);
    return {
      query: p.q,
      suggestions: await this.search.suggest(p.q, known, Math.min(p.limit, 10)),
    };
  }

  /** The translations that may be shown on other sites. */
  @Get("translations")
  @Header("access-control-allow-origin", "*")
  @Header("cache-control", "public, max-age=300")
  async translations(): Promise<{ translations: WidgetTranslation[] }> {
    return { translations: await this.widget.list() };
  }

  /** A passage's words (at most a few verses), with the attribution its license asks for. */
  @Get("passage")
  @Header("access-control-allow-origin", "*")
  @Header("cache-control", "public, max-age=300")
  passage(
    @Query(new ZodPipe(PassageQuery)) query: z.infer<typeof PassageQuery>,
  ): Promise<WidgetPassage> {
    return this.widget.passage({
      translation: query.translation,
      reference: query.ref,
      scheme: query.scheme,
    });
  }

  /** A translation's books and their chapters, for the search widget's reader. */
  @Get("books")
  @Header("access-control-allow-origin", "*")
  @Header("cache-control", "public, max-age=300")
  async books(
    @Query(new ZodPipe(BookQuery)) query: z.infer<typeof BookQuery>,
  ): Promise<{ books: WidgetBook[] }> {
    return { books: await this.widget.books(query.translation) };
  }

  /** A whole chapter, in the translation's own numbering, for the search widget's reader. */
  @Get("chapter")
  @Header("access-control-allow-origin", "*")
  @Header("cache-control", "public, max-age=300")
  chapter(
    @Query(new ZodPipe(ChapterQuery)) query: z.infer<typeof ChapterQuery>,
  ): Promise<WidgetPassage> {
    return this.widget.chapter(query);
  }
}
