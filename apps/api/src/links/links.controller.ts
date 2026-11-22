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
import { ZodPipe } from "../zod-pipe.ts";
import { LinksService, type LinkView } from "./links.service.ts";
import { AnchorSchema, CompilationSlug, MAX_TEXT, Osis, Quote, TranslationId } from "./words.ts";

/** What a link goes to: a reference as typed, or a passage picked from search results. */
const Target = z.union([
  z.string().trim().min(1).max(200),
  z.object({ reference: Osis, translation: TranslationId }).strict(),
]);

const NewLink = z
  .object({
    /** The compilation whose numbering the target is typed in. */
    compilation: CompilationSlug,
    source: Osis,
    /** A reference as typed, or a passage picked from search results (`reference` in OSIS). */
    target: Target,
    /** The words selected, and where they're pinned (the link itself is verse to verse). */
    quote: Quote.optional(),
    anchor: AnchorSchema.optional(),
    /** A note made with it (the annotations page's add). */
    note: z.string().trim().min(1).max(MAX_TEXT).optional(),
    /** The collections it's put in (none: the default collection). */
    collections: z.array(z.uuid()).max(100).optional(),
  })
  .strict();

const LinkChanges = z
  .object({
    /** Its note: text, or null (or empty) to remove it. */
    note: z.string().max(MAX_TEXT).nullable().optional(),
    /** Where it goes: typed in the numbering of `compilation`, or picked from search results. */
    target: Target.optional(),
    compilation: CompilationSlug.optional(),
  })
  .strict();

@Controller("links")
export class LinksController {
  constructor(
    @Inject(LinksService) private readonly links: LinksService,
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  /** The signed-in user's links with this passage at either end. */
  @Get()
  async list(
    @Headers() headers: Record<string, string>,
    @Query("ref", new ZodPipe(Osis)) ref: string,
  ): Promise<{ links: LinkView[] }> {
    return { links: await this.links.list(await this.user(headers), ref) };
  }

  @Post()
  async create(
    @Headers() headers: Record<string, string>,
    @Body(new ZodPipe(NewLink)) body: z.infer<typeof NewLink>,
  ): Promise<LinkView> {
    return this.links.create(await this.user(headers), {
      slug: body.compilation,
      source: body.source,
      target: body.target,
      quote: body.quote,
      anchor: body.anchor,
      note: body.note,
      collections: body.collections,
    });
  }

  /** Changes a link's note, or the passage it goes to. */
  @Patch(":id")
  async update(
    @Headers() headers: Record<string, string>,
    @Param("id", new ZodPipe(z.uuid())) id: string,
    @Body(new ZodPipe(LinkChanges)) body: z.infer<typeof LinkChanges>,
  ): Promise<LinkView> {
    return this.links.update(await this.user(headers), id, {
      note: body.note,
      target: body.target,
      ...(body.compilation ? { slug: body.compilation } : {}),
    });
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(
    @Headers() headers: Record<string, string>,
    @Param("id", new ZodPipe(z.uuid())) id: string,
  ): Promise<void> {
    await this.links.remove(await this.user(headers), id);
  }

  private user(headers: Record<string, string>): Promise<User> {
    return signedInUser(this.auth, this.db, headers);
  }
}
