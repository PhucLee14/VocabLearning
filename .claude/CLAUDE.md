# Godee (repo: Vocab) – project notes for Claude Code

Multi-user English vocabulary learning web app, named **Godee** (renamed from "Vocab" on 2026-11-03; folders, package names, the `vocab_session` cookie and DB names keep "vocab"). Production frontend: https://godee.vercel.app. Plan: `PLAN.md`. Deployment: `docs/DEPLOYMENT.md`. Word data sources: `docs/DATA_SOURCES.md`.

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

- `frontend/`: Next.js 16.4 (App Router, Turbopack, Cache Components + Partial Prerendering on by default), Tailwind 4, next-intl 4. Port **3300**.
- `backend/`: NestJS 12 (**ESM**: `"type": "module"`, relative imports need a `.js` extension), Prisma 7 + `@prisma/adapter-pg`. Port **4300**, every route under `/api`.
- Database: Neon Postgres 18 in **Singapore** (`aws-ap-southeast-1`).
  - `DATABASE_URL` (pooled) is used at runtime.
  - `DIRECT_URL` (direct) is used by the Prisma CLI.
- Ports in use by the user's other projects: 3000–3002, 4000 (`forge tunnel`), 5000, 5173, 8000, 8080. This app uses **3300/4300** (moved from 3100/4100 on 2026-11-02 at the user's request); don't switch back.
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
- **UI design** (friendly learning-app look, 2026-11-03; replaced the earlier "reference manual" look):
  - Tokens live in `frontend/src/app/globals.css` and map to Tailwind colors: `canvas` (page), `surface` (pale green panels), `raised`, `sunken`, `ink`, `muted`, `line`, `line-strong`, `accent` (+ `accent-lip`, `accent-soft`, `accent-ink`, `on-accent`), `streak` (+ `-soft`), `danger` (+ `-soft`), `warning-soft`/`warning-ink`, and the mastery ramp `m0`–`m5`. Use these, not raw hex or Tailwind palette colors.
  - One font: Nunito (`font-sans`, Vietnamese subset). No monospace in the UI; numbers use `.num` (tabular figures).
  - Shared classes in `@layer components`: `.btn` + `.btn-primary|secondary|danger|ghost` (+ `.btn-lg|sm`; pill with a solid lip, no shadow), `.panel` (tonal panel), `.card` (white card, 1px line), `.pill` (+ `-accent|-streak|-danger`), `.chip` (pressed = `aria-pressed="true"` or `aria-current="page"`), `.seg` (segmented control), `.input`, `.field-label`, `.num`. Flashcard flip: `.flip`, `.flip-inner[data-flipped]`, `.flip-face`, `.flip-back`.
  - House rules: flat surfaces (a tone step or a 1px line, never a resting shadow), no gradients, no emoji, colour on data (mastery ramp, today's bar, streak) and on the one primary action.
  - Element defaults must stay inside `@layer base`: unlayered CSS beats every Tailwind utility.
  - Theme: Light / Dark / System. Stored in `localStorage` (`theme`), applied as `data-theme` on `<html>` by an inline script in `<head>` (`src/lib/theme.ts`, `src/components/inline-script.tsx`), so pages stay static and there is no flash. No `data-theme` = follow the OS. Don't move it to a cookie (that would make every page dynamic).
  - Layout: `src/app/[locale]/(site)/` = public pages with the site header; `src/app/[locale]/(app)/` = the app shell (sidebar ≥1024px, top bar + bottom bar below). Wrap page content in `<Page>` from `components/shell/app-shell.tsx`.
- **Auth** (`backend/src/auth/`): database-backed sessions, not JWT. Google sign-in: `auth/google.ts` (server-side OAuth code flow + PKCE, `jose` checks the ID token); the callback is `<first FRONTEND_URL>/api/auth/google/callback`, and Google-only accounts have no password (`hasPassword` in `/me`; set-password needs no current one; delete confirms by email). Cookie `vocab_session` (httpOnly, SameSite=Lax, `secure` when `NODE_ENV=production`), 30 days, sliding. Guards: `SessionGuard` (401) and `OptionalSessionGuard`; `@CurrentUser()`. Wrong password on a signed-in action is **403**, not 401 (the client treats 401 as "signed out").
  - Frontend: Server Components read the user with `src/lib/server-api.ts` (`userGet` forwards the cookie and redirects to `/login` on 401; `optionalUserGet`; `getViewer`); Client Components call `src/lib/client-api.ts` (`api()`), then `router.refresh()`. Reading the session is dynamic: keep it inside `<Suspense>`.
  - Client hooks that read the URL (`usePathname`, `useSearchParams`) must sit inside `<Suspense>` too, or `next build` fails on dynamic routes (see `components/locale-switcher.tsx`).
  - ICU lists canonical time zone names (`Asia/Saigon`), not the stored alias (`Asia/Ho_Chi_Minh`): a time zone `<select>` must include the stored value.
- **i18n**: routes live under `src/app/[locale]/...`, config in `src/i18n/`. New UI text goes into **both** `messages/vi.json` and `messages/en.json`. Keys are type-checked via `src/global.d.ts`.
- **Prisma 7**:
  - CLI config is `backend/prisma7.config.ts` (Prisma 7 looks for this filename).
  - The client is generated into `backend/src/generated/prisma/`; import from `../generated/prisma/client.js`.
  - The npm `latest` tag of `prisma` points to **8.0.0-rc**: always pin `prisma@7.x` and `@prisma/client@7.x`. The prisma.io docs now describe Prisma 8 ("contract" based), which does not apply here.
- **Health check**: `/api/health` must not query the DB, so Neon Free can scale to zero.
- If the dev server keeps serving stale CSS after an edit, save the file again (a change written by a shell script was once missed by Turbopack's watcher).
- Dev servers started by Claude: stop them before ending the turn, or they hold 3300/4300 and the user gets `EADDRINUSE`. Stopping `nest start --watch` can leave its child `node dist/main` listening; check with `lsof -nP -iTCP:3300,4300 -sTCP:LISTEN` and kill by PID.
- When the user's own `npm run start:dev` is running, don't run `npm run build` in `backend/` (it deletes and rebuilds `dist/`, which their watcher runs from; on 2026-11-03 their server on 4300 stopped during such a build) and never `pkill` by a command pattern: stop only the PIDs you started. To test a backend build, start it from its own copy or restart theirs afterwards (a real content change in `src/` makes `nest start --watch` restart).
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
- Words: `npm run words:cefrj` (A1–C2 lists from CEFR-J + Octanove into `scripts/words/out/`, gitignored), `npm run words:enrich -- <list.csv|json> [--concurrency 4]` (free sources, cached in `scripts/words/.cache`), then `npm run words:import -- <file> --dry-run` / without `--dry-run`. Sources, licences and attribution: `docs/DATA_SOURCES.md`. Never call these external APIs from request handlers. Cambridge Dictionary content must not be scraped (licensed API only).

Frontend:
- `npm run dev`, `npm run typecheck`, `npm run lint`, `npm run build`
