import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { useTranslations } from 'next-intl';
import { EmailPageFrame, ResetPasswordForm } from '@/components/forms/email-link-forms';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('AccountEmail');
  return { title: t('resetTitle'), robots: { index: false } };
}

export default function ResetPasswordPage() {
  const t = useTranslations('AccountEmail');
  return (
    <EmailPageFrame title={t('resetTitle')} lede={t('resetLede')}>
      <ResetPasswordForm />
    </EmailPageFrame>
  );
}
