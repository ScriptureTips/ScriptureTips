import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.ts";
import { type AccountSettings, accountSettingsFromEnv } from "./auth/config.ts";
import { DataModule } from "./data.module.ts";
import { type BuildSettings, buildSettingsFromEnv } from "./pdf-builds/settings.ts";

/**
 * What the API serves (vision §7.2): `app`, an app instance with everything; `data`, the data
 * server, with only the public routes the extension and website plugins read.
 */
export type ApiRole = "app" | "data";

/** The role from `API_ROLE` (`app` when not set); anything else is refused at start. */
export function apiRoleFromEnv(value = process.env["API_ROLE"]): ApiRole {
  if (value === undefined || value === "" || value === "app") return "app";
  if (value === "data") return "data";
  throw new Error(`API_ROLE must be "app" or "data", not "${value}"`);
}

export interface AppOptions {
  /** From `API_ROLE` when not given. */
  role?: ApiRole;
  /** Tests pass their own database. */
  databaseUrl?: string;
  /** From the environment when not given; tests pass a memory store and a mail list. */
  accounts?: AccountSettings;
  /** From the environment when not given; tests pass a memory store and queue. */
  builds?: BuildSettings;
}

/** The API on Fastify, under `/api`. */
export async function createApp(options: AppOptions = {}): Promise<NestFastifyApplication> {
  const role = options.role ?? apiRoleFromEnv();
  // The data server never reads the account or build settings, so it starts without them.
  const module =
    role === "data"
      ? DataModule.create(options.databaseUrl)
      : AppModule.create(
          options.accounts ?? accountSettingsFromEnv(),
          options.builds ?? buildSettingsFromEnv(),
          options.databaseUrl,
        );
  const app = await NestFactory.create<NestFastifyApplication>(module, new FastifyAdapter(), {
    logger: ["error", "warn"],
  });
  app.setGlobalPrefix("api");
  app.enableShutdownHooks();
  return app;
}
