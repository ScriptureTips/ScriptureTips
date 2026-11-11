import { type DynamicModule, Module } from "@nestjs/common";
import { DatabaseModule } from "./database.ts";
import { SearchController } from "./search/search.controller.ts";
import { SearchService } from "./search/search.service.ts";
import { StudyController } from "./study/study.controller.ts";
import { StudyService } from "./study/study.service.ts";
import { TranslationsController } from "./translations/translations.controller.ts";
import { TranslationsService } from "./translations/translations.service.ts";
import { WidgetController } from "./widget/widget.controller.ts";
import { WidgetService } from "./widget/widget.service.ts";

/**
 * An app instance with accounts closed (`ACCOUNTS=closed`, vision §10 "Extension release"): the
 * public routes the reader uses (translations and passages, search, study words, the widget),
 * and nothing that needs a session. It needs only the database: no Valkey, SMTP or file store.
 */
@Module({
  controllers: [TranslationsController, SearchController, StudyController, WidgetController],
  providers: [TranslationsService, SearchService, StudyService, WidgetService],
})
export class ReaderModule {
  /** The reader's API on a database (`DATABASE_URL`, or the URL given). */
  static create(databaseUrl?: string): DynamicModule {
    return { module: ReaderModule, imports: [DatabaseModule.forUrl(databaseUrl)] };
  }
}
