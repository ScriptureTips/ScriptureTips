import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.ts";
import { type AccountSettings, accountSettingsFromEnv } from "./auth/config.ts";
import { DataModule } from "./data.module.ts";
import { type BuildSettings, buildSettingsFromEnv } from "./pdf-builds/settings.ts";
import { ReaderModule } from "./reader.module.ts";

/**
 * What the API serves (vision §7.2): `app`, an app instance; `data`, the data server, with only
 * the public routes the extension and website plugins read.
 */
export type ApiRole = "app" | "data";

/** The role from `API_ROLE` (`app` when not set); anything else is refused at start. */
export function apiRoleFromEnv(value = process.env["API_ROLE"]): ApiRole {
  if (value === undefined || value === "" || value === "app") return "app";
  if (value === "data") return "data";
  throw new Error(`API_ROLE must be "app" or "data", not "${value}"`);
}

/**
 * Whether an app instance has accounts (instance policy, vision §7.1): `ACCOUNTS=closed` serves
 * only the reader's public routes, until accounts open. Open when not set; anything else is
 * refused at start.
 */
export function accountsOpenFromEnv(value = process.env["ACCOUNTS"]): boolean {
  if (value === undefined || value === "" || value === "open") return true;
  if (value === "closed") return false;
  throw new Error(`ACCOUNTS must be "open" or "closed", not "${value}"`);
}

export interface AppOptions {
  /** From `API_ROLE` when not given. */
  role?: ApiRole;
  /** From `ACCOUNTS` when not given. Only an app instance has accounts. */
  accountsOpen?: boolean;
  /** Tests pass their own database. */
  databaseUrl?: string;
  /** From the environment when not given; tests pass a memory store and a mail list. */
  accounts?: AccountSettings;
  /** From the environment when not given; tests pass a memory store and queue. */
  builds?: BuildSettings;
}

/** The module for a role: the data server and a closed instance never read account settings. */
function moduleFor(options: AppOptions) {
  if ((options.role ?? apiRoleFromEnv()) === "data") return DataModule.create(options.databaseUrl);
  if (!(options.accountsOpen ?? accountsOpenFromEnv())) {
    return ReaderModule.create(options.databaseUrl);
  }
  return AppModule.create(
    options.accounts ?? accountSettingsFromEnv(),
    options.builds ?? buildSettingsFromEnv(),
    options.databaseUrl,
  );
}

/** The API on Fastify, under `/api`. */
export async function createApp(options: AppOptions = {}): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    moduleFor(options),
    new FastifyAdapter(),
    { logger: ["error", "warn"] },
  );
  app.setGlobalPrefix("api");
  app.enableShutdownHooks();
  return app;
}
