'use client';

import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { api } from '@/lib/client-api';
import type { Settings } from '@/lib/types';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Study and reminder settings. Every control saves itself and shows a quiet "Saved". */
export function SettingsForm({ initial }: { initial: Settings }) {
  const t = useTranslations('Settings');
  const [settings, setSettings] = useState(initial);
  const [state, setState] = useState<SaveState>('idle');

  async function save(patch: Partial<Settings>) {
    const previous = settings;
    setSettings({ ...settings, ...patch });
    setState('saving');
    try {
      setSettings(await api<Settings>('/me/settings', { method: 'PATCH', body: patch }));
      setState('saved');
    } catch {
      setSettings(previous);
      setState('error');
    }
  }

  const stamp = (
    <span role="status" className={`text-[13px] font-bold ${state === 'error' ? 'text-danger' : 'text-muted'}`}>
      {state === 'saving' ? t('saving') : state === 'saved' ? t('saved') : state === 'error' ? t('saveError') : ''}
    </span>
  );

  return (
    <>
      <Section title={t('studyTitle')} description={t('studyLede')} aside={stamp}>
        <Choice
          label={t('dailyNewWords')}
          help={t('dailyNewWordsHelp')}
          value={settings.dailyNewWords}
          options={[5, 10, 15, 20, 30]}
          format={(n) => t('wordsN', { count: n })}
          onChange={(v) => save({ dailyNewWords: v })}
        />
        <Choice
          label={t('dailyGoalCards')}
          help={t('dailyGoalCardsHelp')}
          value={settings.dailyGoalCards}
          options={[5, 10, 20, 30, 50]}
          format={(n) => t('cardsN', { count: n })}
          onChange={(v) => save({ dailyGoalCards: v })}
        />
        <Choice
          label={t('dailyGoalMinutes')}
          help={t('dailyGoalMinutesHelp')}
          value={settings.dailyGoalMinutes}
          options={[5, 10, 15, 30, 60]}
          format={(n) => t('minutesN', { count: n })}
          onChange={(v) => save({ dailyGoalMinutes: v })}
        />
        <Choice
          label={t('retention')}
          help={t('retentionHelp')}
          value={settings.desiredRetention}
          options={[0.85, 0.9, 0.95]}
          format={(n) => t(n === 0.85 ? 'retentionRelaxed' : n === 0.9 ? 'retentionBalanced' : 'retentionStrict', { percent: Math.round(n * 100) })}
          onChange={(v) => save({ desiredRetention: v })}
        />
        <Toggle
          label={t('showVietnamese')}
          help={t('showVietnameseHelp')}
          checked={settings.showVietnamese}
          onChange={(v) => save({ showVietnamese: v })}
        />
      </Section>

      <Section title={t('remindersTitle')} description={t('remindersLede')}>
        <p className="rounded-2xl bg-warning-soft px-4 py-3 text-[14px] text-warning-ink">{t('remindersNotice')}</p>
        <Toggle
          label={t('reminderEnabled')}
          help={t('reminderEnabledHelp')}
          checked={settings.reminderEnabled}
          onChange={(v) => save({ reminderEnabled: v })}
        />
        <div>
          <label htmlFor="s-time" className="field-label">
            {t('reminderTime')}
          </label>
          <input
            id="s-time"
            type="time"
            className="input max-w-[160px]"
            defaultValue={settings.reminderTime}
            disabled={!settings.reminderEnabled}
            onBlur={(e) => e.target.value && e.target.value !== settings.reminderTime && save({ reminderTime: e.target.value })}
          />
        </div>
        <fieldset disabled={!settings.reminderEnabled}>
          <legend className="field-label">{t('channels')}</legend>
          <div className="flex flex-wrap gap-2">
            {(['EMAIL', 'PUSH'] as const).map((c) => {
              const on = settings.reminderChannels.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  className="chip"
                  aria-pressed={on}
                  onClick={() =>
                    save({
                      reminderChannels: on ? settings.reminderChannels.filter((x) => x !== c) : [...settings.reminderChannels, c],
                    })
                  }
                >
                  {t(c === 'EMAIL' ? 'channelEmail' : 'channelPush')}
                </button>
              );
            })}
          </div>
        </fieldset>
      </Section>
    </>
  );
}

/** A settings section: title and description on the left, the panel on the right. */
export function Section({
  title,
  description,
  aside,
  children,
  danger = false,
}: {
  title: string;
  description: string;
  aside?: ReactNode;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <section className="grid gap-4 border-b border-line py-8 first:pt-0 last:border-0 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] lg:gap-10">
      <div>
        <h2 className={`text-[18px] font-extrabold ${danger ? 'text-danger' : ''}`}>{title}</h2>
        <p className="mt-1 text-[15px] text-muted">{description}</p>
        {aside && <div className="mt-3">{aside}</div>}
      </div>
      <div className="panel flex flex-col gap-6">{children}</div>
    </section>
  );
}

function Choice<T extends number>({
  label,
  help,
  value,
  options,
  format,
  onChange,
}: {
  label: string;
  help: string;
  value: T;
  options: T[];
  format: (v: T) => string;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className="field-label !mb-1">{label}</legend>
      <p className="mb-3 text-[14px] text-muted">{help}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={o} type="button" className="chip" aria-pressed={o === value} onClick={() => o !== value && onChange(o)}>
            {format(o)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Toggle({
  label,
  help,
  checked,
  onChange,
}: {
  label: string;
  help: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-[15px] font-bold">{label}</span>
        <span className="block text-[14px] text-muted">{help}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="relative mt-0.5 h-7 w-12 flex-none rounded-full bg-line-strong transition-colors peer-checked:bg-accent peer-focus-visible:outline-3 peer-focus-visible:outline-accent peer-focus-visible:outline-offset-2 after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5"
      />
    </label>
  );
}
