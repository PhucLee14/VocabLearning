# Plan: English Vocabulary Learning Web App

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
| Auth | Built in NestJS: email + password (argon2), short-lived JWT access token, rotating refresh token in an httpOnly cookie. Google OAuth later. | Email verification and password reset sent via Resend |
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
User              id, email, passwordHash, name, role (USER|ADMIN), locale (vi|en),
                  timezone, emailVerifiedAt, googleId
RefreshToken      id, userId, tokenHash, userAgent, expiresAt, revokedAt
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

| Route | Page | Main content |
|-------|------|--------------|
| `/` | Landing | Introduction, get-started button |
| `/login`, `/register` | Sign in / Sign up | Email + password (Google later), email verification |
| `/dashboard` | **Today** | Streak 🔥, due count, new words, time today vs. goal, *Review* & *Learn new words* buttons, 7-day forecast |
| `/learn` | Learn new words | Pick topic/level → learning session (3.3) |
| `/review` | Review | Flashcards for due words (3.4) |
| `/practice` | Practice | Flashcards that don't affect the schedule |
| `/topics`, `/topics/[slug]` | Topics | Topic list + progress; word list filtered by level and mastery |
| `/levels/[level]` | Levels | Same as above, per A1–C2 |
| `/words/[slug]` | Word detail | Definition, IPA, audio, examples, notes, mastery, recall probability, review history |
| `/notes` | Notebook | All notes, search, tags |
| `/progress` | Progress | Section 3.11 |
| `/settings` | Settings | Daily goal, new words/day, reminder time & channels, timezone, show Vietnamese meaning, retention |
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

### Suggested vocabulary sources (check the licence before use)

| Source | Provides | Notes |
|--------|----------|-------|
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
- [x] Bilingual vi/en UI (next-intl), layout, dark mode. The home page lists topics from the API.
- [x] Move Neon to Singapore (`aws-ap-southeast-1`)
- [x] Next.js rewrite `/api/*` → backend, so the auth cookie is first-party
- [x] Deployment config: `vercel.json` (`sin1`) for both apps, Node 24.x. Verified with a local `vercel build`.
- [ ] Deploy to Vercel. Needs a GitHub repo + Vercel account; steps in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) §2.
- [ ] Sign up / sign in (JWT + refresh token), email verification, admin role

### Phase 1: MVP (learn and review)
- [ ] ~50 sample words for testing
- [ ] CSV/JSON import: CLI script + `/admin/import` with a preview step
- [ ] Topic, level and word detail pages (pronunciation via Web Speech API)
- [ ] **Learn new words** session (3.3)
- [ ] **Flashcards + SRS** with ts-fsrs, Review & Practice modes, keyboard shortcuts
- [ ] **Mastery** computation, shown on words, topics and levels
- [ ] **Word notes**
- [ ] Dashboard: due count, new words, in-app reminder badge

### Phase 2: Habits and progress
- [ ] **Study time tracking** + `StudySession` / `DailyStat`
- [ ] **Streaks** + daily goal in settings
- [ ] **Progress** page: heatmap, charts, 7-day forecast
- [ ] PWA (manifest + service worker) + **Web Push**
- [ ] `/api/cron/reminders` endpoint + hourly Upstash QStash schedule
- [ ] **Email reminders** (Resend; needs a custom domain)
- [ ] Notebook (tags, search)
- [ ] Auto-enrich IPA/audio/definitions from a dictionary API

### Phase 3: Extensions
- [ ] More exercise types: multiple choice, spelling, listen → type, fill in the blank from example sentences
- [ ] Personal decks, starred words
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
├── backend/                         NestJS 12 – REST API (port 4100)
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
└── frontend/                        Next.js 16 – UI (port 3100)
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
