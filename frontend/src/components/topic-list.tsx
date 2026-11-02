import { getLocale, getTranslations } from 'next-intl/server';
import { getTopics } from '@/lib/api';
import type { TopicNode } from '@/lib/types';

/*
 * Topic views backed by GET /api/topics. Each one renders at request time and
 * must sit inside <Suspense>. getTopics() is memoised per request, so the
 * stats strip, the contents rail and the section list share one API call.
 */

type Named = { nameEn: string; nameVi: string };

async function load(): Promise<TopicNode[] | null> {
  try {
    return await getTopics();
  } catch {
    return null;
  }
}

const topicAnchor = (topic: { slug: string }) => `topic-${topic.slug}`;
const topicCode = (index: number) => `B${index + 1}`;
// Words on the topic itself plus its subtopics. A word tagged with several
// subtopics is counted once per subtopic; switch to a distinct count from the
// API when words are imported (Phase 1).
const totalWords = (topic: TopicNode) =>
  topic._count.words + topic.children.reduce((sum, child) => sum + child._count.words, 0);

/** One-line totals for the controls strip. */
export async function TopicStats() {
  const [t, topics] = await Promise.all([getTranslations('Home'), load()]);
  if (!topics) return <span className="text-[13px] text-muted">{t('statsUnavailable')}</span>;

  const subtopics = topics.reduce((sum, topic) => sum + topic.children.length, 0);
  const words = topics.reduce((sum, topic) => sum + totalWords(topic), 0);

  return (
    <span className="font-mono text-[13px] font-semibold tabular-nums">
      {t('stats', { topics: topics.length, subtopics, words })}
    </span>
  );
}

/** Contents rail entries for part B (desktop only). */
export async function TopicToc() {
  const [locale, topics] = await Promise.all([getLocale(), load()]);
  if (!topics) return null;
  const name = (x: Named) => (locale === 'vi' ? x.nameVi : x.nameEn);

  return (
    <ol>
      {topics.map((topic, i) => (
        <li key={topic.id}>
          <TocLink
            href={`#${topicAnchor(topic)}`}
            code={topicCode(i)}
            label={name(topic)}
            count={totalWords(topic)}
          />
        </li>
      ))}
    </ol>
  );
}

/** Part B body: one section per top-level topic, subtopics as chips. */
export async function TopicSections() {
  const [t, locale, topics] = await Promise.all([getTranslations('Home'), getLocale(), load()]);

  if (!topics) {
    return (
      <p
        role="alert"
        className="max-w-[74ch] rounded-lg border border-line bg-surface px-3.5 py-3 text-sm text-muted"
      >
        {t('topicsError')}
      </p>
    );
  }

  const name = (x: Named) => (locale === 'vi' ? x.nameVi : x.nameEn);

  return (
    <div>
      {topics.map((topic, i) => (
        <section
          key={topic.id}
          id={topicAnchor(topic)}
          aria-labelledby={`${topicAnchor(topic)}-title`}
          className="scroll-mt-20 border-t border-line py-[22px]"
        >
          <div className="mb-1.5 flex items-baseline gap-3">
            <span className="flex-none font-mono text-xs font-semibold text-accent">
              {topicCode(i)}
            </span>
            <h3
              id={`${topicAnchor(topic)}-title`}
              className="m-0 min-w-0 flex-1 text-lg font-semibold text-balance"
            >
              {topic.icon && (
                <span aria-hidden className="mr-2">
                  {topic.icon}
                </span>
              )}
              {name(topic)}
            </h3>
            <span className="flex-none font-mono text-xs text-muted tabular-nums">
              {t('wordCount', { count: totalWords(topic) })}
            </span>
          </div>
          <p className="mb-2.5 text-sm text-muted">
            {locale === 'vi' && <>{topic.nameEn} · </>}
            {t('subtopicCount', { count: topic.children.length })}
          </p>
          {topic.children.length > 0 && (
            <ul className="flex flex-wrap gap-x-1.5 gap-y-2">
              {topic.children.map((child) => (
                <li
                  key={child.id}
                  className="inline-flex items-baseline gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-sm font-medium"
                >
                  {name(child)}
                  <small className="font-mono text-[11px] text-accent tabular-nums">
                    {child._count.words}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

export function TopicSectionsSkeleton() {
  return (
    <div aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="border-t border-line py-[22px]">
          <div className="h-5 w-1/3 animate-pulse rounded bg-line" />
          <div className="mt-3 h-4 w-1/4 animate-pulse rounded bg-line" />
          <div className="mt-3 flex gap-2">
            <div className="h-7 w-28 animate-pulse rounded-md bg-line" />
            <div className="h-7 w-24 animate-pulse rounded-md bg-line" />
            <div className="h-7 w-32 animate-pulse rounded-md bg-line" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A contents rail row: code · label · trailing count. Shared with the page's static part A. */
export function TocLink({
  href,
  code,
  label,
  count,
}: {
  href: string;
  code: string;
  label: string;
  count?: number | string;
}) {
  return (
    <a
      href={href}
      className="flex items-baseline gap-2 rounded-md px-1.5 py-1 text-[13.5px] leading-[1.4] text-ink no-underline hover:bg-accent-soft"
    >
      <span className="w-[26px] flex-none font-mono text-[11px] text-accent">{code}</span>
      <span className="min-w-0">{label}</span>
      {count !== undefined && (
        <span className="ml-auto pl-1.5 font-mono text-[11px] text-muted tabular-nums">{count}</span>
      )}
    </a>
  );
}
