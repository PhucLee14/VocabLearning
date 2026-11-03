import type { CefrLevel } from '@/lib/types';

export function LevelPill({ level }: { level: CefrLevel }) {
  return <span className="pill">{level}</span>;
}
