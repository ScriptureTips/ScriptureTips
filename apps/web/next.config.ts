import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/** The API (compose.yaml sets `API_URL` in the stack). */
const API = process.env["API_URL"] ?? "http://api:3001/api";

const config: NextConfig = {
  // Production images (infra/docker/web) run the standalone server, traced from the repository
  // root so workspace packages are included.
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  // Workspace packages are TypeScript source.
  // The floating dev-tools badge covers controls at the bottom of small screens (and shows in
  // every screenshot). Errors still reach the browser console.
  devIndicators: false,
  transpilePackages: [
    "@scripturetips/canon",
    "@scripturetips/licenses",
    "@scripturetips/passage",
    "@scripturetips/reference",
    "@scripturetips/scripture-links",
    "@scripturetips/search",
    "@scripturetips/versification",
  ],
  // Account requests go through the web app to the API, so the session cookie belongs to
  // the site the user sees.
  rewrites: async () => [
    { source: "/api/auth/:path*", destination: `${API}/auth/:path*` },
    { source: "/api/account", destination: `${API}/account` },
    { source: "/api/account/:path*", destination: `${API}/account/:path*` },
    { source: "/api/search", destination: `${API}/search` },
    { source: "/api/search/:path*", destination: `${API}/search/:path*` },
    { source: "/api/study/:path*", destination: `${API}/study/:path*` },
    { source: "/api/translations/:path*", destination: `${API}/translations/:path*` },
    { source: "/api/widget/:path*", destination: `${API}/widget/:path*` },
    { source: "/api/links", destination: `${API}/links` },
    { source: "/api/links/:path*", destination: `${API}/links/:path*` },
    { source: "/api/compilations", destination: `${API}/compilations` },
    { source: "/api/compilations/:path*", destination: `${API}/compilations/:path*` },
  ],
  // Other hosts the dev server answers (`./dev up --lan` sets them): a phone on the network.
  allowedDevOrigins: (process.env["DEV_ORIGINS"] ?? "").split(",").filter(Boolean),
};

export default createNextIntlPlugin("./src/i18n/request.ts")(config);
