import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { one, Pager, pageOf } from '@/components/admin/pager';
import { Link } from '@/i18n/navigation';
import type { AuditEntry, Paged } from '@/lib/admin-types';
import { formatDate } from '@/lib/format';
import { userGet } from '@/lib/server-api';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Admin');
  return { title: t('auditTitle') };
}

const TARGET_TYPES = ['user', 'word', 'topic', 'feedback', 'import'] as const;
const ACTIONS = [
  'user.disable',
  'user.enable',
  'user.role',
  'user.revoke_sessions',
  'word.create',
  'word.update',
  'word.delete',
  'word.merge',
  'topic.create',
  'topic.update',
  'topic.reorder',
  'topic.delete',
  'import.commit',
  'feedback.update',
] as const;

/** Where an entry's target lives in the admin site, if it still can be opened. */
function targetHref(e: AuditEntry) {
  if (!e.targetId || e.action.endsWith('.delete') || e.action === 'word.merge') return null;
  if (e.targetType === 'user') return `/admin/users/${e.targetId}`;
  if (e.targetType === 'word') return `/admin/words/${e.targetId}`;
  return null;
}

export default async function AdminAudit({ searchParams }: PageProps<'/[locale]/admin/audit'>) {
  const sp = await searchParams;
  const filters = {
    targetType: TARGET_TYPES.find((x) => x === one(sp.targetType)) ?? '',
    targetId: /^[\w-]{1,80}$/.test(one(sp.targetId)) ? one(sp.targetId) : '',
  };
  const page = pageOf(sp);
  const query = new URLSearchParams({ page: String(page) });
  for (const [k, v] of Object.entries(filters)) if (v) query.set(k, v);

  const [t, locale, data] = await Promise.all([
    getTranslations('Admin'),
    getLocale(),
    userGet<Paged<AuditEntry>>(`/admin/audit?${query}`, '/admin/audit'),
  ]);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[28px] font-extrabold tracking-tight">{t('auditTitle')}</h1>
        <p className="mt-1 text-[15px] text-muted">{t('auditLede')}</p>
      </header>
      {data.items.length === 0 ? (
        <p className="rounded-[22px] bg-surface px-6 py-8 text-center text-muted">{t('empty')}</p>
      ) : (
        <ol className="flex max-w-[960px] flex-col gap-2">
          {data.items.map((e) => {
            const href = targetHref(e);
            const known = (ACTIONS as readonly string[]).includes(e.action);
            const verb = known ? t(`action_${e.action.replace('.', '_')}` as 'action_user_role') : e.action;
            return (
              <li key={e.id} className="rounded-2xl bg-surface px-4 py-3 text-[14px]">
                <p>
                  <span className="font-extrabold">{e.actor?.name ?? t('auditScript')}</span> {verb}{' '}
                  {e.targetName &&
                    (href ? (
                      <Link href={href} className="font-bold">
                        {e.targetName}
                      </Link>
                    ) : (
                      <span className="font-bold">{e.targetName}</span>
                    ))}
                  <time dateTime={e.createdAt} className="float-right ml-3 text-muted">
                    {formatDate(e.createdAt, locale, { hour: '2-digit', minute: '2-digit' })}
                  </time>
                </p>
                {e.data !== null && e.data !== undefined && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-muted">{t('auditDetails')}</summary>
                    <pre className="mt-1 overflow-x-auto font-sans text-[13px] whitespace-pre-wrap">
                      {JSON.stringify(e.data, null, 2)}
                    </pre>
                  </details>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <Pager
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        shown={data.items.length}
        basePath="/admin/audit"
        query={filters}
      />
    </>
  );
}

