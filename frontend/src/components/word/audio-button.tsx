'use client';

import { Volume2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/** Plays the recorded pronunciation, or the browser's English voice when there is none. */
export function AudioButton({
  word,
  audioUrl,
  size = 'md',
}: {
  word: string;
  audioUrl: string | null;
  size?: 'md' | 'lg';
}) {
  const t = useTranslations('Word');
  const [playing, setPlaying] = useState(false);

  const speak = () => {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(word);
    u.lang = 'en-US';
    u.rate = 0.9;
    u.onend = () => setPlaying(false);
    setPlaying(true);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  const play = (e: React.MouseEvent) => {
    e.stopPropagation(); // inside a flashcard, playing must not flip it
    if (!audioUrl) return speak();
    const audio = new Audio(audioUrl);
    setPlaying(true);
    audio.onended = () => setPlaying(false);
    audio.play().catch(() => speak());
  };

  const dim = size === 'lg' ? 'size-14' : 'size-10';
  return (
    <button
      type="button"
      onClick={play}
      aria-label={t('play', { word })}
      title={t('play', { word })}
      className={`btn btn-secondary ${dim} flex-none rounded-full !p-0 ${playing ? 'text-accent-ink' : ''}`}
    >
      <Volume2 size={size === 'lg' ? 26 : 20} strokeWidth={2.2} aria-hidden />
    </button>
  );
}
