'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useMemo, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/client-api';
import { CEFR_LEVELS, type CefrLevel, type Gender, type Profile } from '@/lib/types';

const GENDERS: (Gender | '')[] = ['FEMALE', 'MALE', 'OTHER', ''];

/** Basic profile fields. One Save for the panel. */
export function ProfileForm({ profile }: { profile: Profile }) {
  const t = useTranslations('Profile');
  const router = useRouter();
  const [gender, setGender] = useState<Gender | ''>(profile.gender ?? '');
  const [target, setTarget] = useState<CefrLevel | ''>(profile.targetLevel ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const zones = useMemo(() => {
    let list: string[] = [];
    try {
      list = Intl.supportedValuesOf('timeZone');
    } catch {
      // Older browsers: only the current value.
    }
    // ICU lists canonical names (e.g. "Asia/Saigon"), so the stored alias
    // ("Asia/Ho_Chi_Minh") may be missing: keep it first, or the select would
    // silently fall back to the first zone and saving would change it.
    return list.includes(profile.timezone) ? list : [profile.timezone, ...list];
  }, [profile.timezone]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setState('saving');
    try {
      await api('/me', {
        method: 'PATCH',
        body: {
          name: String(data.get('name') ?? '').trim(),
          gender: gender || null,
          birthDate: String(data.get('birthDate') ?? '') || null,
          targetLevel: target || null,
          bio: String(data.get('bio') ?? ''),
          timezone: String(data.get('timezone') ?? profile.timezone),
        },
      });
      setState('saved');
      router.refresh();
    } catch {
      setState('error');
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form onSubmit={submit} onChange={() => state === 'saved' && setState('idle')} className="flex flex-col gap-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="p-name" className="field-label">
            {t('name')}
          </label>
          <input id="p-name" name="name" required maxLength={80} defaultValue={profile.name} autoComplete="name" className="input" />
        </div>
        <div>
          <label htmlFor="p-birth" className="field-label">
            {t('birthDate')}
          </label>
          <input id="p-birth" name="birthDate" type="date" min="1900-01-01" max={today} defaultValue={profile.birthDate ?? ''} className="input" />
        </div>
      </div>

      <fieldset>
        <legend className="field-label">{t('gender')}</legend>
        <div className="flex flex-wrap gap-2">
          {GENDERS.map((g) => (
            <button key={g || 'none'} type="button" className="chip" aria-pressed={gender === g} onClick={() => setGender(g)}>
              {t(g === '' ? 'genderNone' : `gender_${g}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="field-label !mb-1">{t('targetLevel')}</legend>
        <p className="mb-3 text-[14px] text-muted">{t('targetLevelHelp')}</p>
        <div className="flex flex-wrap gap-2">
          {CEFR_LEVELS.map((l) => (
            <button key={l} type="button" className="chip" aria-pressed={target === l} onClick={() => setTarget(target === l ? '' : l)}>
              {l}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="p-bio" className="field-label">
          {t('bio')}
        </label>
        <textarea id="p-bio" name="bio" maxLength={300} defaultValue={profile.bio ?? ''} placeholder={t('bioPlaceholder')} className="input" />
      </div>

      <div>
        <label htmlFor="p-tz" className="field-label">
          {t('timezone')}
        </label>
        <select id="p-tz" name="timezone" defaultValue={profile.timezone} aria-describedby="p-tz-help" className="input">
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
        <p id="p-tz-help" className="mt-1.5 text-[13px] text-muted">
          {t('timezoneHelp')}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={state === 'saving'}>
          {t('save')}
        </button>
        <span role="status" className={`text-[13px] font-bold ${state === 'error' ? 'text-danger' : 'text-muted'}`}>
          {state === 'saving' ? t('saving') : state === 'saved' ? t('saved') : state === 'error' ? t('saveError') : ''}
        </span>
      </div>
    </form>
  );
}
