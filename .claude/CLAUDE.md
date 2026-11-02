# Vocab – project notes for Claude Code

Multi-user English vocabulary learning web app. Plan: `PLAN.md`. Deployment: `docs/DEPLOYMENT.md`.

## Language

- The user writes in **Vietnamese**: reply to them in Vietnamese.
- **Everything in the repo is English**: docs (`PLAN.md`, `README.md`, `docs/`, this file, the work log) and code comments, test names and log/error messages.
- Exceptions: UI text in `frontend/messages/vi.json` and Vietnamese data (e.g. `nameVi` in `backend/prisma/seed/topics.json`, `meaning_vi` in import samples).

## Required: keep a work log

- After every working session, write to `.claude/worklog/YYYY-MM-DD.md` (one file per day; append to it for later sessions on the same day).
- Cover: the user's request, decisions made, work done, problems hit and how they were solved, verification results, next steps, open questions.
- When a roadmap item in `PLAN.md` section 9 is finished, tick it `[x]` there.
- **Never** put secrets (DB passwords, API keys) in the work log or docs.

## Architecture

- `frontend/`: Next.js 16.4 (App Router, Turbopack, Cache Components + Partial Prerendering on by default), Tailwind 4, next-intl 4. Port **3100**.
- `backend/`: NestJS 12 (**ESM**: `"type": "module"`, relative imports need a `.js` extension), Prisma 7 + `@prisma/adapter-pg`. Port **4100**, every route under `/api`.
- Database: Neon Postgres 18 in **Singapore** (`aws-ap-southeast-1`).
  - `DATABASE_URL` (pooled) is used at runtime.
  - `DIRECT_URL` (direct) is used by the Prisma CLI.
- Ports 3000/4000 are taken on the user's machine (4000 is `forge tunnel`); don't switch back.
- **Hosting: Vercel Hobby (free)** for both apps, region `sin1` (`vercel.json` in each app), Node `24.x` (`engines`). See `docs/DEPLOYMENT.md`.
  - The backend runs as a **serverless Vercel Function** (NestJS zero-config, entry `src/main.ts`).
    - Do not rely on in-process cron (`@nestjs/schedule`), timers or background work after the response is sent.
    - Max 300 s per request; 4.5 MB request/response bodies.
    - Scheduled work = HTTP endpoints protected by `CRON_SECRET`, triggered by Upstash QStash.
  - The browser calls same-origin `/api/*`; `frontend/next.config.ts` rewrites it to `API_URL` (read at build time). Server Components call `API_URL` directly (`src/lib/api.ts`).
  - Migrations are not run in the Vercel build: use `npm run db:migrate` / `db:deploy` from the dev machine.
  - Hobby is non-commercial only.

## Technical gotchas

- **Next.js 16 differs from training data**: read `frontend/node_modules/next/dist/docs/` before writing Next code (see `frontend/AGENTS.md`).
  - `middleware.ts` is now `proxy.ts`.
  - Read the locale with `next/root-params`.
  - With Cache Components, uncached data (API fetches, cookies) must sit inside `<Suspense>` or use `'use cache'`.
- **i18n**: routes live under `src/app/[locale]/...`, config in `src/i18n/`. New UI text goes into **both** `messages/vi.json` and `messages/en.json`. Keys are type-checked via `src/global.d.ts`.
- **Prisma 7**:
  - CLI config is `backend/prisma7.config.ts` (Prisma 7 looks for this filename).
  - The client is generated into `backend/src/generated/prisma/`; import from `../generated/prisma/client.js`.
  - The npm `latest` tag of `prisma` points to **8.0.0-rc**: always pin `prisma@7.x` and `@prisma/client@7.x`. The prisma.io docs now describe Prisma 8 ("contract" based), which does not apply here.
- **Health check**: `/api/health` must not query the DB, so Neon Free can scale to zero.
- **npm cache**: `~/.npm` on this machine has files with wrong permissions (EACCES). When installing packages, point `npm_config_cache` at a temp directory.
- `grep` in the shell is aliased to ugrep, which skips hidden/ignored files. Use `/usr/bin/grep` when searching `.env` or dotfiles.
- To check a Vercel build locally without logging in:
  - Create `<app>/.vercel/project.json` with `{"projectId":"local-test","orgId":"local-test","settings":{"framework":"nestjs"|"nextjs"}}`, then run `npx vercel@latest build --yes`.
  - Afterwards **delete `<app>/.vercel` (and `frontend/.next`)**: leftover output makes the next `next build` crash in Turbopack (`ModuleGraph::from_graphs_inner was canceled`).
- `prisma7.config.ts` must not throw when DB URLs are missing: `prisma generate` runs in `postinstall` on build servers.

## Commands

Backend:
- `npm run start:dev`, `npm test`, `npm run test:e2e`, `npm run lint`
- Database: `npm run db:migrate -- --name x`, `npm run db:deploy`, `npm run db:seed`, `npm run db:studio`

Frontend:
- `npm run dev`, `npm run typecheck`, `npm run lint`, `npm run build`
