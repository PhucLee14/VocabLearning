import { AppShell } from '@/components/shell/app-shell';

export default function AppLayout({ children }: LayoutProps<'/[locale]'>) {
  return <AppShell>{children}</AppShell>;
}
