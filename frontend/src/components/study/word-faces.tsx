'use client';

import { useTranslations } from 'next-intl';
import { AudioButton } from '@/components/word/audio-button';
import { highlight } from '@/lib/highlight';
import type { CardWord } from '@/lib/types';

/** The word itself, large: headword, part of speech, IPA and the play button. */
export function WordHead({ word, size = 'lg' }: { word: CardWord; size?: 'lg' | 'md' }) {
  return (
    <div className="flex items-center gap-4">
      <div className="min-w-0 flex-1">
        <p
          className={`font-extrabold tracking-tight break-words ${size === 'lg' ? 'text-[34px] leading-tight sm:text-[42px]' : 'text-[26px] leading-tight'}`}
          lang="en"
        >
          {word.headword}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-muted">
          <span className="font-bold italic">{word.pos}</span>
          {word.ipa && <span lang="en">{word.ipa}</span>}
          <span className="pill">{word.cefrLevel}</span>
        </p>
      </div>
      <AudioButton word={word.headword} audioUrl={word.audioUrl} size={size === 'lg' ? 'lg' : 'md'} />
    </div>
  );
}

/** Everything a learner needs on the back of a card (or on a learn intro card). */
export function WordBody({ word, showVietnamese }: { word: CardWord; showVietnamese: boolean }) {
  const t = useTranslations('Word');
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-[19px] leading-snug font-bold" lang="en">
          {word.definitionEn}
        </p>
        {showVietnamese && word.meaningVi && (
          <p className="mt-2 text-[17px] text-accent-ink">
            <span className="sr-only">{t('meaning')}: </span>
            {word.meaningVi}
          </p>
        )}
      </div>

      {word.examples.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {word.examples.slice(0, 2).map((ex) => (
            <li key={ex.sentence} className="rounded-2xl bg-surface px-4 py-3">
              <p className="text-[16px]" lang="en">
                {highlight(ex.sentence, word.headword)}
              </p>
              {showVietnamese && ex.translationVi && <p className="mt-0.5 text-[14px] text-muted">{ex.translationVi}</p>}
            </li>
          ))}
        </ul>
      )}

      {word.synonyms.length > 0 && (
        <p className="text-[14px] text-muted">
          <span className="font-bold text-ink">{t('synonyms')}:</span> {word.synonyms.slice(0, 5).join(', ')}
        </p>
      )}

      {word.note && (
        <div className="rounded-2xl bg-warning-soft px-4 py-3 text-[15px] text-warning-ink">
          <p className="font-bold">{t('yourNote')}</p>
          <p className="whitespace-pre-line">{word.note}</p>
        </div>
      )}
    </div>
  );
}
