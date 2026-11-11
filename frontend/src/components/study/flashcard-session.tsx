'use client';

import { ArrowLeftRight, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { ApiError, api } from '@/lib/client-api';
import { formatInterval } from '@/lib/format';
import type { Rating, StudyItem, Today } from '@/lib/types';
import { WordBody, WordHead } from './word-faces';

type Mode = 'REVIEW' | 'PRACTICE';
type QueueItem = StudyItem & { requeued?: boolean };

const RATINGS: { rating: Rating; key: 'again' | 'hard' | 'good' | 'easy'; className: string }[] = [
  { rating: 1, key: 'again', className: 'btn-secondary text-danger' },
  { rating: 2, key: 'hard', className: 'btn-secondary' },
  { rating: 3, key: 'good', className: 'btn-primary' },
  { rating: 4, key: 'easy', className: 'btn-secondary text-accent-ink' },
];

/**
 * A run of flashcards. Space or Enter flips, 1–4 rates.
 * REVIEW updates the schedule; PRACTICE only logs. "Again" in a review puts
 * the card back at the end of this session, as Anki does.
 */
export function FlashcardSession({
  items,
  mode,
  showVietnamese,
  exitHref = '/dashboard',
}: {
  items: StudyItem[];
  mode: Mode;
  showVietnamese: boolean;
  exitHref?: string;
}) {
  const t = useTranslations('Flashcards');
  const locale = useLocale();
  const router = useRouter();
  const [queue, setQueue] = useState<QueueItem[]>(items);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reverse, setReverse] = useState(false);
  const [counts, setCounts] = useState<Record<Rating, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 });
  const [today, setToday] = useState<Today | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shownAt = useRef(0); // set when each card appears (effect below)
  const pending = useRef(0);
  // Reference time for the interval labels; the previews were computed when the queue loaded.
  const [loadedAt] = useState(() => Date.now());

  const current = queue[index];
  const finished = index >= queue.length;
  const reviewed = counts[1] + counts[2] + counts[3] + counts[4];

  useEffect(() => {
    shownAt.current = Date.now();
  }, [index]);

  const rate = useCallback(
    (rating: Rating) => {
      if (!current || !flipped) return;
      const durationMs = Date.now() - shownAt.current;
      pending.current++;
      api<{ today: Today }>('/study/review', {
        method: 'POST',
        body: { wordId: current.word.id, rating, mode, durationMs },
      })
        .then((res) => setToday(res.today))
        // 409: the card was just rated elsewhere (another tab); that rating stands.
        .catch((error) => {
          if (!(error instanceof ApiError && error.status === 409)) setError(t('saveError'));
        })
        .finally(() => pending.current--);

      setCounts((c) => ({ ...c, [rating]: c[rating] + 1 }));
      if (mode === 'REVIEW' && rating === 1 && !current.requeued) {
        setQueue((q) => [...q, { ...current, requeued: true }]);
      }
      setFlipped(false);
      setIndex((i) => i + 1);
    },
    [current, flipped, mode, t],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (finished || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === ' ' || e.key === 'Enter') {
        if ((e.target as HTMLElement).closest('button, a')) return; // let focused controls act
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (['1', '2', '3', '4'].includes(e.key)) {
        rate(Number(e.key) as Rating);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finished, rate]);

  if (finished) {
    const correct = counts[3] + counts[4];
    return (
      <div className="mx-auto flex max-w-[560px] flex-col items-center py-10 text-center">
        <h1 className="text-[30px] font-extrabold">{t('doneTitle')}</h1>
        <p className="mt-2 text-[17px] text-muted">
          {t('doneStats', { count: reviewed, correct, percent: reviewed ? Math.round((correct / reviewed) * 100) : 0 })}
        </p>
        <dl className="mt-8 grid w-full grid-cols-4 gap-2">
          {RATINGS.map(({ rating, key }) => (
            <div key={key} className="rounded-2xl bg-surface px-2 py-3">
              <dt className="text-[13px] font-bold text-muted">{t(key)}</dt>
              <dd className="num text-[24px] font-extrabold">{counts[rating]}</dd>
            </div>
          ))}
        </dl>
        {today && (
          <p className="mt-6 text-[15px] text-muted">
            {today.goalMet
              ? t('goalMet', { streak: today.streak })
              : t('goalLeft', { count: Math.max(0, today.goalCards - today.newWords - today.reviews) })}
          </p>
        )}
        {error && <p className="mt-4 text-[14px] text-danger">{error}</p>}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/dashboard" className="btn btn-primary btn-lg" onClick={() => router.refresh()}>
            {t('backHome')}
          </Link>
          <Link href="/learn" className="btn btn-secondary btn-lg">
            {t('learnMore')}
          </Link>
        </div>
      </div>
    );
  }

  // Practice never moves the schedule, so its buttons show no intervals.
  const intervals = current.requeued || mode === 'PRACTICE'
    ? null
    : Object.fromEntries(
        RATINGS.map(({ rating }) => [
          rating,
          formatInterval(new Date(current.preview[String(rating) as '1']).getTime() - loadedAt, locale),
        ]),
      );

  return (
    <div className="mx-auto flex max-w-[680px] flex-col gap-5">
      {/* Progress through the session */}
      <div className="flex items-center gap-3">
        <Link href={exitHref} aria-label={t('exit')} className="grid size-11 flex-none place-items-center rounded-full text-muted hover:bg-surface">
          <X size={24} aria-hidden />
        </Link>
        <div
          className="h-4 flex-1 overflow-hidden rounded-full bg-sunken"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={queue.length}
          aria-valuenow={index}
          aria-label={t('progress', { done: index, total: queue.length })}
        >
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${(index / queue.length) * 100}%` }} />
        </div>
        <span className="num w-14 text-right text-[14px] font-bold text-muted">
          {index + 1}/{queue.length}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className={`pill ${mode === 'REVIEW' ? 'pill-accent' : ''}`}>
          {mode === 'REVIEW' ? t('modeReview') : t('modePractice')}
        </span>
        <button type="button" className="btn btn-ghost" aria-pressed={reverse} onClick={() => setReverse((r) => !r)}>
          <ArrowLeftRight size={18} aria-hidden />
          {reverse ? t('reverseOn') : t('reverseOff')}
        </button>
      </div>

      {/* The card */}
      <div className="flip">
        <div className="flip-inner" data-flipped={flipped}>
          {/* Clicking the card flips it; keyboard users have Space and the "Show answer" button. */}
          <div
            onClick={() => setFlipped(true)}
            aria-hidden={flipped}
            className="flip-face card flex min-h-[340px] cursor-pointer flex-col justify-center border-2 border-b-[6px] border-line-strong p-6 text-left sm:p-10"
          >
            {reverse ? (
              <div>
                <p className="text-[22px] leading-snug font-bold" lang="en">
                  {current.word.definitionEn}
                </p>
                {showVietnamese && current.word.meaningVi && (
                  <p className="mt-3 text-[17px] text-muted">{current.word.meaningVi}</p>
                )}
                <p className="mt-4 text-[15px] text-muted">
                  <span className="font-bold italic">{current.word.pos}</span> · {t('guessWord')}
                </p>
              </div>
            ) : (
              <WordHead word={current.word} />
            )}
            <span className="mt-auto pt-8 text-[14px] font-bold text-muted">{t('tapToFlip')}</span>
          </div>

          <div
            aria-hidden={!flipped}
            className="flip-face flip-back card flex min-h-[340px] flex-col gap-5 border-2 border-b-[6px] border-accent p-6 sm:p-10"
          >
            <WordHead word={current.word} size="md" />
            <WordBody word={current.word} showVietnamese={showVietnamese} />
          </div>
        </div>
      </div>

      {/* Rating */}
      {flipped ? (
        <div>
          <p className="mb-3 text-center text-[15px] font-bold text-muted">{t('howWell')}</p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {RATINGS.map(({ rating, key, className }) => (
              <button key={key} type="button" className={`btn ${className} flex-col !gap-0 py-2`} onClick={() => rate(rating)}>
                <span>{t(key)}</span>
                {intervals && <span className="text-[12px] font-bold opacity-80">{intervals[rating]}</span>}
              </button>
            ))}
          </div>
          {mode === 'PRACTICE' && <p className="mt-3 text-center text-[13px] text-muted">{t('practiceNote')}</p>}
        </div>
      ) : (
        <button type="button" className="btn btn-primary btn-lg w-full" onClick={() => setFlipped(true)}>
          {t('showAnswer')}
        </button>
      )}
      <p className="hidden text-center text-[13px] text-muted sm:block">{t('shortcuts')}</p>
      {error && <p className="text-center text-[14px] text-danger">{error}</p>}
    </div>
  );
}
