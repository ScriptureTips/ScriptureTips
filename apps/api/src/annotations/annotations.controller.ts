import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { z } from "zod";
import type { Auth } from "../auth/auth.ts";
import { signedInUser, type User } from "../auth/session.ts";
import { AUTH } from "../auth/tokens.ts";
import { DATABASE, type Database } from "../database.ts";
import {
  AnchorSchema,
  CompilationSlug,
  MAX_TEXT,
  Osis,
  Quote,
  TranslationId,
} from "../links/words.ts";
import { ZodPipe } from "../zod-pipe.ts";
import {
  AnnotationsService,
  type AnnotationView,
  type WordingView,
} from "./annotations.service.ts";

const AnnotationText = z.string().trim().min(1).max(MAX_TEXT);

const NewAnnotation = z
  .object({
    /** The compilation the words were selected in. */
    compilation: CompilationSlug,
    /** The words' verses, canonical OSIS. */
    source: Osis,
    body: AnnotationText,
    quote: Quote.optional(),
    anchor: AnchorSchema.optional(),
    collections: z.array(z.uuid()).max(100).optional(),
  })
  .strict();

const WordingQuery = z
  .object({
    ref: Osis,
    /** A translation's catalog ID, or `@compilation` (with `compilation`). */
    in: z.union([z.literal("@compilation"), TranslationId]),
    compilation: CompilationSlug,
  })
  .strict();

/** The user's own text on selected words (domain-model §3.4), private to them. */
@Controller("annotations")
export class AnnotationsController {
  constructor(
    @Inject(AnnotationsService) private readonly annotations: AnnotationsService,
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  /** The signed-in user's annotations on words in this passage. */
  @Get()
  async list(
    @Headers() headers: Record<string, string>,
    @Query("ref", new ZodPipe(Osis)) ref: string,
  ): Promise<{ annotations: AnnotationView[] }> {
    return { annotations: await this.annotations.list(await this.user(headers), ref) };
  }

  /**
   * A passage's verses in one wording, for choosing the words a copy is pinned to:
   * `?ref=Gen.1.24&in=leb&compilation=mine`.
   */
  @Get("wording")
  async wording(
    @Headers() headers: Record<string, string>,
    @Query(new ZodPipe(WordingQuery)) query: z.infer<typeof WordingQuery>,
  ): Promise<WordingView> {
    return this.annotations.wording(
      await this.user(headers),
      query.ref,
      query.in,
      query.compilation,
    );
  }

  @Post()
  async create(
    @Headers() headers: Record<string, string>,
    @Body(new ZodPipe(NewAnnotation)) body: z.infer<typeof NewAnnotation>,
  ): Promise<AnnotationView> {
    return this.annotations.create(await this.user(headers), {
      slug: body.compilation,
      source: body.source,
      body: body.body,
      quote: body.quote,
      anchor: body.anchor,
      collections: body.collections,
    });
  }

  @Patch(":id")
  async update(
    @Headers() headers: Record<string, string>,
    @Param("id", new ZodPipe(z.uuid())) id: string,
    @Body(new ZodPipe(z.object({ body: AnnotationText }).strict())) body: { body: string },
  ): Promise<AnnotationView> {
    return this.annotations.update(await this.user(headers), id, body.body);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(
    @Headers() headers: Record<string, string>,
    @Param("id", new ZodPipe(z.uuid())) id: string,
  ): Promise<void> {
    await this.annotations.remove(await this.user(headers), id);
  }

  private user(headers: Record<string, string>): Promise<User> {
    return signedInUser(this.auth, this.db, headers);
  }
}
