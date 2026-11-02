import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// The Prisma CLI (migrate, studio, seed) uses Neon's direct (non-pooled) connection.
// At runtime the app uses DATABASE_URL (pooled) – see src/prisma/prisma.service.ts.
// `prisma generate` needs no database, so a missing URL must not fail it
// (e.g. during `npm install` on a build server without DB variables).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
});
