import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
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

/** A canonical passage in OSIS: `Gen.1.1`, `Isa.53.4-Isa.53.6`, `Rev.13.1!a`. */
const Osis = z
  .string()
  .regex(
    /^[1-3A-Za-z]{2,10}\.\d{1,3}\.\d{1,3}(![a-z])?(-[1-3A-Za-z]{2,10}\.\d{1,3}\.\d{1,3}(![a-z])?)?$/,
  );

const TranslationId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);

const Point = z
  .object({
    verse: z
      .string()
      .regex(
        /^([1-3A-Za-z]{2,10}\.\d{1,3}\.\d{1,3}(![a-z])?)( [1-3A-Za-z]{2,10}\.\d{1,3}\.\d{1,3}(![a-z])?)*$/,
      ),
    offset: z.number().int().min(0).max(100_000),
  })
  .strict();

/** The wording the selected words were in (a catalog ID or `@compilation`), and where they sit. */
const Anchor = z
  .object({
    in: z.string().regex(/^(@compilation|[A-Za-z0-9_-]{1,40})$/),
    compilation: z.string().regex(/^[a-z0-9]{2,12}$/i),
    start: Point,
    end: Point,
  })
  .strict();

/** The most characters of selected words a link keeps. */
const MAX_QUOTE = 500;

const NewLink = z
  .object({
    /** The compilation whose numbering the target is typed in. */
    compilation: z.string().regex(/^[a-z0-9]{2,12}$/i),
    source: Osis,
    /** A reference as typed, or a passage picked from search results (`reference` in OSIS). */
    target: z.union([
      z.string().trim().min(1).max(200),
      z.object({ reference: Osis, translation: TranslationId }).strict(),
    ]),
    /** The words selected, and where they're pinned (the link itself is verse to verse). */
    quote: z.string().trim().min(1).max(MAX_QUOTE).optional(),
    anchor: Anchor.optional(),
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
