import { useState, useEffect } from 'react';
import { api } from '../api/client';

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function PomoStats({ targetType, targetId }: { targetType: string; targetId: string }) {
  const [stats, setStats] = useState<{ pomo_count: number; total_minutes: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getPomoStats(targetType, targetId).then(data => {
      if (!cancelled) setStats(data);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [targetType, targetId]);

  if (!stats || stats.pomo_count === 0) return null;

  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500" title={`${stats.pomo_count} pomodoros · ${formatDuration(stats.total_minutes)}`}>
      <span>🍅</span>
      <span>{stats.pomo_count}</span>
      <span>·</span>
      <span>{formatDuration(stats.total_minutes)}</span>
    </span>
  );
}
