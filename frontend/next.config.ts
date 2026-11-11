import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Backend base URL including /api. Read at build time: changing it requires a redeploy.
const apiUrl = process.env.API_URL ?? "http://localhost:4300/api";

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
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
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
