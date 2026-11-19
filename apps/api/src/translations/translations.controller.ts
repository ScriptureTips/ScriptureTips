import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  Res,
} from "@nestjs/common";

import { z } from "zod";
import type { FastifyReplyLike } from "../auth/tokens.ts";
import { ZodPipe } from "../zod-pipe.ts";
import {
  type PassageResult,
  type TranslationBookSummary,
  type TranslationSummary,
  TranslationsService,
} from "./translations.service.ts";

const PassageQuery = z.object({ ref: z.string().trim().min(1).max(200) });
const TranslationId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);

@Controller("translations")
export class TranslationsController {
  constructor(@Inject(TranslationsService) private readonly translations: TranslationsService) {}

  /**
   * These are the same for everyone (the texts change only when a translation is imported), so
   * the answers are public and cacheable: the list and book lists briefly, a passage for longer.
   * Errors are answered without them (the header is set once there's an answer; a decorator
   * would put it on an error's reply too).
   */

  /** The translations that have text loaded. */
  @Get()
  async list(
    @Res({ passthrough: true }) reply: FastifyReplyLike,
  ): Promise<{ translations: TranslationSummary[] }> {
    reply.header("cache-control", "public, max-age=300");
    return { translations: await this.translations.list() };
  }

  /** The books a translation has text for, with their chapters, for the reader's book list. */
  @Get(":translation/books")
  async books(
    @Param("translation", new ZodPipe(TranslationId)) id: string,
    @Res({ passthrough: true }) reply: FastifyReplyLike,
  ): Promise<{ books: TranslationBookSummary[] }> {
    const books = await this.translations.books(id);
    if (!books) throw new NotFoundException({ code: "unknown-translation" });
    reply.header("cache-control", "public, max-age=300");
    return { books };
  }

  /**
   * A passage in a translation, written in its numbering: `?ref=Joel 2:28-32`. Errors come
   * back as codes, never as text: the UI words them.
   */
  @Get(":translation/passages")
  async passage(
    @Param("translation", new ZodPipe(TranslationId)) id: string,
    @Query(new ZodPipe(PassageQuery)) query: z.infer<typeof PassageQuery>,
    @Res({ passthrough: true }) reply: FastifyReplyLike,
  ): Promise<{ translation: TranslationSummary; passages: PassageResult[] }> {
    const outcome = await this.translations.passage(id, query.ref);
    if (outcome.ok) {
      reply.header("cache-control", "public, max-age=3600");
      return { translation: outcome.translation, passages: outcome.passages };
    }
    switch (outcome.reason) {
      case "unknown-translation":
        throw new NotFoundException({ code: "unknown-translation" });
      case "invalid-reference":
        throw new BadRequestException({ code: outcome.error.code, index: outcome.error.index });
      case "too-many-verses":
        throw new BadRequestException({ code: "too-many-verses", limit: outcome.limit });
    }
  }
}
