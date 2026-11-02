# Vocab – English vocabulary learning app

Learn English words by topic and CEFR level, with flashcards, spaced repetition (FSRS), streaks, study-time tracking and review reminders.
Full plan: [PLAN.md](PLAN.md) · Deployment: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## Structure

```text
frontend/   Next.js 16 + Tailwind 4 + next-intl (vi/en)       → http://localhost:3100
backend/    NestJS 12 + Prisma 7 + PostgreSQL (Neon, Singapore) → http://localhost:4100/api
docs/       Documentation (deployment…)
.claude/    Project notes & work log
```

Ports 3100/4100 avoid 3000/4000, which other tools often occupy.

## First run

Requires Node.js ≥ 24.

```bash
# 1) Backend
cd backend
cp .env.example .env          # fill in the Neon DATABASE_URL (pooled) + DIRECT_URL (direct)
npm install                   # also runs prisma generate
npm run db:deploy             # apply migrations
npm run db:seed               # seed the topic framework
npm run start:dev             # http://localhost:4100/api/health

# 2) Frontend (another terminal)
cd frontend
cp .env.example .env.local
npm install
npm run dev                   # http://localhost:3100 → redirects to /vi
```

## Common commands

| Folder | Command | Purpose |
|--------|---------|---------|
| backend | `npm run db:migrate -- --name <name>` | Create a migration after editing `prisma/schema.prisma` |
| backend | `npm run db:studio` | Browse data in Prisma Studio |
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
