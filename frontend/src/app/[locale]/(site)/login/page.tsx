import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthPage } from '@/components/forms/auth-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Auth');
  return { title: t('loginTitle') };
}

export default function LoginPage() {
  return <AuthPage mode="login" />;
}
