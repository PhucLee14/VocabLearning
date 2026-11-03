# Deployment

> Decision (2026-11-02): **deploy for free**. Hosting research was done the same day using each provider's official pricing and docs (sources at the end). Prices and free-tier limits change often, so re-check them before signing up.

## 1. Chosen setup: Vercel Hobby + Neon Free (0 USD)

| Part | Where | Region |
|------|-------|--------|
| Frontend (`frontend/`) | **Vercel Hobby** – Next.js | `sin1` (Singapore) |
| Backend (`backend/`) | **Vercel Hobby** – NestJS runs as one Vercel Function (zero-config support) | `sin1` (Singapore) |
| Database | **Neon Free** ✔ already set up | `aws-ap-southeast-1` (Singapore) |
| Hourly reminders (Phase 2) | **Upstash QStash Free** calls `/api/cron/reminders` every hour | – |
| Email (Phase 2) | **Resend Free**, once there is a custom domain. Until then, Web Push only. | – |

### Why Vercel for the backend (not Render Free)

- **Render Free** sleeps after 15 idle minutes, and waking takes **~1 minute**. Most learners open the app once a day, so almost every first visit would hit that wait.
- **Vercel Functions** scale to zero too, but cold starts take well under a second. They run in the same region as the database (`sin1`).
- Verified locally on 2026-11-02:
  - `vercel build` succeeds for both projects (Node 24 runtime).
  - The built NestJS function bundle (13 MB, limit 250 MB) serves `/api/health`, `/api/health/db` and `/api/topics` against the Neon DB.

### Limits and trade-offs of this setup

- **Vercel Hobby is for non-commercial use only.** Ads or payments require Pro (20 USD/month).
- The backend is **serverless**:
  - No in-process cron (`@nestjs/schedule`), no long-running background workers.
  - Each request may run for at most **300 s**.
  - Request and response bodies are limited to **4.5 MB**; import very large files through the CLI script instead of the admin UI.
- Vercel Hobby cron jobs run **only once a day**. Hourly reminders therefore need an external scheduler (QStash) that calls an HTTP endpoint protected by `CRON_SECRET`. That endpoint must be idempotent (`reminder_logs` unique key).
- Free usage: 1M function invocations, 4 h of Active CPU (waiting for the DB does not count) and 100 GB transfer per month. That is plenty for a small app.
- **Preview deployments** are protected by Vercel Authentication on Hobby; the **production** domains are public. Always point `API_URL` at the backend's **production** domain.
- For now, local development and production **share one Neon database**. Later, create a Neon `dev` branch for local work (Neon Free includes branches).

## 2. Step-by-step deployment

Prerequisites:
- The code is in a **GitHub repository owned by your personal account**. Vercel Hobby cannot import repos owned by a GitHub organization. A private repo is fine.
- A Vercel account (Hobby, sign in with GitHub).

### 2.1 Backend

1. Vercel → **Add New… → Project** → import the repo.
2. Set **Root Directory** to `backend`. The framework preset should be detected as **NestJS**. Leave the build settings empty: `npm run build` runs `prisma generate && nest build`.
3. Add **Environment Variables** (copy the values from `backend/.env`):

   | Name | Value |
   |------|-------|
   | `DATABASE_URL` | Neon **pooled** URL (host contains `-pooler`) |
   | `DIRECT_URL` | Neon **direct** URL |
   | `FRONTEND_URL` | Placeholder for now, e.g. `https://example.com`; fix it in step 2.3 |
   | `GOOGLE_CLIENT_ID` | Optional, for "Continue with Google" (section 2.5) |
   | `GOOGLE_CLIENT_SECRET` | Optional, same OAuth client |

   - Do **not** add `PORT`: Vercel runs the app as a function and handles the port itself. `PORT=4300` only matters locally.
   - Paste the values **without** the surrounding quotes from `.env`, or the quotes become part of the value and the DB connection fails. Alternatively, paste the whole `.env` into the first Key field (Vercel splits it into variables), then delete `PORT` and fix `FRONTEND_URL`.

4. Click **Deploy**. Note the production domain, e.g. `https://vocab-backend.vercel.app`.
5. Check `https://<backend-domain>/api/health` and `/api/health/db`. Both should return `{"status":"ok"...}`.

### 2.2 Frontend

1. Vercel → **Add New… → Project** → import the **same repo** again.
2. Set **Root Directory** to `frontend`. The preset is **Next.js**.
3. Environment variable: `API_URL` = `https://<backend-domain>/api`.
4. **Deploy**. Open `https://<frontend-domain>/`: it redirects to `/vi` and lists the 24 topics.

### 2.3 Finish

1. Backend project → Settings → Environment Variables: set `FRONTEND_URL` to `https://<frontend-domain>`, then **Redeploy**.
2. In both projects, check **Settings → Functions → Function Region**: it should be **Singapore (sin1)**. `vercel.json` already sets it.
3. From now on, every push to the main branch redeploys both projects. Pushes to other branches create preview deployments.

### 2.4 Database migrations

Migrations are **not** run during the Vercel build. After changing `prisma/schema.prisma`:
1. `cd backend && npm run db:migrate -- --name <change>` creates the migration and applies it to the database in `.env`.
2. Commit the migration and push.

While dev and prod share one database, step 1 already updates production. Once there is a separate dev branch, run `npm run db:deploy` with the production `DIRECT_URL` before pushing.

### 2.5 Sign in with Google

The OAuth flow runs on the backend, but Google sends the user back to the **frontend** domain (`/api/auth/google/callback`, proxied to the backend by the rewrite), so the session cookie stays first-party. The callback URL is built from the **first** origin in `FRONTEND_URL`.

1. Google Cloud console → **Google Auth Platform**:
   - **Branding**: app name, support email.
   - **Audience**: External. While testing, add your Google accounts under **Test users**; **Publish app** to open it to everyone. The app only asks for `openid email profile`, which normally needs no verification.
2. **Clients → Create client → Web application**. **Authorized redirect URIs**, one per environment:
   - `http://localhost:3300/api/auth/google/callback`
   - `https://<frontend-domain>/api/auth/google/callback`

   **Authorized JavaScript origins** can stay empty (no Google script runs in the page).
3. Put the client ID and secret in `backend/.env` (local) and in the backend project's Vercel environment variables (production), then redeploy the backend.
4. Check: `https://<frontend-domain>/vi/login` → **Continue with Google**. A `redirect_uri_mismatch` error from Google means the callback URL in step 2 does not exactly match `<first FRONTEND_URL>/api/auth/google/callback`.

Preview deployments get their own random domains, which are not registered redirect URIs, so Google sign-in only works on localhost and the production domain.

### Alternative: deploy from the CLI (no GitHub)

```bash
npx vercel login                 # interactive, once
cd backend  && npx vercel --prod # first run asks to create/link the project
cd ../frontend && npx vercel --prod
```

Set the same environment variables with `npx vercel env add <NAME>` or in the dashboard. Note: after running `vercel build` locally, delete `frontend/.vercel` and `frontend/.next` before the next `npm run build`, otherwise Turbopack can crash on the leftover output.

---

## 3. Background research

### 3.1 Context

| Part | Technology | Hosting requirements |
|------|------------|----------------------|
| `frontend/` | Next.js 16 | Server rendering; proxies `/api/*` to the backend |
| `backend/` | NestJS 12 (Node 24) | HTTP API. Hourly reminders are triggered over HTTP, so an always-on server is optional. |
| Database | Neon Postgres | ✔ **AWS ap-southeast-1 (Singapore)** |
| Users | Mostly in **Vietnam** | Low latency, low cost at the start |

### 3.2 Key finding: run everything in Singapore

- The backend and the database must be in the **same region**. Each API request makes several DB queries, so distance between them adds up quickly.
- From Vietnam, **Singapore** is ~30–50 ms away and **US East** ~200–250 ms (typical figures, not from an official source).
- A Neon project's region **cannot be changed** after creation; moving means creating a new project and copying the data (`pg_dump | pg_restore`).
- ✔ **Done on 2026-11-02.** The DB only held seed data, so the move was `npm run db:deploy && npm run db:seed` against the new project. Measured from the dev machine: ~50 ms median per query.

### 3.3 Backend hosting compared

| Platform | Cheapest always-on | Free tier | Singapore / US East | Cron | Monorepo subfolder |
|---|---|---|---|---|---|
| **Vercel Functions** (chosen) | – (serverless) | Hobby: 1M invocations, 4 h Active CPU/month, non-commercial | `sin1` / `iad1` | Hobby cron once a day; use an external scheduler | Root Directory |
| **Railway** | Hobby **5 USD/month**, includes 5 USD of usage | Free gives only 1 USD credit/month, not enough to run 24/7 | Yes / Virginia | In-process cron works | Root dir + watch paths |
| **Render** | Starter **7 USD/month** (0.5 CPU, 512 MB) | Yes, but **sleeps after 15 idle minutes**; waking takes **~1 minute** | Yes / Ohio, Virginia | Separate Cron Job service (1 USD/month minimum) | Root Directory |
| **Fly.io** | ~3.7 USD/month (512 MB, US); Singapore costs more | None | Yes / iad, ewr | In-process; set `min_machines_running=1` | Docker |
| **DigitalOcean App Platform** | **5 USD/month** (512 MiB) | Static sites only | Yes / NYC, ATL | Scheduled jobs, at most every 15 minutes | Docker |
| **Google Cloud Run** | Always-on is relatively expensive | Generous free tier, but scales to zero | Yes (pricier tier) / us-east5 Ohio | Cloud Scheduler: 3 free jobs | Docker; needs a billing account |
| **Koyeb** | Since 2026, new accounts must take Pro (**29 USD/month**) | Free only in Frankfurt / Washington | Yes / Washington | – | Docker |
| **VPS** (Hetzner, DO Droplet) + Coolify/Dokploy | DO 6 USD (1 GB). Coolify/Dokploy need **≥ 2 GB RAM**: Hetzner Singapore 2 GB **15.99 EUR**, DO 2 GB **12 USD** | – | Yes / yes | crontab or in-process | Self-managed |

### 3.4 Frontend hosting compared

| Platform | Free tier | Notes |
|---|---|---|
| **Vercel Hobby** (chosen) | 1M function invocations, 4 h Active CPU, 100 GB bandwidth per month | **Non-commercial only**; Pro is 20 USD/month. Functions default to `iad1`; this project sets `sin1`. Cannot import repos owned by a GitHub organization. Best Next.js support. |
| **Cloudflare Workers** (via OpenNext) | 100k requests/day, **10 ms CPU per request** | Edge runtime close to users; Paid is 5 USD/month. OpenNext supports Next 15/16 with limitations (no Node Middleware; image optimisation needs Cloudflare Images). |
| **Netlify Free** | 300 credits/month | Each production deploy costs 15 credits and each GB 20. **When credits run out, every site is paused** until next month. Not recommended. |

### 3.5 Scheduling (hourly reminders)

- **Vercel Hobby cron runs only once a day** (±59 minutes), so it cannot drive hourly reminders.
- External schedulers that call `GET/POST /api/cron/reminders` with `Authorization: Bearer <CRON_SECRET>`:
  - **Upstash QStash** (recommended): free tier with 1,000 messages/day and 10 schedules. Hourly = 24 messages/day.
  - **Cloudflare Cron Triggers**: 5 free per account, but they require deploying a small Worker.
- **Do not use GitHub Actions schedules**: GitHub states that runs can be delayed under high load and some queued jobs may be dropped.
- Schedule at :05 rather than :00. Make the job idempotent (`reminder_logs` has a unique key on user + channel + day), so a late or duplicate run never sends twice.

### 3.6 Email & database

- **Resend Free**: 100 emails/day, 3,000/month. **A verified custom domain is required**: the `resend.dev` sender only delivers to the account owner. **Web Push (free) is the main channel**; email is opt-in.
- **Neon Free**: 1 GB storage, 100 CU-hours per project per month, automatic **scale-to-zero after 5 idle minutes** (waking takes a few hundred ms).
  - If health checks queried the DB, it would never sleep: ~182 CU-hours/month at the smallest size, **over** the Free limit.
  - Handled: `/api/health` never touches the DB; DB checks use `/api/health/db`.

### 3.7 Paid options for later

- **Small budget (~5 USD/month):** Railway Hobby (Singapore) for an always-on backend with in-process cron; keep Vercel for the frontend.
- **Growing:**
  - Frontend: Vercel Pro (20 USD, required once there is revenue) or Cloudflare Workers Paid (5 USD).
  - Database: Neon Launch (usage-based, no minimum).
  - Email: Resend Pro after 100 emails/day.
- **Many services:** one 2 GB VPS in Singapore + Coolify/Dokploy (12–16 USD/month).

### 3.8 Auth cookies and domains

With the frontend and backend on different domains (e.g. two `*.vercel.app` projects), a cookie set by the backend is a **third-party cookie**, which Safari and Chrome block. This project avoids that with a **Next.js rewrite** (`frontend/next.config.ts`): the browser only calls `https://<frontend-domain>/api/*`, and Next.js forwards those requests to the backend. A custom domain (~10 USD/year) is still worth buying later: Resend requires one, and it gives nicer URLs.

### 3.9 Not verified

- Fly.io 512 MB pricing in Singapore; Cloud Run always-on cost and cold-start times.
- Cloud Scheduler pricing (the official page was truncated; figures come from search snippets).
- Whether Koyeb Eco instances can be used without Pro.
- Whether idle pooled connections keep Neon from sleeping (not documented).
- Cloudflare's commercial-use terms on the Free plan; Railway egress pricing.
- Actual cold-start time of the NestJS function on Vercel (to be measured after the first deployment).

## 4. Sources

- Vercel: [NestJS on Vercel](https://vercel.com/docs/frameworks/backend/nestjs) · [Ship a NestJS app](https://vercel.com/kb/guide/ship-a-nestjs-app-on-vercel) · [zero-config NestJS changelog](https://vercel.com/changelog/zero-configuration-support-for-nestjs) · [function limits](https://vercel.com/docs/functions/limitations) · [fair use](https://vercel.com/docs/limits/fair-use-guidelines) · [cron pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) · [function region](https://vercel.com/docs/functions/configuring-functions/region) · [limits](https://vercel.com/docs/limits) · [pricing](https://vercel.com/pricing)
- Netlify: [credit-based plans](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/) · [functions config](https://docs.netlify.com/build/functions/optional-configuration/)
- Cloudflare: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) · [pricing](https://developers.cloudflare.com/workers/platform/pricing/) · [cron triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) · [OpenNext](https://opennext.js.org/cloudflare)
- Render: [pricing](https://render.com/pricing) · [free](https://render.com/docs/free) · [regions](https://render.com/docs/regions) · [cron jobs](https://render.com/docs/cronjobs) · [monorepo](https://render.com/docs/monorepo-support)
- Railway: [pricing](https://railway.com/pricing) · [regions](https://docs.railway.com/reference/regions) · [cron](https://docs.railway.com/reference/cron-jobs) · [monorepo](https://docs.railway.com/guides/monorepo)
- Fly.io: [pricing](https://docs.fly.io/about/pricing) · [regions](https://docs.fly.io/reference/regions) · [autostop](https://docs.fly.io/launch/autostop-autostart)
- Koyeb: [instances](https://www.koyeb.com/docs/reference/instances) · [pricing FAQ](https://www.koyeb.com/docs/faqs/pricing)
- Google Cloud: [free tier](https://docs.cloud.google.com/free/docs/free-cloud-features) · [Cloud Run locations](https://docs.cloud.google.com/run/docs/locations) · [Scheduler pricing](https://cloud.google.com/scheduler/pricing)
- DigitalOcean: [App Platform pricing](https://www.digitalocean.com/pricing/app-platform) · [jobs](https://docs.digitalocean.com/products/app-platform/how-to/manage-jobs/) · [droplets](https://www.digitalocean.com/pricing/droplets)
- Hetzner: [cloud pricing](https://www.hetzner.com/cloud/regular-performance) · Coolify: [install](https://coolify.io/docs/get-started/installation) · Dokploy: [install](https://docs.dokploy.com/docs/core/installation)
- Neon: [pricing](https://neon.com/pricing) · [regions](https://neon.com/docs/introduction/regions) · [scale to zero](https://neon.com/docs/introduction/scale-to-zero) · [migrate between projects](https://neon.com/docs/import/migrate-from-neon)
- Upstash: [QStash pricing](https://upstash.com/pricing/qstash) · GitHub: [schedule event](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- Resend: [pricing](https://resend.com/pricing) · [resend.dev domain](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)
