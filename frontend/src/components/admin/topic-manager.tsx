'use client';

import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { ApiError, api } from '@/lib/client-api';
import type { AdminTopic, AdminTopicNode } from '@/lib/admin-types';
import { AdminMessage } from './admin-message';
import { useAdminAction } from './use-action';

/** Which form is open: editing a topic, or adding one (top level or under a parent). */
type Editing = { mode: 'edit'; topic: AdminTopic } | { mode: 'new'; parentId: string | null } | null;

/** The topic tree with reorder, edit, add and delete. */
export function TopicManager({ tree }: { tree: AdminTopicNode[] }) {
  const t = useTranslations('Admin');
  const locale = useLocale();
  const { run, pending, error, setError } = useAdminAction();
  const [editing, setEditing] = useState<Editing>(null);
  const name = (x: { nameVi: string; nameEn: string }) => (locale === 'vi' ? x.nameVi : x.nameEn);

  const move = (siblings: AdminTopic[], index: number, by: -1 | 1) => {
    const ids = siblings.map((s) => s.id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    run(() => api('/admin/topics/order', { method: 'PUT', body: { ids } }));
  };

  const remove = (topic: AdminTopic) =>
    run(() => api(`/admin/topics/${topic.id}`, { method: 'DELETE' }), {
      confirm: t('confirmDeleteTopic', { name: name(topic) }),
    });

  const row = (topic: AdminTopic, siblings: AdminTopic[], index: number) => (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <div className="min-w-0 flex-1">
        <span className="font-extrabold">{name(topic)}</span>{' '}
        <span className="text-[13px] text-muted">
          {topic.slug} · {t('topicWords', { count: topic.words })}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <IconButton label={t('moveUp', { name: name(topic) })} disabled={pending || index === 0} onClick={() => move(siblings, index, -1)}>
          <ArrowUp size={18} aria-hidden />
        </IconButton>
        <IconButton
          label={t('moveDown', { name: name(topic) })}
          disabled={pending || index === siblings.length - 1}
          onClick={() => move(siblings, index, 1)}
        >
          <ArrowDown size={18} aria-hidden />
        </IconButton>
        <IconButton label={`${t('edit')}: ${name(topic)}`} onClick={() => setEditing({ mode: 'edit', topic })}>
          <Pencil size={18} aria-hidden />
        </IconButton>
        <IconButton label={`${t('delete')}: ${name(topic)}`} disabled={pending} onClick={() => remove(topic)} danger>
          <Trash2 size={18} aria-hidden />
        </IconButton>
      </div>
    </div>
  );

  const form = (key: string) =>
    editing && (editing.mode === 'edit' ? editing.topic.id : `new:${editing.parentId}`) === key ? (
      <TopicForm
        editing={editing}
        parents={tree}
        onDone={() => {
          setEditing(null);
          setError(null);
        }}
      />
    ) : null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing({ mode: 'new', parentId: null })}>
          <Plus size={18} aria-hidden />
          {t('topicNew')}
        </button>
      </div>
      {form('new:null')}
      <AdminMessage error={error} />
      <ol className="flex flex-col gap-3">
        {tree.map((top, i) => (
          <li key={top.id} className="card px-4 py-2">
            {row(top, tree, i)}
            {form(top.id)}
            {top.children.length > 0 && (
              <ol className="ml-4 border-l-2 border-line pl-4">
                {top.children.map((child, j) => (
                  <li key={child.id} className="border-b border-line last:border-0">
                    {row(child, top.children, j)}
                    {form(child.id)}
                  </li>
                ))}
              </ol>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm my-1"
              onClick={() => setEditing({ mode: 'new', parentId: top.id })}
            >
              <Plus size={16} aria-hidden />
              {t('topicNewSub')}
            </button>
            {form(`new:${top.id}`)}
          </li>
        ))}
      </ol>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`grid size-10 place-items-center rounded-full text-muted hover:bg-sunken disabled:opacity-30 ${danger ? 'hover:text-danger' : 'hover:text-ink'}`}
    >
      {children}
    </button>
  );
}

function TopicForm({ editing, parents, onDone }: { editing: NonNullable<Editing>; parents: AdminTopicNode[]; onDone: () => void }) {
  const t = useTranslations('Admin');
  const locale = useLocale();
  const { run, pending, error, setError } = useAdminAction();
  const topic = editing.mode === 'edit' ? editing.topic : null;
  const parentId = editing.mode === 'edit' ? editing.topic.parentId : editing.parentId;
  const hasChildren = topic ? parents.some((p) => p.id === topic.id && p.children.length > 0) : false;
  const name = (x: { nameVi: string; nameEn: string }) => (locale === 'vi' ? x.nameVi : x.nameEn);
  const prefix = topic ? `t-${topic.id}` : `t-new-${parentId ?? 'top'}`;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? '').trim();
    const body = {
      slug: text('slug'),
      nameEn: text('nameEn'),
      nameVi: text('nameVi'),
      descriptionEn: text('descriptionEn') || null,
      descriptionVi: text('descriptionVi') || null,
      icon: text('icon') || null,
      parentId: text('parentId') || null,
    };
    run(
      async () => {
        try {
          return topic
            ? await api(`/admin/topics/${topic.id}`, { method: 'PATCH', body })
            : await api('/admin/topics', { method: 'POST', body });
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) throw new ApiError(409, t('errorSlugTaken'));
          throw err;
        }
      },
      {
        done: () => {
          onDone();
          return null;
        },
      },
    );
  }

  const field = (key: 'slug' | 'nameEn' | 'nameVi' | 'icon', label: string, value: string | null | undefined, extra = {}) => (
    <div>
      <label htmlFor={`${prefix}-${key}`} className="field-label">
        {label}
      </label>
      <input id={`${prefix}-${key}`} name={key} defaultValue={value ?? ''} className="input" {...extra} />
    </div>
  );

  return (
    <form onSubmit={submit} className="my-3 flex flex-col gap-4 rounded-2xl bg-surface p-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {field('slug', t('fieldSlug'), topic?.slug, { required: true, maxLength: 60, pattern: '[a-z0-9]+(-[a-z0-9]+)*', title: t('slugHelp') })}
        {field('nameEn', t('fieldNameEn'), topic?.nameEn, { required: true, maxLength: 80, lang: 'en' })}
        {field('nameVi', t('fieldNameVi'), topic?.nameVi, { required: true, maxLength: 80, lang: 'vi' })}
      </div>
      <p className="-mt-2 text-[13px] text-muted">{t('slugHelp')}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${prefix}-descriptionEn`} className="field-label">
            {t('fieldDescriptionEn')}
          </label>
          <textarea id={`${prefix}-descriptionEn`} name="descriptionEn" rows={2} maxLength={500} defaultValue={topic?.descriptionEn ?? ''} className="input" lang="en" />
        </div>
        <div>
          <label htmlFor={`${prefix}-descriptionVi`} className="field-label">
            {t('fieldDescriptionVi')}
          </label>
          <textarea id={`${prefix}-descriptionVi`} name="descriptionVi" rows={2} maxLength={500} defaultValue={topic?.descriptionVi ?? ''} className="input" lang="vi" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {field('icon', t('fieldIcon'), topic?.icon, { maxLength: 40 })}
        <div>
          <label htmlFor={`${prefix}-parentId`} className="field-label">
            {t('fieldParent')}
          </label>
          <select id={`${prefix}-parentId`} name="parentId" defaultValue={parentId ?? ''} disabled={hasChildren} className="input">
            <option value="">{t('parentNone')}</option>
            {parents
              .filter((p) => p.id !== topic?.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {name(p)}
                </option>
              ))}
          </select>
          {hasChildren && <p className="mt-1 text-[13px] text-muted">{t('errorHasChildren')}</p>}
        </div>
      </div>
      <AdminMessage error={error} />
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? t('saving') : t('save')}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setError(null);
            onDone();
          }}
        >
          {t('cancel')}
        </button>
      </div>
    </form>
  );
}
