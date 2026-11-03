'use client';

import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AudioButton } from '@/components/word/audio-button';
import type { WordSummary } from '@/lib/types';

/** The landing page's live element: real words from the bank, flipped like in a review. */
export function DemoCard({ words }: { words: (WordSummary & { example: string | null })[] }) {
  const t = useTranslations('Landing');
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  if (words.length === 0) return null;
  const w = words[i % words.length];

  return (
    <div className="flex flex-col gap-4">
      <div className="flip">
        <div className="flip-inner" data-flipped={flipped}>
          <div
            onClick={() => setFlipped(true)}
            aria-hidden={flipped}
            className="flip-face card flex min-h-[300px] cursor-pointer flex-col border-2 border-b-[6px] border-line-strong p-7"
          >
            <div className="flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[40px] leading-tight font-extrabold tracking-tight" lang="en">
                  {w.headword}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[15px] text-muted">
                  <span className="font-bold italic">{w.pos}</span>
                  {w.ipa && <span lang="en">{w.ipa}</span>}
                  <span className="pill">{w.cefrLevel}</span>
                </p>
              </div>
              <AudioButton word={w.headword} audioUrl={w.audioUrl} size="lg" />
            </div>
            <p className="mt-auto pt-10 text-[14px] font-bold text-muted">{t('demoTap')}</p>
          </div>
          <div aria-hidden={!flipped} className="flip-face flip-back card flex min-h-[300px] flex-col gap-4 border-2 border-b-[6px] border-accent p-7">
            <p className="text-[26px] font-extrabold" lang="en">
              {w.headword}
            </p>
            <p className="text-[18px] leading-snug font-bold" lang="en">
              {w.definitionEn}
            </p>
            {w.meaningVi && <p className="text-[17px] text-accent-ink">{w.meaningVi}</p>}
            {w.example && (
              <p className="rounded-2xl bg-surface px-4 py-3 text-[15px]" lang="en">
                {w.example}
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="flex gap-3">
        <button type="button" className="btn btn-secondary flex-1" onClick={() => setFlipped((f) => !f)}>
          {flipped ? t('demoFront') : t('demoFlip')}
        </button>
        <button
          type="button"
          className="btn btn-secondary flex-1"
          onClick={() => {
            setFlipped(false);
            setI((n) => n + 1);
          }}
        >
          {t('demoNext')}
          <ArrowRight size={18} aria-hidden />
        </button>
      </div>
    </div>
  );
}
