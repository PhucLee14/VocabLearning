import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { useTranslations } from 'next-intl';
import { EmailPageFrame, ForgotPasswordForm } from '@/components/forms/email-link-forms';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('AccountEmail');
  return { title: t('forgotTitle'), robots: { index: false } };
}

export default function ForgotPasswordPage() {
  const t = useTranslations('AccountEmail');
  return (
    <EmailPageFrame title={t('forgotTitle')} lede={t('forgotLede')}>
      <ForgotPasswordForm />
    </EmailPageFrame>
  );
}
