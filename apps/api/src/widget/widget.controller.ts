import { Controller, Get, Header, Inject, Query } from "@nestjs/common";
import { z } from "zod";
import { ZodPipe } from "../zod-pipe.ts";
import { type WidgetPassage, WidgetService, type WidgetTranslation } from "./widget.service.ts";

/** A canonical or entered passage in OSIS: `Gen.1.1`, `Isa.53.4-Isa.53.6`, `Rev.13.1!a`. */
const Osis =
  /^[1-3A-Za-z]{2,10}\.\d{1,3}\.\d{1,3}(![a-z])?(-[1-3A-Za-z]{2,10}\.\d{1,3}\.\d{1,3}(![a-z])?)?$/;

const PassageQuery = z
  .object({
    translation: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
    ref: z.string().regex(Osis),
    /** The numbering `ref` is in; a page's references are read in the KJV's. */
    scheme: z.enum(["kjv", "hebrew", "latin", "greek", "canonical"]).default("kjv"),
  })
  .strict();

/**
 * The public side for website plugins and the browser extension (vision §3.6). Read by other
 * sites' pages from the visitor's browser, so every answer is open to any origin (a plain GET with
 * no credentials: no preflight, no cookies) and cacheable.
 */
@Controller("widget")
export class WidgetController {
  constructor(@Inject(WidgetService) private readonly widget: WidgetService) {}

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
}
