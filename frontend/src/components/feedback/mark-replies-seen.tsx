'use client';

import { useEffect } from 'react';
import { api } from '@/lib/client-api';

/**
 * Marks the learner's replies as read once the page has shown them. The page
 * keeps its "New" labels until the next visit; the menu's count clears on the
 * next navigation.
 */
export function MarkRepliesSeen() {
  useEffect(() => {
    api('/feedback/mine/seen', { method: 'POST' }).catch(() => {});
  }, []);
  return null;
}
