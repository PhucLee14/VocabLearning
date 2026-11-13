import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Backend base URL including /api. Read at build time: changing it requires a redeploy.
const apiUrl = process.env.API_URL ?? "http://localhost:4300/api";

const isDev = process.env.NODE_ENV === "development";

/**
 * Content Security Policy: what the browser may load and run on our pages.
 *
 * script-src allows 'unsafe-inline' because pages are static (Cache Components /
 * PPR) and have inline scripts (the theme script in <head>, Next's bootstrap),
 * and a per-request nonce would force dynamic rendering. Everything else is
 * locked to our own origin, so even an injected script can't send data
 * elsewhere (connect-src), post forms elsewhere (form-action) or rewrite
 * relative URLs (base-uri). A stricter script-src via hashes (experimental
 * SRI) is a possible next step.
 *
 * External sources:
 * - media-src: word audio from the Free Dictionary API (`Word.audioUrl`).
 * Add a host here when the app starts loading something new from it.
 */
const csp = [
  "default-src 'self'",
  // Dev only: React and Turbopack use eval for stack traces and HMR.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "media-src 'self' https://api.dictionaryapi.dev",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // No upgrade-insecure-requests: every URL is relative or https, HSTS already
  // forces https in production, and it breaks `next start` on http://localhost.
].join("; ");

const nextConfig: NextConfig = {
  // The browser only ever calls same-origin /api/*; Next.js proxies it to the backend.
  // This keeps the future auth cookie first-party (browsers block third-party cookies).
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/:path*` }];
  },
  // Defence in depth; the backend sets its own headers on /api responses.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// Loads the i18n request config from src/i18n/request.ts
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
