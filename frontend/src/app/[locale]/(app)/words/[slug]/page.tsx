import { ChevronLeft, TriangleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { Page } from '@/components/shell/app-shell';
import { highlight } from '@/lib/highlight';
import { AudioButton } from '@/components/word/audio-button';
import { CardActions } from '@/components/word/card-actions';
import { LevelPill } from '@/components/word/level-pill';
import { MasteryMeter } from '@/components/word/mastery-meter';
import { NoteEditor } from '@/components/word/note-editor';
import { Link } from '@/i18n/navigation';
import { apiGet } from '@/lib/api';
import { formatDate, formatRelative } from '@/lib/format';
import { getViewer, optionalUserGet } from '@/lib/server-api';
import type { WordDetail } from '@/lib/types';

export async function generateMetadata({ params }: PageProps<'/[locale]/words/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const word = await apiGet<WordDetail>(`/words/${encodeURIComponent(slug)}`).catch(() => null);
  return word ? { title: word.headword, description: `${word.headword} (${word.pos}): ${word.definitionEn}` } : {};
}

export default function WordPage({ params }: PageProps<'/[locale]/words/[slug]'>) {
  return (
    <Page>
      <Suspense fallback={<div className="h-[480px] rounded-[22px] bg-surface" aria-hidden />}>
        <Word params={params} />
      </Suspense>
    </Page>
  );
}

const RATING_KEYS = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' } as const;

async function Word({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [word, viewer, t, tf, locale] = await Promise.all([
    optionalUserGet<WordDetail>(`/words/${encodeURIComponent(slug)}`),
    getViewer(),
    getTranslations('Word'),
    getTranslations('Flashcards'),
    getLocale(),
  ]);
  if (!word) notFound();
  const name = (x: { nameVi: string; nameEn: string }) => (locale === 'vi' ? x.nameVi : x.nameEn);
  const p = word.progress;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <article className="lg:col-span-8">
        <Link href="/words?status=learned" className="btn btn-ghost -ml-2.5 mb-3">
          <ChevronLeft size={18} aria-hidden />
          {t('back')}
        </Link>

        <header className="card border-2 border-b-[6px] border-line-strong p-6 sm:p-8">
          <div className="flex items-start gap-5">
            <div className="min-w-0 flex-1">
              <h1 className="text-[36px] leading-tight font-extrabold tracking-tight break-words sm:text-[42px]" lang="en">
                {word.headword}
              </h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[16px] text-muted">
                <span className="font-bold italic">{word.pos}</span>
                {word.ipa && <span lang="en">{word.ipa}</span>}
                <LevelPill level={word.cefrLevel} />
              </p>
            </div>
            <AudioButton word={word.headword} audioUrl={word.audioUrl} size="lg" />
          </div>
          <p className="mt-6 text-[20px] leading-snug font-bold" lang="en">
            {word.definitionEn}
          </p>
          {word.meaningVi && (
            <p className="mt-3 text-[18px] text-accent-ink">
              <span className="sr-only">{t('meaning')}: </span>
              {word.meaningVi}
            </p>
          )}
        </header>

        {word.examples.length > 0 && (
          <section className="mt-6" aria-labelledby="ex-title">
            <h2 id="ex-title" className="mb-3 text-[18px] font-extrabold">
              {t('examples')}
            </h2>
            <ul className="flex flex-col gap-2.5">
              {word.examples.map((ex) => (
                <li key={ex.id} className="rounded-[18px] bg-surface px-5 py-3.5">
                  <p className="text-[17px]" lang="en">
                    {highlight(ex.sentence, word.headword)}
                  </p>
                  {ex.translationVi && <p className="mt-0.5 text-[15px] text-muted">{ex.translationVi}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {(word.synonyms.length > 0 || word.antonyms.length > 0 || word.collocations.length > 0) && (
          <section className="mt-6 grid gap-5 sm:grid-cols-2" aria-label={t('related')}>
            {(
              [
                ['synonyms', word.synonyms],
                ['antonyms', word.antonyms],
                ['collocations', word.collocations],
              ] as const
            )
              .filter(([, list]) => list.length > 0)
              .map(([key, list]) => (
                <div key={key}>
                  <h2 className="mb-2 text-[16px] font-extrabold">{t(key)}</h2>
                  <ul className="flex flex-wrap gap-2">
                    {list.map((s) => (
                      <li key={s} className="pill !min-h-8 !px-3 !text-[14px]" lang="en">
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </section>
        )}

        {word.otherSenses.length > 0 && (
          <section className="mt-6" aria-labelledby="senses-title">
            <h2 id="senses-title" className="mb-2 text-[16px] font-extrabold">
              {t('otherSenses')}
            </h2>
            <ul className="flex flex-col gap-2">
              {word.otherSenses.map((s) => (
                <li key={s.slug}>
                  <Link href={`/words/${s.slug}`} className="block rounded-[18px] bg-surface px-5 py-3 text-ink no-underline hover:bg-sunken">
                    <span className="font-bold italic">{s.pos}</span>
                    <span className="text-muted"> · {s.definitionEn}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {word.topics.length > 0 && (
          <section className="mt-6" aria-labelledby="topics-title">
            <h2 id="topics-title" className="mb-2 text-[16px] font-extrabold">
              {t('topics')}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {word.topics.map((topic) => (
                <li key={topic.slug}>
                  <Link href={`/topics/${topic.parentSlug ?? topic.slug}`} className="chip">
                    {name(topic)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {word.source && (
          <p className="mt-8 text-[13px] text-muted">
            {t('source')}: {word.source}
          </p>
        )}
      </article>

      <aside className="flex flex-col gap-4 lg:col-span-4 lg:pt-[52px]">
        <section className="panel" aria-labelledby="progress-title">
          <h2 id="progress-title" className="mb-3 text-[17px] font-extrabold">
            {t('yourProgress')}
          </h2>
          {!viewer ? (
            <>
              <p className="mb-4 text-[15px] text-muted">{t('signInToTrack')}</p>
              <Link href={`/login?next=/words/${word.slug}`} className="btn btn-primary">
                {t('signIn')}
              </Link>
            </>
          ) : !p ? (
            <>
              <p className="mb-4 text-[15px] text-muted">{t('notStarted')}</p>
              <CardActions wordId={word.id} started={false} />
            </>
          ) : (
            <>
              <MasteryMeter level={p.masteryLevel} showLabel />
              {p.isKnown ? (
                <p className="mt-3 text-[15px] text-muted">{t('markedKnown')}</p>
              ) : (
                <dl className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-raised px-3 py-2.5">
                    <dt className="text-[13px] font-bold text-muted">{t('recall')}</dt>
                    <dd className="num text-[20px] font-extrabold">{p.recall === null ? '—' : `${Math.round(p.recall * 100)}%`}</dd>
                  </div>
                  <div className="rounded-2xl bg-raised px-3 py-2.5">
                    <dt className="text-[13px] font-bold text-muted">{t('nextReview')}</dt>
                    <dd className="text-[16px] font-extrabold">
                      {new Date(p.due) <= new Date() ? t('dueNow') : formatRelative(p.due, locale)}
                    </dd>
                  </div>
                  <div className="rounded-2xl bg-raised px-3 py-2.5">
                    <dt className="text-[13px] font-bold text-muted">{t('reviews')}</dt>
                    <dd className="num text-[20px] font-extrabold">{p.reps}</dd>
                  </div>
                  <div className="rounded-2xl bg-raised px-3 py-2.5">
                    <dt className="text-[13px] font-bold text-muted">{t('lapses')}</dt>
                    <dd className="num text-[20px] font-extrabold">{p.lapses}</dd>
                  </div>
                </dl>
              )}
              {p.isLeech && (
                <p className="mt-3 flex items-start gap-2 rounded-2xl bg-warning-soft px-3 py-2.5 text-[14px] text-warning-ink">
                  <TriangleAlert size={18} aria-hidden className="mt-0.5 flex-none" />
                  {t('leech')}
                </p>
              )}
              <div className="mt-4">
                <CardActions wordId={word.id} started />
              </div>
            </>
          )}
        </section>

        {viewer && (
          <section className="panel">
            <NoteEditor slug={word.slug} initial={word.note?.content ?? ''} />
          </section>
        )}

        {viewer && word.history.length > 0 && (
          <section className="panel" aria-labelledby="history-title">
            <h2 id="history-title" className="mb-3 text-[17px] font-extrabold">
              {t('history')}
            </h2>
            <ol className="flex flex-col gap-2">
              {word.history.map((h) => (
                <li key={h.reviewedAt} className="flex items-center justify-between gap-3 text-[14px]">
                  <span className="text-muted">{formatDate(h.reviewedAt, locale, { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="flex items-center gap-2">
                    {h.mode === 'PRACTICE' && <span className="pill">{tf('modePractice')}</span>}
                    <span className={`pill ${h.rating === 1 ? 'pill-danger' : h.rating >= 3 ? 'pill-accent' : ''}`}>
                      {tf(RATING_KEYS[h.rating])}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </aside>
    </div>
  );
}
