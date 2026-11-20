import { type DynamicModule, Module } from "@nestjs/common";
import { DatabaseModule } from "./database.ts";
import { SearchService } from "./search/search.service.ts";
import { TranslationsService } from "./translations/translations.service.ts";
import { WidgetController } from "./widget/widget.controller.ts";
import { WidgetService } from "./widget/widget.service.ts";

/**
 * The data server (`scripture.tips`, vision §7.2): only the public, read-only routes the browser
 * extension and website plugins read. No accounts, PDF builds or private routes, so it needs only
 * the database: no Valkey, SMTP or file store.
 */
@Module({
  controllers: [WidgetController],
  providers: [TranslationsService, SearchService, WidgetService],
})
export class DataModule {
  /** The data server on a database (`DATABASE_URL`, or the URL given). */
  static create(databaseUrl?: string): DynamicModule {
    return { module: DataModule, imports: [DatabaseModule.forUrl(databaseUrl)] };
  }
}
