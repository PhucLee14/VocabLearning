# Godee – English vocabulary learning app

Production: https://godee.vercel.app (the repository and its folders keep the original name `Vocab`).

Learn English words by topic and CEFR level, with flashcards, spaced repetition (FSRS), streaks, study-time tracking and review reminders.
Full plan: [PLAN.md](PLAN.md) · Deployment: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) · Word data: [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md)

## Structure

```text
frontend/   Next.js 16 + Tailwind 4 + next-intl (vi/en)       → http://localhost:3300
backend/    NestJS 12 + Prisma 7 + PostgreSQL (Neon, Singapore) → http://localhost:4300/api
docs/       Documentation (deployment…)
.claude/    Project notes & work log
```

Ports 3300/4300 avoid the ports used by other local projects (3000–3002, 4000, 5000, 5173, 8000, 8080).

## First run

Requires Node.js ≥ 24.

```bash
# 1) Backend
cd backend
cp .env.example .env          # fill in the Neon DATABASE_URL (pooled) + DIRECT_URL (direct)
npm install                   # also runs prisma generate
npm run db:deploy             # apply migrations
npm run db:seed               # seed the topic framework
npm run start:dev             # http://localhost:4300/api/health

# 2) Frontend (another terminal)
cd frontend
cp .env.example .env.local
npm install
npm run dev                   # http://localhost:3300 → redirects to /vi
```

## Common commands

| Folder | Command | Purpose |
|--------|---------|---------|
| backend | `npm run db:migrate -- --name <name>` | Create a migration after editing `prisma/schema.prisma` |
| backend | `npm run db:studio` | Browse data in Prisma Studio |
| backend | `npm run words:cefrj` | Build A1–C2 word lists from CEFR-J + Octanove into `scripts/words/out/` |
| backend | `npm run words:enrich -- <list.csv\|json> [--concurrency 4]` | Fill definitions, IPA, audio, Vietnamese and examples from free sources ([docs/DATA_SOURCES.md](docs/DATA_SOURCES.md)) |
| backend | `npm run words:import -- <file> [--dry-run]` | Import words (JSON/CSV, PLAN.md §7) into the DB |
| backend | `npm run words:clear-audio -- [--dry-run]` | Remove audio links on blocked hosts (`api.dictionaryapi.dev`) from words in the DB |
| backend | `npm test` / `npm run test:e2e` | Unit tests / e2e tests (e2e uses the DB in `.env`) |
| backend | `npm run lint` | oxlint |
| frontend | `npm run typecheck` | Generate route types + TypeScript check |
| frontend | `npm run lint` / `npm run build` | ESLint / production build |

## Deployment

Free on **Vercel Hobby** (two projects from this repo: Root Directory `backend` and `frontend`, region `sin1`) + **Neon Free** (Singapore).
Step-by-step guide: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) §2.

The frontend proxies `/api/*` to the backend (`frontend/next.config.ts`), so the browser only ever talks to the frontend's own domain.

## Current API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Liveness; does **not** query the DB (use it for platform health checks) |
| GET | `/api/health/db` | DB connectivity check |
| GET | `/api/topics` | Two-level topic tree with each topic's word count |
