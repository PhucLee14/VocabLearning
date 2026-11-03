'use client';

import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/client-api';
import type { CardWord, LearnQueue, Today } from '@/lib/types';
import { WordBody, WordHead } from './word-faces';

type Question = { word: CardWord; options: string[]; answer: number };

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Four definitions per word: the right one and three others from this session or the distractor pool. */
function buildQuiz(words: CardWord[], queue: LearnQueue): Question[] {
  const pool = [...queue.words.map((w) => w.definitionEn), ...queue.distractors.map((d) => d.definitionEn)];
  return shuffle(words).map((word) => {
    const wrong = shuffle(pool.filter((d) => d !== word.definitionEn)).slice(0, 3);
    const options = shuffle([word.definitionEn, ...wrong]);
    return { word, options, answer: options.indexOf(word.definitionEn) };
  });
}

/**
 * A learning session (PLAN.md §3.3): an intro card per word ("I already know
 * this" / "Learn this word"), then a quiz matching each new word to its
 * definition. Each quiz answer is the word's first review (Good or Again).
 */
export function LearnSession({ queue, showVietnamese }: { queue: LearnQueue; showVietnamese: boolean }) {
  const t = useTranslations('Learn');
  const router = useRouter();
  const [phase, setPhase] = useState<'intro' | 'quiz' | 'done'>('intro');
  const [index, setIndex] = useState(0);
  const [learning, setLearning] = useState<CardWord[]>([]);
  const [known, setKnown] = useState(0);
  const [quiz, setQuiz] = useState<Question[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const [today, setToday] = useState<Today | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shownAt = useRef(0); // set when each card appears (effect below)

  const words = queue.words;
  const word = words[index];
  const question = quiz[qIndex];

  useEffect(() => {
    shownAt.current = Date.now();
  }, [index, qIndex]);

  const total = words.length + learning.length;
  const step = phase === 'intro' ? index : phase === 'quiz' ? words.length + qIndex : total;

  async function decide(action: 'learn' | 'known') {
    if (!word || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ today: Today }>('/study/cards', { method: 'POST', body: { wordId: word.id, action } });
      setToday(res.today);
      const nextLearning = action === 'learn' ? [...learning, word] : learning;
      if (action === 'learn') setLearning(nextLearning);
      else setKnown((k) => k + 1);

      if (index + 1 < words.length) setIndex(index + 1);
      else if (nextLearning.length > 0) {
        setQuiz(buildQuiz(nextLearning, queue));
        setPhase('quiz');
      } else setPhase('done');
    } catch {
      setError(t('saveError'));
    } finally {
      setBusy(false);
    }
  }

  function answer(option: number) {
    if (!question || picked !== null) return;
    setPicked(option);
    const ok = option === question.answer;
    if (ok) setCorrect((c) => c + 1);
    api<{ today: Today }>('/study/review', {
      method: 'POST',
      body: { wordId: question.word.id, rating: ok ? 3 : 1, mode: 'LEARN', durationMs: Date.now() - shownAt.current },
    })
      .then((res) => setToday(res.today))
      .catch(() => setError(t('saveError')));
  }

  function next() {
    setPicked(null);
    if (qIndex + 1 < quiz.length) setQIndex(qIndex + 1);
    else setPhase('done');
  }

  // Keyboard: 1–4 picks an answer, Enter continues.
  useEffect(() => {
    if (phase !== 'quiz') return;
    const onKey = (e: KeyboardEvent) => {
      if (picked === null && ['1', '2', '3', '4'].includes(e.key)) answer(Number(e.key) - 1);
      else if (picked !== null && e.key === 'Enter') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const progress = useMemo(() => (total === 0 ? 0 : (step / total) * 100), [step, total]);

  if (phase === 'done') {
    return (
      <div className="mx-auto flex max-w-[560px] flex-col items-center py-10 text-center">
        <h1 className="text-[30px] font-extrabold">{t('doneTitle')}</h1>
        <dl className="mt-8 grid w-full grid-cols-3 gap-2">
          <div className="rounded-2xl bg-surface px-2 py-3">
            <dt className="text-[13px] font-bold text-muted">{t('doneLearned')}</dt>
            <dd className="num text-[26px] font-extrabold">{learning.length}</dd>
          </div>
          <div className="rounded-2xl bg-surface px-2 py-3">
            <dt className="text-[13px] font-bold text-muted">{t('doneKnown')}</dt>
            <dd className="num text-[26px] font-extrabold">{known}</dd>
          </div>
          <div className="rounded-2xl bg-surface px-2 py-3">
            <dt className="text-[13px] font-bold text-muted">{t('doneCorrect')}</dt>
            <dd className="num text-[26px] font-extrabold">
              {correct}/{learning.length}
            </dd>
          </div>
        </dl>
        {today && (
          <p className="mt-6 text-[15px] text-muted">
            {today.goalMet
              ? t('goalMet', { streak: today.streak })
              : t('goalLeft', { count: Math.max(0, today.goalCards - today.newWords - today.reviews) })}
          </p>
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" className="btn btn-primary btn-lg" onClick={() => router.refresh()}>
            {t('again')}
          </button>
          <Link href="/dashboard" className="btn btn-secondary btn-lg">
            {t('backHome')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[680px] flex-col gap-5">
      <div className="flex items-center gap-3">
        <Link href="/learn" aria-label={t('exit')} className="grid size-11 flex-none place-items-center rounded-full text-muted hover:bg-surface">
          <X size={24} aria-hidden />
        </Link>
        <div className="h-4 flex-1 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} aria-label={t('progressLabel')}>
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {phase === 'intro' && word && (
        <>
          <p className="text-[15px] font-bold text-muted">{t('introStep', { current: index + 1, total: words.length })}</p>
          <article className="card flex flex-col gap-6 border-2 border-b-[6px] border-line-strong p-6 sm:p-10">
            <WordHead word={word} />
            <WordBody word={word} showVietnamese={showVietnamese} />
          </article>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" className="btn btn-secondary btn-lg" disabled={busy} onClick={() => decide('known')}>
              {t('known')}
            </button>
            <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={() => decide('learn')}>
              {t('learn')}
            </button>
          </div>
        </>
      )}

      {phase === 'quiz' && question && (
        <>
          <p className="text-[15px] font-bold text-muted">{t('quizStep', { current: qIndex + 1, total: quiz.length })}</p>
          <h1 className="text-[24px] leading-snug font-extrabold sm:text-[28px]">
            {t('quizPrompt')} <span lang="en" className="text-accent-ink">{question.word.headword}</span>
          </h1>
          <ul className="flex flex-col gap-3">
            {question.options.map((option, i) => {
              const state =
                picked === null ? 'idle' : i === question.answer ? 'right' : i === picked ? 'wrong' : 'other';
              return (
                <li key={option}>
                  <button
                    type="button"
                    disabled={picked !== null}
                    onClick={() => answer(i)}
                    className={`flex w-full items-start gap-3 rounded-[18px] border-2 border-b-4 px-4 py-3.5 text-left text-[16px] transition-colors ${
                      state === 'right'
                        ? 'border-accent bg-accent-soft text-ink'
                        : state === 'wrong'
                          ? 'border-danger bg-danger-soft text-ink'
                          : state === 'other'
                            ? 'border-line text-muted'
                            : 'border-line-strong bg-raised hover:bg-surface'
                    }`}
                  >
                    <span className="num grid size-7 flex-none place-items-center rounded-lg border-2 border-line-strong text-[13px] font-extrabold text-muted">
                      {i + 1}
                    </span>
                    <span lang="en">{option}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {picked !== null && (
            <div
              role="status"
              className={`flex flex-col gap-3 rounded-[22px] p-5 sm:flex-row sm:items-center sm:justify-between ${
                picked === question.answer ? 'bg-accent-soft' : 'bg-danger-soft'
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`grid size-9 flex-none place-items-center rounded-full text-white ${picked === question.answer ? 'bg-accent' : 'bg-danger'}`}
                >
                  {picked === question.answer ? <Check size={20} strokeWidth={3} aria-hidden /> : <X size={20} strokeWidth={3} aria-hidden />}
                </span>
                <div>
                  <p className={`text-[18px] font-extrabold ${picked === question.answer ? 'text-accent-ink' : 'text-danger'}`}>
                    {picked === question.answer ? t('right') : t('wrong')}
                  </p>
                  {showVietnamese && question.word.meaningVi && (
                    <p className="text-[15px] text-ink">
                      {question.word.headword}: {question.word.meaningVi}
                    </p>
                  )}
                </div>
              </div>
              <button type="button" className={`btn btn-lg ${picked === question.answer ? 'btn-primary' : 'btn-danger'}`} onClick={next}>
                {t('continue')}
              </button>
            </div>
          )}
        </>
      )}
      {error && <p className="text-center text-[14px] text-danger">{error}</p>}
    </div>
  );
}
