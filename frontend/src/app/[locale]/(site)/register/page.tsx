import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthPage } from '@/components/forms/auth-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Auth');
  return { title: t('registerTitle') };
}

export default function RegisterPage() {
  return <AuthPage mode="register" />;
}
