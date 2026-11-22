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
  Put,
  Query,
} from "@nestjs/common";
import { z } from "zod";
import type { Auth } from "../auth/auth.ts";
import { signedInUser, type User } from "../auth/session.ts";
import { AUTH } from "../auth/tokens.ts";
import { DATABASE, type Database } from "../database.ts";
import { AnchorSchema, Quote } from "../links/words.ts";
import { ZodPipe } from "../zod-pipe.ts";
import {
  CollectionsService,
  type CollectionView,
  type ItemFilter,
  type ItemView,
} from "./collections.service.ts";

const Title = z.string().trim().min(1).max(80);
/** A collection's description: the preface for the translation it's printed or published with. */
const Description = z.string().max(2000);
const Kind = z.enum(["link", "annotation"]);
const Collections = z.array(z.uuid()).max(100);

const TakeOut = z
  .object({
    /** The collection it's taken out of: its ID, or `default` (the items in no collection). */
    from: z.union([z.literal("default"), z.uuid()]),
    keep: z.enum(["true", "false"]).optional(),
  })
  .strict();

const ItemsQuery = z
  .object({
    /** `all`, `default` (the items in no collection), or a collection's ID. */
    in: z.union([z.literal("all"), z.literal("default"), z.uuid()]).default("all"),
    from: z.coerce.number().int().min(0).max(1_000_000).default(0),
  })
  .strict();

/** Words chosen by the user (in another wording) to pin an item, or a copy of one, to. */
const Words = z.object({ quote: Quote, anchor: AnchorSchema }).strict();

const Copy = z
  .object({
    /** The copy's collections (none: the default collection). */
    collections: Collections,
    /** Other words to pin the copy to: in another wording, chosen by the user. */
    words: Words.optional(),
  })
  .strict();

/**
 * The user's annotation collections (domain-model §3.6), and their links and annotations as the
 * annotations page lists and sorts them: put in collections, taken out, moved, and copied.
 */
@Controller("collections")
export class CollectionsController {
  constructor(
    @Inject(CollectionsService) private readonly collections: CollectionsService,
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  /** The collections, and how many items are in each, in the default collection and in all. */
  @Get()
  async list(
    @Headers() headers: Record<string, string>,
  ): Promise<{ collections: CollectionView[]; unsorted: number; total: number }> {
    return this.collections.list(await this.user(headers));
  }

  /** A new collection: its title, and a description if it has one. */
  @Post()
  async create(
    @Headers() headers: Record<string, string>,
    @Body(new ZodPipe(z.object({ title: Title, description: Description.optional() }).strict()))
    body: { title: string; description?: string },
  ): Promise<CollectionView> {
    return this.collections.create(await this.user(headers), body.title, body.description);
  }

  /** A page of the links and annotations: `?in=all|default|{id}&from=0`. */
  @Get("items")
  async items(
    @Headers() headers: Record<string, string>,
    @Query(new ZodPipe(ItemsQuery)) query: z.infer<typeof ItemsQuery>,
  ): Promise<{ items: ItemView[]; more: boolean }> {
    const filter: ItemFilter =
      query.in === "all" || query.in === "default" ? query.in : { collection: query.in };
    return this.collections.items(await this.user(headers), filter, query.from);
  }

  /** Puts a link or an annotation in exactly these collections (none: the default one). */
  @Put("items/:kind/:id")
  async place(
    @Headers() headers: Record<string, string>,
    @Param("kind", new ZodPipe(Kind)) kind: z.infer<typeof Kind>,
    @Param("id", new ZodPipe(z.uuid())) id: string,
    @Body(new ZodPipe(z.object({ collections: Collections }).strict()))
    body: { collections: string[] },
  ): Promise<ItemView> {
    return this.collections.place(await this.user(headers), kind, id, body.collections);
  }

  /** A copy of a link or an annotation, of its own, in these collections; or on other words. */
  @Post("items/:kind/:id/copies")
  async copy(
    @Headers() headers: Record<string, string>,
    @Param("kind", new ZodPipe(Kind)) kind: z.infer<typeof Kind>,
    @Param("id", new ZodPipe(z.uuid())) id: string,
    @Body(new ZodPipe(Copy)) body: z.infer<typeof Copy>,
  ): Promise<ItemView> {
    return this.collections.copy(await this.user(headers), kind, id, body);
  }

  /** Moves a link or an annotation onto other words (in another wording): the same item. */
  @Put("items/:kind/:id/words")
  async repin(
    @Headers() headers: Record<string, string>,
    @Param("kind", new ZodPipe(Kind)) kind: z.infer<typeof Kind>,
    @Param("id", new ZodPipe(z.uuid())) id: string,
    @Body(new ZodPipe(Words)) body: z.infer<typeof Words>,
  ): Promise<ItemView> {
    return this.collections.repin(await this.user(headers), kind, id, body);
  }

  /**
   * Takes a link or an annotation out of a collection (`?from=` its ID, or `default`), deleting it
   * once no collection holds it; `&keep=true` never deletes (`last-collection`, 409, instead).
   */
  @Delete("items/:kind/:id")
  async takeOut(
    @Headers() headers: Record<string, string>,
    @Param("kind", new ZodPipe(Kind)) kind: z.infer<typeof Kind>,
    @Param("id", new ZodPipe(z.uuid())) id: string,
    @Query(new ZodPipe(TakeOut)) query: z.infer<typeof TakeOut>,
  ): Promise<{ deleted: boolean; collections: string[] }> {
    return this.collections.takeOut(
      await this.user(headers),
      kind,
      id,
      query.from,
      query.keep === "true",
    );
  }

  @Patch(":id")
  async rename(
    @Headers() headers: Record<string, string>,
    @Param("id", new ZodPipe(z.uuid())) id: string,
    @Body(new ZodPipe(z.object({ title: Title }).strict())) body: { title: string },
  ): Promise<CollectionView> {
    return this.collections.rename(await this.user(headers), id, body.title);
  }

  /** Deletes a collection; its links and annotations stay (in the default one, if in no other). */
  @Delete(":id")
  @HttpCode(204)
  async remove(
    @Headers() headers: Record<string, string>,
    @Param("id", new ZodPipe(z.uuid())) id: string,
  ): Promise<void> {
    await this.collections.remove(await this.user(headers), id);
  }

  private user(headers: Record<string, string>): Promise<User> {
    return signedInUser(this.auth, this.db, headers);
  }
}
