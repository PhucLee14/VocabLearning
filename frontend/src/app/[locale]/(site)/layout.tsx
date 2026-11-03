import { SiteFooter, SiteHeader } from '@/components/shell/site-header';

export default function SiteLayout({ children }: LayoutProps<'/[locale]'>) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
