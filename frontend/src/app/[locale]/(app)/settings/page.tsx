import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { DeleteAccountForm, PasswordForm } from '@/components/forms/account-forms';
import { Section, SettingsForm } from '@/components/forms/settings-form';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { Page } from '@/components/shell/app-shell';
import { SignOutButton } from '@/components/shell/sign-out-button';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { getSettings, userGet } from '@/lib/server-api';
import type { Profile } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Settings');
  return { title: t('title') };
}

export default async function SettingsPage() {
  const t = await getTranslations('Settings');
  return (
    <Page>
      <header className="mb-8">
        <h1 className="text-[28px] font-extrabold tracking-tight">{t('title')}</h1>
      </header>
      <Suspense fallback={<div className="h-[520px] rounded-[22px] bg-surface" aria-hidden />}>
        <SettingsView />
      </Suspense>
    </Page>
  );
}

async function SettingsView() {
  const [t, settings, me] = await Promise.all([
    getTranslations('Settings'),
    getSettings(),
    userGet<Profile>('/me', '/settings'),
  ]);
  return (
    <div>
      <SettingsForm initial={settings} />

      <Section title={t('appearanceTitle')} description={t('appearanceLede')}>
        <div>
          <p className="field-label">{t('theme')}</p>
          <ThemeSwitcher />
        </div>
        <div>
          <p className="field-label">{t('language')}</p>
          <LocaleSwitcher />
        </div>
      </Section>

      <Section title={t('accountTitle')} description={t('accountLede', { email: me.email })}>
        <div>
          <p className="field-label">{t('signInMethods')}</p>
          <ul className="flex flex-col gap-2">
            {(
              [
                ['methodPassword', me.hasPassword],
                ['methodGoogle', me.hasGoogle],
              ] as const
            ).map(([key, on]) => (
              <li key={key} className="flex items-center justify-between gap-3 rounded-2xl bg-raised px-4 py-3 text-[15px]">
                <span className="font-bold">{t(key)}</span>
                <span className={`pill ${on ? 'pill-accent' : ''}`}>{on ? t('methodOn') : t('methodOff')}</span>
              </li>
            ))}
          </ul>
          {!me.hasGoogle && <p className="mt-2 text-[13px] text-muted">{t('googleLinkHelp')}</p>}
        </div>
        <PasswordForm hasPassword={me.hasPassword} />
        <div className="border-t border-line-strong pt-6">
          <SignOutButton className="btn btn-secondary" />
        </div>
      </Section>

      <Section title={t('dangerTitle')} description={t('dangerLede')} danger>
        <DeleteAccountForm email={me.email} hasPassword={me.hasPassword} />
      </Section>
    </div>
  );
}
