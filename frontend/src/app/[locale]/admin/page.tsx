import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { AdminStats } from '@/lib/admin-types';
import { formatDate, formatNumber } from '@/lib/format';
import { userGet } from '@/lib/server-api';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Admin');
  return { title: t('dashTitle') };
}

export default async function AdminDashboard() {
  const [t, locale, stats] = await Promise.all([
    getTranslations('Admin'),
    getLocale(),
    userGet<AdminStats>('/admin/stats', '/admin'),
  ]);
  const n = (v: number) => formatNumber(v, locale);
  const maxLearners = Math.max(1, ...stats.days.map((d) => d.learners));
  const maxCards = Math.max(1, ...stats.days.map((d) => d.reviews + d.newWords));

  return (
    <>
      <h1 className="mb-6 text-[28px] font-extrabold tracking-tight">{t('dashTitle')}</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <section className="panel">
          <h2 className="text-[15px] font-bold text-muted">{t('dashUsers')}</h2>
          <p className="num mt-1 text-[32px] font-extrabold">{n(stats.users.total)}</p>
          <p className="text-[14px] text-muted">{t('dashNewThisWeek', { count: n(stats.users.newThisWeek) })}</p>
          <p className="text-[14px] text-muted">
            {t('dashAdmins', { admins: n(stats.users.admins), disabled: n(stats.users.disabled) })}
          </p>
        </section>
        <section className="panel">
          <h2 className="text-[15px] font-bold text-muted">{t('dashActive')}</h2>
          <p className="num mt-1 text-[32px] font-extrabold">{n(stats.users.activeThisWeek)}</p>
          <p className="text-[14px] text-muted">{t('dashActiveHelp')}</p>
        </section>
        <section className="panel">
          <h2 className="text-[15px] font-bold text-muted">{t('dashWords')}</h2>
          <p className="num mt-1 text-[32px] font-extrabold">{n(stats.words)}</p>
          <p className="text-[14px] text-muted">{t('dashTopics', { count: n(stats.topics) })}</p>
        </section>
        <section className={`panel ${stats.openFeedback > 0 ? 'bg-warning-soft' : ''}`}>
          <h2 className="text-[15px] font-bold text-muted">{t('dashFeedback')}</h2>
          <p className="num mt-1 text-[32px] font-extrabold">{n(stats.openFeedback)}</p>
          <Link href="/admin/feedback?status=OPEN" className="text-[14px] font-bold">
            {t('dashFeedbackLink')}
          </Link>
        </section>
      </div>

      <section className="card mt-6 p-5 sm:p-6" aria-labelledby="days-title">
        <h2 id="days-title" className="text-[18px] font-extrabold">
          {t('dashDays')}
        </h2>
        <p className="mt-1 text-[13px] text-muted">{t('dashDaysNote')}</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[14px]">
            <thead className="text-muted">
              <tr className="border-b border-line">
                <th scope="col" className="py-2 pr-3 font-bold">
                  {t('dashDay')}
                </th>
                <th scope="col" className="w-[30%] py-2 pr-3 font-bold">
                  {t('dashLearners')}
                </th>
                <th scope="col" className="w-[30%] py-2 pr-3 font-bold">
                  {t('dashCards')}
                </th>
                <th scope="col" className="py-2 text-right font-bold">
                  {t('dashSignUps')}
                </th>
              </tr>
            </thead>
            <tbody>
              {[...stats.days].reverse().map((d) => (
                <tr key={d.date} className="border-b border-line last:border-0">
                  <th scope="row" className="py-2 pr-3 font-bold whitespace-nowrap">
                    {formatDate(d.date, locale, { weekday: 'short', year: undefined })}
                  </th>
                  <td className="py-2 pr-3">
                    <Bar value={d.learners} max={maxLearners} label={n(d.learners)} tone="bg-accent" />
                  </td>
                  <td className="py-2 pr-3">
                    <Bar value={d.reviews + d.newWords} max={maxCards} label={n(d.reviews + d.newWords)} tone="bg-m4" />
                  </td>
                  <td className="num py-2 text-right">{n(d.signUps)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/** A number with a bar behind it, scaled to the column's largest value. */
function Bar({ value, max, label, tone }: { value: number; max: number; label: string; tone: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-sunken">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="num w-12 text-right">{label}</span>
    </div>
  );
}
