import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { useTranslations } from 'next-intl';
import { EmailPageFrame, VerifyEmailForm } from '@/components/forms/email-link-forms';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('AccountEmail');
  return { title: t('verifyTitle'), robots: { index: false } };
}

export default function VerifyEmailPage() {
  const t = useTranslations('AccountEmail');
  return (
    <EmailPageFrame title={t('verifyTitle')} lede={t('verifyLede')}>
      <VerifyEmailForm />
    </EmailPageFrame>
  );
}
