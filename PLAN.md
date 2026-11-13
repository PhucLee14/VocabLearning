# Plan: English Vocabulary Learning Web App

> App name: **Godee** (repo and folders: `Vocab`). Production frontend: https://godee.vercel.app

> Status: v4 (2026-11-02). Decisions in section 2 are final. Phase 0 is mostly done (see section 9). The database runs in Singapore, and the app is ready to deploy for free on Vercel.
> Work log: [.claude/worklog/](.claude/worklog/). Deployment guide: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## 1. Goals

A web app that helps learners:

1. Learn new words by **topic** and **CEFR level** (A1 → C2), with meanings explained **in English**.
2. Review with **flashcards** using **spaced repetition**: the system schedules each word's next review and sends a **reminder** when it is due.
3. See their **mastery** of every word, **progress** by topic/level, their **streak** and their **study time**.
4. Keep **notes** per word or in a general notebook.
5. Load vocabulary by **importing** files (CSV/JSON). The topic framework ships with the app; the words are added later.

---

## 2. Decisions (final, 2026-11-02)

| # | Question | Decision |
|---|----------|----------|
| 1 | Users | Multi-user, **with account registration**. |
| 2 | UI language | **Bilingual Vietnamese / English**, switchable at any time. URLs carry a locale prefix: `/vi/...`, `/en/...`. |
| 3 | Word meanings | **Show the Vietnamese meaning**. Explanations (definitions, examples) are **in English**. |
| 4 | Reminders | Web only. Reminders by **email** and **browser/phone notifications (Web Push)**, plus an in-app badge. |
| 5 | Tech stack | **Next.js** frontend, **NestJS** backend, **PostgreSQL on Neon**. Split into `frontend/` and `backend/` (section 4). |
| 6 | Deployment | **Free**: Vercel Hobby for both the frontend and the NestJS backend (`sin1`), plus Neon Free (Singapore). See section 12 and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). |

---

## 3. Features

### 3.1 Vocabulary bank

Each entry has:

| Field | Required | Notes |
|-------|:-------:|-------|
| `headword` | ✔ | Word or phrase |
| `pos` | ✔ | Part of speech: noun, verb, adj, adv, phrase, phrasal verb, idiom… |
| `sense_no` | | Sense number. A word with several meanings has **one entry per sense** (e.g. *bank* n.1 "a financial institution", *bank* n.2 "the side of a river"). |
| `ipa` | | Pronunciation |
| `cefr_level` | ✔ | A1, A2, B1, B2, C1, C2 |
| `definition_en` | ✔ | Plain-English definition |
| `meaning_vi` | | Vietnamese meaning, shown next to the English definition. Can be turned off in settings. |
| `examples` | | 1–3 example sentences, with the word highlighted |
| `topics` | | A word can belong to several topics |
| `synonyms`, `antonyms`, `collocations` | | |
| `audio_url`, `image_url` | | Without audio, the MVP uses the browser's speech synthesis (Web Speech API) |

### 3.2 Topics and levels

- **Topics** have two levels: topic → subtopic (e.g. *Food & Drink* → *Cooking*, *Restaurant*). The initial framework is in section 8.
- **Levels** are fixed: A1, A2, B1, B2, C1, C2.
- Filters can be combined, e.g. "Travel + B1".
- Every topic and level shows: total words, words learned, words mastered (progress bar).

### 3.3 Learning new words

1. Pick a source: by topic, by level, or **automatic** (the learner's current level).
2. Each session has **N new words** (default 10, configurable).
3. Each word starts with an **intro card**: word, IPA, play button, English definition, examples, Vietnamese meaning.
   - **"I already know this"**: marks the word as known and keeps it out of the review queue (can be undone).
   - **"Learn this word"**: adds it to the SRS queue.
4. The session ends with a mini-quiz (match the word to its definition).
5. Summary screen: words learned, time spent, streak.

### 3.4 Flashcards and review

- **Front**: word + IPA + play button. Reverse mode: the English definition on the front, guess the word.
- **Back**: English definition, part of speech, examples, Vietnamese meaning, the learner's note, level, topics.
- **Rating** after flipping: `Again` · `Hard` · `Good` · `Easy` (shown in Vietnamese as Quên / Khó / Nhớ / Dễ). Each button shows the next interval, e.g. "3 days".
- **Shortcuts**: `Space` flips, `1–4` rates, `N` opens the note. Swipe on mobile.
- **Two modes**:
  - *Review*: only due words; ratings **update** the schedule.
  - *Practice*: any topic/level; ratings **do not touch** the schedule.

### 3.5 Spaced repetition (SRS) and review reminders

- **Algorithm: FSRS**, via the [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs) library (the algorithm Anki uses). Nothing to implement ourselves, and more accurate than SM-2.
- Intervals **grow** as the learner remembers. Illustrative example: learned today → 10 minutes → **3 days** → 8 days → 3 weeks → 2 months…
- **Again** sends the word back to same-day learning and shortens its interval.
- `desired_retention` (default 0.9, i.e. a 90% recall target) is configurable.
- **Leeches**: a word forgotten 4+ times is flagged as "difficult", and the app suggests writing a note or mnemonic.
- *(Optional, later)* A **fixed schedule** mode (Leitner style: 1, 3, 7, 14, 30, 90 days) for learners who want a predictable schedule.

### 3.6 Mastery levels

Derived from each word's SRS state:

| Level | Name | Rule (suggested) | Colour |
|:--:|------|------------------|--------|
| 0 | New | Not studied yet | grey |
| 1 | Learning | In learning or relearning steps today | red |
| 2 | Recognised | Interval ≤ 3 days | orange |
| 3 | Familiar | 4–10 days | yellow |
| 4 | Proficient | 11–30 days | green |
| 5 | Long-term memory | > 30 days | blue |

The word detail page also shows:
- **Current recall probability** (e.g. "87%"), from FSRS retrievability.
- Next review date, number of reviews, number of lapses.
- Review history as a timeline.

### 3.7 Notes

- **Word notes**: mnemonics, the learner's own sentences, grammar tips. Shown on the back of the flashcard.
- **Notebook**: notes not tied to a word, with tags and search.
- Simple Markdown content.

### 3.8 Streaks

- A day counts towards the streak when the **minimum goal** is met. Default: ≥ 10 cards reviewed/learned **or** ≥ 5 minutes of study. Learners can change the goal.
- Days are computed in the **learner's timezone** (default `Asia/Ho_Chi_Minh`).
- Store `current_streak`, `longest_streak` and the last active date.
- *(Later)* **Streak freeze**: keeps the streak when one day is missed; earned through achievements.

### 3.9 Study time tracking

- Only **active time** counts: the tab is visible and there was an interaction (flip, button press) in the last 60 seconds. Idle time is not counted.
- The client sends a heartbeat every ~30 seconds and flushes the remainder when the tab closes (`navigator.sendBeacon`).
- Shows: in-session timer, today's total, this week's total, and a progress ring against the **daily minutes goal** (default 15 minutes).
- *(Later)* Pomodoro mode.

### 3.10 Reminders

| Channel | Content | Phase |
|---------|---------|-------|
| In-app | Badge with the due count in the menu, banner on the Dashboard | MVP |
| Web Push (PWA) | "You have 23 words to review today", as a phone/desktop notification | Phase 2 |
| Email | Same content as Web Push, sent at the learner's chosen time | Phase 2 |

How it works:
- An **hourly cron job** finds learners who match all of these: their reminder hour (in their timezone) is now, they have due words, they have not studied today, and they have not been reminded today. It then sends the reminder.
- At most **one reminder per day**, plus an optional evening "your streak is at risk" reminder. Reminders can be turned off.
- Notes:
  - The backend runs as a serverless Vercel Function, so there is no in-process cron. The hourly job is the endpoint `/api/cron/reminders` (protected by `CRON_SECRET`), called every hour by **Upstash QStash** (free tier). Vercel Hobby's own cron runs only once a day.
  - Do not use GitHub Actions schedules: runs can be delayed or dropped when GitHub is under load.
  - The job must be **idempotent**: `reminder_logs` has a unique key on (user, channel, day), so a late or duplicate run never sends twice.
  - Resend's Free plan allows **100 emails/day** and requires a **verified custom domain**. Web Push (free) is therefore the main channel, and email is opt-in.
  - On iPhone, Web Push only works after the user taps "Add to Home Screen" (iOS 16.4+).

### 3.11 Progress page

- One-year study heatmap (GitHub style).
- Words learned and mastered over time.
- Distribution across the 6 mastery levels.
- Progress by level (A1 → C2) and by topic.
- **Forecast** of due reviews for the next 7 days.
- Recall rate (% Good/Easy) per week.

### 3.12 Vocabulary import and admin

- Import **CSV or JSON** files from the admin page, or with a CLI script for bulk loads.
- Flow: upload → **preview** (valid/invalid row counts, which rows failed) → confirm.
- A duplicate `(headword, pos, sense_no)` key **updates** the existing entry instead of creating a duplicate, and **keeps learners' progress**.
- Admin pages to create/edit/delete words and topics.
- *(Phase 2)* **Auto-enrichment**: for words missing IPA, audio or a definition, suggest values from the Free Dictionary API. An admin approves them before they are saved.
- File formats: see section 7.

---

## 4. Tech stack

| Area | Choice | Notes |
|------|--------|-------|
| Frontend | **Next.js 16 (App Router) + TypeScript** | `frontend/`. Cache Components and Partial Prerendering enabled (Next 16.4 defaults). |
| UI | **Tailwind CSS 4** (add shadcn/ui when components are needed) | Dark mode follows the OS setting |
| i18n | **next-intl 4** | Routes `/vi/...`, `/en/...`. Messages in `frontend/messages/`. |
| Backend | **NestJS 12 + TypeScript (ESM)** | `backend/`, REST API under `/api` |
| ORM | **Prisma 7** + `pg` driver adapter | Schema in `backend/prisma/schema.prisma` |
| Database | **PostgreSQL 18 on Neon**, region **Singapore** (`aws-ap-southeast-1`) | The app uses the pooled URL; migrate/seed use the direct URL |
| Auth | Built in NestJS: email + password (argon2id via `@node-rs/argon2`) and a **database-backed session**: a random token in the httpOnly `vocab_session` cookie (SameSite=Lax, 30 days, sliding), only its SHA-256 hash stored in `sessions`. Google sign-in: server-side OAuth code flow with PKCE (`backend/src/auth/google.ts`). | Changed from JWT + refresh token on 2026-11-03: Server Components cannot set cookies, so an expired access token could not be refreshed while rendering; a session lookup is one indexed query and can be revoked at once. Email verification and password reset via Resend later. |
| Browser → API | ✔ Next.js rewrite `/api/*` → backend (`frontend/next.config.ts`) | Frontend and API share one domain, so the auth cookie is first-party. Safari/Chrome block third-party cookies. |
| Hosting | **Vercel Hobby** for both apps, region `sin1` (`vercel.json`), Node 24 | Free. Non-commercial use only. See section 12. |
| SRS | **ts-fsrs** (runs in the backend) | |
| Scheduling | **Upstash QStash** calls `/api/cron/reminders` hourly | The backend is serverless, so no in-process cron. See 3.10. |
| Email | **Resend** | |
| Push | Web Push (VAPID, `web-push` library) + Service Worker | |
| Pronunciation | Web Speech API (MVP) → audio files later | Free, available today |
| Charts | **Recharts** | |

---

## 5. Data model (summary)

> The authoritative schema, migrated to Neon, is [backend/prisma/schema.prisma](backend/prisma/schema.prisma). This is a summary.

```text
User              id, email, passwordHash, name, gender?, birthDate?, bio?, targetLevel?,
                  role (USER|ADMIN), locale (vi|en), timezone, emailVerifiedAt, googleId
Session           id, userId, tokenHash, userAgent, expiresAt, lastUsedAt, revokedAt
AuthToken         id, userId, type (EMAIL_VERIFY|PASSWORD_RESET), tokenHash, expiresAt, usedAt
UserSettings      userId, dailyNewWords=10, dailyGoalMinutes=15, dailyGoalCards=10,
                  desiredRetention=0.9, showVietnamese=true,
                  reminderEnabled, reminderTime="20:00", reminderChannels[email|push]

Topic             id, slug, nameEn, nameVi, description, icon, parentId?, sortOrder
Word              id, slug, headword, pos, senseNo, ipa, cefrLevel(A1..C2),
                  definitionEn, meaningVi?, synonyms[], antonyms[], collocations[],
                  audioUrl?, imageUrl?, frequencyRank?, source, updatedAt
                  UNIQUE(headword, pos, senseNo)
Example           id, wordId, sentence, translationVi?, sortOrder
WordTopic         wordId, topicId                                  -- many-to-many

UserCard          userId, wordId, state(new|learning|review|relearning),
                  due, stability, difficulty, reps, lapses, lastReviewAt,
                  masteryLevel(0..5), isKnown, isStarred, isSuspended, isLeech
                  PK(userId, wordId)
ReviewLog         id, userId, wordId, rating(1..4), mode(learn|review|practice),
                  reviewedAt, durationMs, prevIntervalDays, nextIntervalDays

Note              id, userId, wordId?, title?, content(markdown), tags[], updatedAt

StudySession      id, userId, mode, startedAt, endedAt, activeSeconds,
                  newCount, reviewCount, correctCount
DailyStat         userId, date(user's timezone), activeSeconds, newWords,
                  reviews, correct, goalMet                        PK(userId, date)
UserStreak        userId, current, longest, lastActiveDate, freezesLeft

PushSubscription  id, userId, endpoint, p256dh, auth
ReminderLog       id, userId, channel, sentAt, dueCount, localDate
ImportJob         id, fileName, status, totalRows, inserted, updated, failed,
                  errors(json), createdBy, createdAt
```

- A `UserCard` is created only when the learner starts a word, so a large word bank does not bloat the table.
- Streaks and the heatmap read from `DailyStat` instead of scanning `ReviewLog`.

---

## 6. Sitemap

Every page has a locale prefix, e.g. `/vi/dashboard`, `/en/dashboard`. The table omits it for brevity.

Built on 2026-11-03 (✔) and still planned. Signed-in pages are guarded by `frontend/src/proxy.ts` (cookie present → else `/login?next=`); topics and word pages are public.

| Route | Page | Main content |
|-------|------|--------------|
| ✔ `/` | Landing | What it is, a live flashcard with real words, how it works, CEFR levels, topics. Signed-in visitors go to `/dashboard`. |
| ✔ `/login`, `/register` | Sign in / Sign up | Email + password, `?next=` (same-site paths only). Google and email verification later. |
| ✔ `/dashboard` | **Home** | Greeting with today's one fact, *Review N words* / *Learn new words*, today's goal ring, streak with the last 7 days, due count, learned count, 7-day forecast, mastery, recent words, topic progress, levels |
| ✔ `/learn` | Learn new words | Pick topic / level / count → intro cards → quiz → summary (3.3) |
| ✔ `/flashcards` | Flashcards | Review (due words, schedule updates) and Practice (`?mode=practice`, any topic/level, schedule untouched) (3.4) |
| ✔ `/words?status=new\|learned\|due\|all` | Word lists | "Not learned" and "Learned" in the nav; search, level, topic, sort, paging; quick *Learn* / *Known* |
| ✔ `/words/[slug]` | Word detail | Definition, IPA, audio, examples, Vietnamese meaning, related words, other senses, topics, source; my progress (mastery, recall probability, next review, reviews, lapses), note, review history |
| ✔ `/topics`, `/topics/[slug]` | Topics | Topic grid with progress; topic page with subtopic chips, word list, *Learn this topic* / *Practise* |
| ✔ `/progress` | Progress | Section 3.11 |
| ✔ `/profile` | Profile | Name, gender, date of birth, target level, bio, timezone; study record |
| ✔ `/settings` | Settings | Daily goal, new words/session, retention, show Vietnamese, reminders (saved, not sent yet), theme, language, password, sign out, delete account |
| `/notes` | Notebook | All notes, search, tags |
| `/admin/words`, `/admin/topics`, `/admin/import` | Admin | Manage words, topics, file import |

**A typical study day**

Open the app (or tap the email/push reminder) → Dashboard "23 words due · 10 new · 🔥 6 days" → review all due words → learn 10 new words → write notes for 1–2 hard words → summary screen (time, streak +1).

---

## 7. Import file format

### CSV (recommended when working in Excel / Google Sheets)

Multi-value fields (`examples`, `topics`, `synonyms`, `antonyms`) are separated by `|`.

```csv
headword,pos,sense_no,ipa,cefr_level,definition_en,meaning_vi,examples,topics,synonyms,antonyms,audio_url
apple,noun,1,/ˈæp.əl/,A1,"a round fruit with red, green or yellow skin",quả táo,"I eat an apple every day.",food-drink,,,
abandon,verb,1,/əˈbæn.dən/,B2,"to leave someone or something and not come back","bỏ rơi, từ bỏ","They abandoned the car in the snow.|She abandoned her plan to study abroad.",society|feelings,desert|leave,keep,
bank,noun,1,/bæŋk/,A2,"a business that keeps and lends money",ngân hàng,"I need to go to the bank.",money-shopping,,,
bank,noun,2,/bæŋk/,B1,"the land along the side of a river",bờ sông,"We had a picnic on the river bank.",nature-environment,,,
```

### JSON (for richer structure, e.g. a translation per example sentence)

```json
[
  {
    "headword": "abandon",
    "pos": "verb",
    "sense_no": 1,
    "ipa": "/əˈbæn.dən/",
    "cefr_level": "B2",
    "definition_en": "to leave someone or something and not come back",
    "meaning_vi": "bỏ rơi, từ bỏ",
    "examples": [
      { "sentence": "They abandoned the car in the snow.", "translation_vi": "Họ bỏ lại chiếc xe trong tuyết." }
    ],
    "topics": ["society", "feelings"],
    "synonyms": ["desert", "leave"],
    "antonyms": ["keep"]
  }
]
```

### Validation rules

- Required: `headword`, `pos`, `cefr_level`, `definition_en`. A missing `sense_no` defaults to 1.
- `cefr_level` must be one of `A1 A2 B1 B2 C1 C2`.
- `topics` use the **slug** of an existing topic. An option allows "create missing topics".
- A duplicate `(headword, pos, sense_no)` updates the existing entry.
- UTF-8 files, up to ~5,000 rows per upload through the UI. Use the CLI script for more.

### Vocabulary sources

See [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md): sources, licences, attribution rules, and the `words:enrich` → review → `words:import` workflow.

--------|----------|-------|
| Oxford 3000 / 5000 | Word lists with CEFR levels | Copyrighted; read the terms carefully |
| CEFR-J Wordlist | Word lists with CEFR levels | Check the terms of use |
| English Vocabulary Profile (Cambridge) | CEFR level per word sense | Lookup only; no bulk copying |
| WordNet (Princeton) | English definitions, synonyms | Permissive licence |
| Free Dictionary API / Wiktionary | IPA, audio, definitions | CC BY-SA; attribution required |
| Tatoeba | Example sentences with translations | CC BY; attribution required |

---

## 8. Initial topic framework (seed)

A starting point; editable from the admin pages or via import. Seed data: [backend/prisma/seed/topics.json](backend/prisma/seed/topics.json).

| slug | English | Vietnamese | Suggested subtopics |
|------|---------|-----------|---------------------|
| `people-family` | People & Family | Con người & Gia đình | family members, relationships, life stages |
| `appearance-personality` | Appearance & Personality | Ngoại hình & Tính cách | appearance, character traits |
| `feelings` | Feelings & Emotions | Cảm xúc | positive, negative, attitudes |
| `health-body` | Health & Body | Sức khỏe & Cơ thể | body parts, illness, fitness |
| `food-drink` | Food & Drink | Đồ ăn & Đồ uống | cooking, restaurant, taste |
| `home` | Home & Housing | Nhà cửa | rooms, furniture, housework |
| `daily-life` | Daily Life & Routines | Sinh hoạt hằng ngày | routines, chores |
| `money-shopping` | Shopping & Money | Mua sắm & Tiền bạc | shops, prices, banking |
| `clothes-fashion` | Clothes & Fashion | Quần áo & Thời trang | |
| `travel-transport` | Travel & Transport | Du lịch & Giao thông | airport, hotel, directions |
| `places-city` | Places & City | Địa điểm & Thành phố | buildings, countryside |
| `work-jobs` | Work & Jobs | Công việc & Nghề nghiệp | occupations, office, job hunting |
| `education` | Education | Giáo dục | school, university, exams |
| `technology` | Technology | Công nghệ | computers, internet, devices |
| `nature-environment` | Nature & Environment | Thiên nhiên & Môi trường | animals, plants, pollution |
| `weather` | Weather & Climate | Thời tiết & Khí hậu | |
| `sports-hobbies` | Sports & Hobbies | Thể thao & Sở thích | |
| `arts-entertainment` | Arts & Entertainment | Nghệ thuật & Giải trí | music, film, books |
| `media-communication` | Media & Communication | Truyền thông & Giao tiếp | news, social media |
| `society` | Society & Politics | Xã hội & Chính trị | law, crime, government |
| `business-economy` | Business & Economy | Kinh doanh & Kinh tế | marketing, finance |
| `science` | Science | Khoa học | |
| `time-numbers` | Time & Numbers | Thời gian & Số đếm | days, dates, quantities |
| `academic` | Academic English | Từ vựng học thuật | IELTS/TOEFL, academic word list |

---

## 9. Roadmap

### Phase 0: Foundation
- [x] Split `frontend/` (Next.js 16 + Tailwind 4) and `backend/` (NestJS 12)
- [x] PostgreSQL (Neon) + Prisma 7, full schema, `init` migration
- [x] Seed the topic framework: 24 top-level topics, 71 including subtopics
- [x] First endpoints: `GET /api/health`, `GET /api/health/db`, `GET /api/topics`
- [x] Bilingual vi/en UI (next-intl), layout, Light / Dark / System theme switch. "Reference manual" design (Be Vietnam Pro + JetBrains Mono, one teal accent). The home page lists topics from the API.
- [x] Move Neon to Singapore (`aws-ap-southeast-1`)
- [x] Next.js rewrite `/api/*` → backend, so the auth cookie is first-party
- [x] Deployment config: `vercel.json` (`sin1`) for both apps, Node 24.x. Verified with a local `vercel build`.
- [ ] Deploy to Vercel. Needs a GitHub repo + Vercel account; steps in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) §2.
- [x] Sign up / sign in / sign out (DB session cookie, see section 4), change password, delete account
- [x] Sign in with Google (server-side OAuth code flow + PKCE, `jose` ID-token check; links to an existing account by verified email). Setup: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) §2.5
- [x] Email verification and password reset (2026-11-11): one-time links in the URL fragment, sent through the Gmail SMTP mailer; verification is soft (nothing is blocked yet)

### Phase 1: MVP (learn and review)
- [x] ~50 sample words for testing: 53 words imported on 2026-11-02 (`backend/prisma/seed/words-sample*.{csv,json}`; hand-assigned CEFR levels, verify against CEFR-J later)
- [x] CSV/JSON import CLI (`npm run words:import`, with `--dry-run`) + enrichment from free sources (`npm run words:enrich`), see [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md)
- [x] **Word bank: 9,704 words, A1–C2** (CEFR-J + Octanove levels, enriched from open sources, every word reviewed by AI agents; imported 2026-11-03/04). See [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) §3 and §5
- [ ] `/admin/import` UI with a preview step
- [x] Topic and word detail pages (recorded audio, Web Speech API fallback). Levels are filters on the word list, topics and learn/practice pages rather than their own route.
- [x] **Learn new words** session (3.3): intro cards, "I already know this", end-of-session quiz
- [x] **Flashcards + SRS** with ts-fsrs 5.4, Review & Practice modes, reverse mode, keyboard shortcuts (Space, 1–4)
- [x] **Mastery** computation, shown on words, topics and levels
- [x] **Word notes** (word page; shown on the back of the flashcard)
- [x] Dashboard: due count, new words, today's goal, streak, 7-day forecast; due badge on "Flashcards" in the nav
- [x] Learned / not-learned word lists, profile page (name, gender, date of birth, target level, bio, timezone), settings page

### Phase 1.5: Fixes from the code review (2026-11-04)

No critical or high issues were found. Fix these before adding more features. Details are in `.claude/worklog/2026-11-04.md` (Session 4). Done on 2026-11-05 (except rate limiting): see `.claude/worklog/2026-11-05.md`.

Security:
- [x] Rate limiting on login/register/password checks and on every endpoint that sends email (2026-11-11): fixed windows in a Postgres table (`rate_limits`). Per-IP limits are generous until the IP seen behind the frontend rewrite is checked in production (`/api/health/db` reports it).
- [x] **Email confirmation codes** for sensitive actions (decision 2026-11-05, replaces "re-authenticate with Google"): setting a first password on a Google-only account, deleting an account (and later changing the email). A 6-digit code is sent to the account's email: valid 10 min, single use, bound to the user and the action, at most 5 attempts, at most 1 send per minute, only its hash stored (`AuthToken`, new type `ACTION_CONFIRM`). The same mailer then powers email verification and password reset (Phase 0).
  - Mail transport: **Gmail SMTP with an App Password** for now (Nodemailer; env `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`), behind a small `Mailer` interface so it can switch to Resend + a custom domain later by changing env.
- [x] **CSRF on form posts**: reject state-changing requests that are not `application/json` or whose `Origin` is not `FRONTEND_URL`. Today a cross-site form can sign the victim in to an attacker's account.
- [x] `null` in `PATCH /me` and `/me/settings` → 500: use `@ValidateIf(v !== undefined)` on non-nullable fields. Map Prisma P2002 → 409 (also for the register race).
- [x] Protect `/api/health/db` with `CRON_SECRET` (anyone can keep Neon awake). Add security headers (backend and `next.config.ts`) and `Cache-Control: private, no-store` on personal responses.
- [x] Sessions: an absolute maximum age (e.g. 90 days), deleting old sessions, and failing fast in production when `FRONTEND_URL` is missing.

Correctness:
- [x] **Sliding sessions don't slide**: the extension happens on Server Component fetches, whose `Set-Cookie` is dropped, so users are signed out 30 days after login. Extend only on browser requests.
- [x] **Double-submitted ratings** count twice (stats, new words): optimistic concurrency on `user_cards` (`reps` check) or an idempotency key.
- [x] **Streak after a time-zone change** can reset: treat `lastActiveDate >= yesterday` as alive and never move it backwards.
- [x] `page` has no upper bound (`page=1e300` → 500); paging needs a unique tiebreaker (`id`); practice and quiz-distractor picks are not random (use `ORDER BY random()`); notes need `@@unique([userId, wordId])` + upsert; `POST /study/cards` race → use upsert.
- [x] `/study/progress` loads 8 weeks of review logs into memory: aggregate the weekly recall in SQL.

### Phase 2: Habits and progress
- [ ] **Study time tracking**: `DailyStat` is filled from each card's time (capped at 60 s); the heartbeat / `StudySession` part is not built yet
- [x] **Streaks** + daily goal in settings
- [x] **Progress** page: heatmap, charts, 7-day forecast
- [ ] PWA (manifest + service worker) + **Web Push**
- [ ] `/api/cron/reminders` endpoint + hourly Upstash QStash schedule
- [ ] **Email reminders** (Resend; needs a custom domain)
- [ ] Notebook (tags, search)
- [x] Auto-enrich IPA/audio/definitions/Vietnamese/examples from free sources (offline, at import time: `words:enrich`)

### Phase 3a: Admin site and feedback (requested 2026-11-04)

- [ ] **Admin role checks**: `role = ADMIN` on `users`, a `RolesGuard` on every `/api/admin/*` route, and an audit log (who changed what).
- [ ] **Admin site** at `/[locale]/admin` (in its own layout, hidden from learners):
  - users: list and search, details (stats, sessions), disable or enable, reset sessions, change role;
  - words: list, search and filters, edit (definition, Vietnamese, examples, topics, level), merge duplicates, delete;
  - topics: create, edit, reorder, parent/child, word counts;
  - import: upload CSV/JSON → preview (the same validation as `words:import`) → confirm (replaces the CLI for small batches);
  - a dashboard: users, active learners per day, reviews per day, open feedback.
- [ ] **Feedback**:
  - learners send feedback from anywhere (a button in the shell) and report a word from its page or the flashcard back ("wrong meaning", "bad example", "other");
  - the `Feedback` model holds type, word, message, status (open / in progress / done / won't fix), an admin reply and timestamps;
  - an admin inbox with filters, a reply that the learner sees in the app, and an optional email;
  - word reports link to the word's edit page.

### Phase 3b: Social learning (requested 2026-11-04)

- [ ] **Study groups**:
  - create a group and join it by invite link or code, with roles (owner / member);
  - a group page with members' streaks and words learned this week, and a shared goal ("500 reviews this week");
  - group word lists (a deck the group studies together; reuses Learn and Flashcards).
- [ ] **Group notifications** (requested 2026-11-04). Notify members when:
  - someone **adds you to a study group** ("<name> added you to <group>"), with a link to the group;
  - someone **edits a group** you belong to (name, description, goal, deck, members changed), saying who changed what;
  - someone **deletes a group** you belong to ("<name> deleted <group>"); the notification survives the deletion, so it stores the group's name.

  How: a `Notification` model (`userId`, `type`, `actorId`, `groupId?`, `data` JSON, `readAt`, `createdAt`), written in the same transaction as the group change. An in-app bell with an unread count in the shell, and a notifications page (mark read / mark all read). Delivered live through the Socket.IO service (a `user:<id>` room) when the user is online, and optionally by Web Push / email (Phase 2 reminder channels). No notification for your own actions. Notification settings live in Settings.

- [ ] **Chat** (group chat first, then 1-to-1 between group members). **Decision (2026-11-04): Socket.IO.**
  - Vercel Functions can't keep WebSocket connections open, so Socket.IO runs as a **separate long-running Node service** (e.g. `realtime/` in this repo, hosted on Render / Railway / Fly.io free tier, Singapore region).
  - It authenticates with the same `vocab_session` cookie: a short-lived signed token from `GET /api/realtime/token`, because the realtime host is on another domain.
  - Messages are stored in Postgres by the main API; the Socket.IO service only pushes them to rooms (one room per group / conversation). Use the Postgres or Redis adapter later if it needs more than one instance.
  - Moderation from day one: report a message, delete your own message, admin removal, a rate limit, a length limit, block a user.
  - A word in a message can link to its word page ("share a word").
- [ ] **Engagement ideas** (suggested; pick a few):
  - weekly leagues / leaderboard by XP (XP = new words + reviews), friends-only or group-only to keep it friendly;
  - friends / follow, so you see friends' streaks and send a "nudge" when their streak is at risk;
  - challenges: a 10-word quiz duel with a friend, or a group challenge week;
  - daily quests ("review 20 cards", "learn 5 travel words") with small rewards (streak freeze);
  - achievements and badges (first 100 words, a 30-day streak, finishing a topic);
  - word of the day on the dashboard and in the reminder;
  - a shareable progress card (an image of the streak and words learned) for social media;
  - ~~learner-made decks~~ → accepted, see below.

- [ ] **Learner-made decks** (accepted 2026-11-04):
  - a learner creates a deck (name, description, public or private) from words in the bank, plus custom cards (own word, definition, Vietnamese, example);
  - study a deck with Learn and Flashcards (the same SRS cards; custom cards get their own `UserCard`-like rows);
  - share a public deck by link, copy someone else's deck, and add a deck to a study group;
  - report a deck (goes to the admin feedback inbox).

### Phase 3c: Speaking – pronunciation scoring and YouTube shadowing (requested 2026-11-12)

Sources suggested by the user (to evaluate, nothing decided yet):
- Pronunciation scoring: **OpenPronounce** (https://github.com/Halleck45/OpenPronounce, MIT).
  - Phoneme-level assessment, a self-hosted alternative to Azure Pronunciation Assessment. Given a recording and the expected sentence, it returns a 0–100 score, the mispronounced words with the IPA actually heard, a transcript, and pitch and energy curves.
  - How it scores: Wav2Vec2 phone recognition plus espeak-ng phonemes for the target sentence, aligned by edit distance; DTW against a TTS reference; word error rate.
  - Runs in Python 3.10+ with ffmpeg, espeak-ng and two Wav2Vec2 checkpoints of about 1.2 GB each. CPU works, GPU is optional. It exposes a FastAPI server (`/pronunciation`, `/phonemes`, `/tts`).
  - Only English is calibrated (Spearman ρ ≈ 0.65 against human scores on speechocean762). Strong accents, noise and short words reduce accuracy.
- Voices: **Kokoro** TTS (https://github.com/hexgrad/kokoro, Apache-2.0).
  - 82M parameters, with American (`a`) and British (`b`) English voices; Python/PyTorch, 24 kHz output.
  - The repo also has a `kokoro.js` folder (browser use still to be checked).
  - Vietnamese is not in the official model; the user mentioned a community "Kokoro Vietnamese" voice (storyvert), to be found and checked (licence, quality).
- Audio for the **44 English IPA sounds** (a phonemic chart, à la ELSA). Source: **TBD** (the user will add the name of the chart/alphabet resource later). Candidates to compare: the British Council phonemic chart, Adrian Underhill's Sound Foundations chart.

Constraints that shape the design:
- None of these models fits a Vercel Function (Python, GBs of weights, slow cold starts).
  - Scoring needs its own long-running service: Docker on Fly.io, Railway, Render or a small VPS; CPU first, measure the latency.
  - It is called from the backend (or straight from the browser with a short-lived signed token), and its endpoints need rate limits. This is the same kind of separate service as the planned Socket.IO server; consider hosting both on one machine.
- Word audio does not need a server at request time: generate US and UK audio for the ~9.7k words and the example sentences **offline** with Kokoro (like `words:enrich`). Store the files in object storage (Vercel Blob or Cloudflare R2), save the URLs on `Word`, and cache them on the CDN.
- Recordings are personal data: say how long they are kept (ideally not at all after scoring), and ask for microphone consent.

Features:
- [ ] **US/UK voices** for words and examples (Kokoro, generated offline), with an accent setting.
- [ ] **IPA sound chart**: the 44 sounds with audio, mouth or tongue hints and example words; tap to hear, record to compare.
- [ ] **Pronunciation scoring** (ELSA-like): record a word or sentence and get a 0–100 score with each word coloured, the expected IPA next to the IPA heard, and a tip for the worst sound. Save attempts to track progress per sound (e.g. /θ/, /æ/).
- [ ] **Speaking exercises** in learn and review sessions: "say this word" cards scored by the service; they count towards SRS ratings only if the learner opts in.
- [ ] **YouTube shadowing**:
  - paste a YouTube link, and the video plays in the official IFrame Player with the transcript line by line;
  - loop a line, slow it down, record yourself, then score the attempt against that line;
  - translate each line into Vietnamese (machine translation, cached);
  - tap a word to see its card and add it to your words.
  - **Open (legal):**
    - Downloading YouTube audio or scraping captions goes against YouTube's Terms of Service, and the YouTube Data API only downloads captions for videos the API user owns.
    - Options: transcripts that learners paste; a curated list of videos whose captions are licensed (e.g. Creative Commons); or speech-to-text on audio the learner records or uploads.
    - Decide before building.
- [ ] Shadowing library: curated videos by CEFR level and topic, with each user's progress.

### Phase 3d: 3D landing page – "Word Island" (requested 2026-11-12)

The user picked this direction out of three (the others: a deck of 3D flashcards that rearranges itself on scroll; physics letters that assemble into words).

**Concept.** A small low-poly island floats in the hero. Scrolling down the landing page flies the camera around it, and each stop illustrates the HTML section next to it:

| Section | What the island shows | Interaction |
|---|---|---|
| Hero | The whole island, bobbing gently | Drag to turn it (limited angle); it tilts slightly with the mouse |
| How it works | A path of 6 stepping stones labelled 10m → 1d → 3d → 8d → 3w → 2mo; a card hops along it, its colour following the mastery ramp `m0` → `m5` | Driven by scroll |
| CEFR levels | A mountain with 6 terraces: A1 at the beach up to C2 at the peak, each with the real word count from `/levels` | Hover or tap a terrace to see its count |
| Topics | Districts with a landmark each (e.g. Food & Drink = market, Travel = airport, Education = school, Nature = forest, Work = offices, Home = houses); the remaining topics are generic buildings with a sign | Hover to highlight; click opens `/topics/<slug>` |
| Call to action | The camera pulls back to the whole island | None |

**Design rules carried over to 3D**
- The house style (flat, no gradients, no resting shadows, no emoji):
  - flat shading with one palette texture (low-poly colour atlas);
  - lighting baked into vertex colours;
  - no realtime shadows, no bloom, a plain sky colour.
- Colours come from the CSS tokens (`--accent`, `--m0` … `--m5`, `--surface`, …), read at runtime.
- Dark theme: the same island at night (darker palette, lit windows), following `data-theme`.
- Topics are data, not hard-coded scenery:
  - a config maps a topic slug to a landmark model;
  - any other topic, including ones added later by admins, gets a generic building automatically. There are 24 topics in the seed, too many for 24 landmarks.

**Technical approach**
- Libraries: `three` + `@react-three/fiber` + `@react-three/drei` (`useGLTF`); GSAP ScrollTrigger (or `motion`'s `useScroll`) + Lenis for scroll progress.
- The camera follows a `CatmullRomCurve3` path keyed to scroll progress, with one waypoint per section.
- The page's HTML sections stay as they are (SEO, accessibility, static shell/PPR). The canvas is `position: fixed` behind them and `aria-hidden`.
  - Don't use drei's `ScrollControls`: it takes over scrolling and moves the content into the canvas.
- Loading:
  - the scene is a Client Component loaded with `next/dynamic` (`ssr: false`) after the page is idle;
  - `levels` and `topics` come as props from the existing cached `landingData()`;
  - a pre-rendered image of the island (AVIF/WebP) is shown first, so LCP does not change. The same image is the fallback with no WebGL, after a WebGL context loss, and on weak devices.
- `prefers-reduced-motion`: no fly-through; one still view of the island per section, or just the image.
- Budgets (to check in the prototype):
  - assets ≤ 1.5 MB compressed (glTF with Meshopt or Draco, KTX2 textures; `gltf-transform` to merge meshes);
  - about 100 draw calls or fewer;
  - 60 fps on a mid-range phone; `dpr` capped at 1.5;
  - rendering stops when the tab is hidden or the canvas is scrolled out of view;
  - JS for three + r3f (about 150–200 KB gzip) loads on the landing page only.
- Mobile: a lighter model (LOD), no mouse tilt, touch drag only in the hero (vertical swipes must still scroll the page).

**Assets**
- Either model the island in Blender, or start from CC0 low-poly kits (e.g. Kenney, Quaternius) and recolour them to the palette.
- Check every asset's licence (Poly Pizza mixes CC0 and CC-BY) and record sources and attribution, as `docs/DATA_SOURCES.md` does for word data.

Steps:
- [ ] **Art direction**: a moodboard and a map sketch of the island (districts, terraces, the SRS path, the camera path); choose which topics get a landmark.
- [ ] **Assets**: model the island or pick a kit; one palette texture; compress and merge; check the budget.
- [ ] **Prototype** at `/[locale]/lab/island` (`noindex`): the scene, the camera path and the scroll sync. Measure FPS and bundle size on a real phone (iOS Safari and Android Chrome) before going further.
- [ ] **Landing integration**:
  - the fixed canvas behind the existing sections;
  - real data as props;
  - the poster image and fallbacks;
  - reduced motion and the dark theme.
- [ ] **Interactions**: drag in the hero; hover or tap on terraces and districts. Keyboard users already have the HTML links.
- [ ] **QA**:
  - Lighthouse: LCP, CLS and TBT no worse than the current landing page;
  - WebGL context loss;
  - low-end Android;
  - both themes and both locales.

Open:
- Who makes the models: the user or a designer, or a CC0 kit recoloured by us?
- Later idea: reuse the island inside the app, e.g. a progress map on the dashboard where districts light up as the learner masters words in that topic.

### Phase 3: Extensions
- [ ] More exercise types: multiple choice, spelling, listen → type, fill in the blank from example sentences
- [ ] Starred words (personal decks: see Phase 3b)
- [ ] Streak freeze, achievement badges
- [ ] Placement test
- [ ] Anki import/export

### Phase 4: Optional
- [ ] AI features: generate more examples, explain nuance/usage, check learners' own sentences with new words
- [ ] Mobile app

---

## 10. Project structure

`✔` = exists; everything else is planned.

```text
Vocab/
├── PLAN.md                          ✔ this plan
├── README.md                        ✔ how to run the project
├── docs/DEPLOYMENT.md               ✔ hosting research & deployment guide
├── .claude/
│   ├── CLAUDE.md                    ✔ project notes for Claude Code
│   └── worklog/YYYY-MM-DD.md        ✔ daily work log
│
├── backend/                         NestJS 12 – REST API (port 4300)
│   ├── prisma/
│   │   ├── schema.prisma            ✔ all tables (section 5)
│   │   ├── migrations/              ✔ SQL migrations
│   │   ├── seed.ts                  ✔ topic seed
│   │   └── seed/topics.json         ✔ topic framework (section 8)
│   ├── prisma7.config.ts            ✔ Prisma CLI config (direct URL, seed command)
│   ├── vercel.json                  ✔ Vercel config (region sin1)
│   ├── scripts/import-words.ts      CSV/JSON import from the command line
│   └── src/
│       ├── main.ts                  ✔ /api prefix, CORS, ValidationPipe
│       ├── app.module.ts            ✔
│       ├── prisma/                  ✔ PrismaService (pg adapter, pooled URL)
│       ├── health/                  ✔ GET /api/health, /api/health/db
│       ├── topics/                  ✔ GET /api/topics
│       ├── auth/                    sign up, sign in, JWT, refresh, email verification
│       ├── users/                   profile, settings
│       ├── words/                   lookup, filter by topic/level
│       ├── study/                   learn, review (ts-fsrs), mastery
│       ├── notes/
│       ├── stats/                   time heartbeat, DailyStat, streaks, progress
│       ├── reminders/               hourly cron, email (Resend), Web Push
│       ├── admin/import/            upload, preview, commit
│       └── generated/prisma/        Prisma Client (generated, not committed)
│
└── frontend/                        Next.js 16 – UI (port 3300)
    ├── messages/vi.json, en.json    ✔ UI text in both languages
    ├── next.config.ts               ✔ next-intl plugin, /api rewrite to the backend
    ├── vercel.json                  ✔ Vercel config (region sin1)
    └── src/
        ├── proxy.ts                 ✔ locale detection, redirects / → /vi
        ├── i18n/                    ✔ routing, navigation, request config
        ├── lib/api.ts, types.ts     ✔ backend client
        ├── components/              ✔ SiteHeader, LocaleSwitcher, TopicGrid
        │                              (Flashcard, MasteryBadge, StreakFlame, Heatmap…)
        └── app/[locale]/
            ├── layout.tsx, page.tsx ✔
            ├── (auth)/login, register
            ├── (app)/dashboard, learn, review, practice, topics, levels,
            │        words, notes, progress, settings
            └── admin/words, topics, import
```

---

## 11. Cross-cutting requirements

- **Mobile-first**: most learners will review on their phones.
- Instant flashcards: prefetch the next card, apply ratings optimistically.
- Dark mode. Fully keyboard-operable on desktop.
- Store all timestamps in UTC; convert to the learner's timezone only when computing a "day" (streaks, DailyStat, reminders).
- Personal data export (progress + notes) for backups.
- Platform health checks call `/api/health`, which **does not query the DB**. A health check that touched the DB would keep Neon from ever scaling to zero and burn through the Free plan's compute quota.
- Project docs and code comments are written in **English**. UI text is bilingual (`frontend/messages/`).

---

## 12. Deployment (summary)

Details, price comparison and sources: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

**Chosen: free (0 USD/month)**

| Part | Where | Region |
|------|-------|--------|
| Frontend | Vercel Hobby (Next.js) | `sin1` |
| Backend | Vercel Hobby (NestJS as one Vercel Function) | `sin1` |
| Database | Neon Free ✔ | `aws-ap-southeast-1` (Singapore) |
| Hourly reminders (Phase 2) | Upstash QStash Free → `/api/cron/reminders` | – |
| Email (Phase 2) | Resend Free, once there is a custom domain | – |

- Everything runs in **Singapore**, close to Vietnam (~50 ms per DB query measured from the dev machine, vs. ~200–250 ms to the US).
- Vercel was chosen over Render Free for the backend: Render Free sleeps after 15 idle minutes and takes ~1 minute to wake, while Vercel Functions cold-start in well under a second.
- Trade-offs:
  - Hobby is non-commercial only.
  - The backend is serverless: no in-process cron, at most 300 s per request, 4.5 MB request bodies.
  - Dev and prod share one Neon DB for now.
- Deployment steps: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) §2. Two Vercel projects are imported from the same GitHub repo, with Root Directory `backend` and `frontend`.
- Later: a custom domain (~10 USD/year) for Resend email and nicer URLs. A paid always-on backend only if needed.
