import { useState, useRef, useCallback } from 'react';
import { api } from '../api/client';

export const TYPE_META: Record<string, { icon: string; label: string }> = {
  project: { icon: '📁', label: 'Projects' },
  sprint:  { icon: '🔄', label: 'Sprints' },
  task:    { icon: '☐', label: 'Tasks' },
  goal:    { icon: '🎯', label: 'Goals' },
  subgoal: { icon: '📌', label: 'Subgoals' },
  habit:   { icon: '✅', label: 'Habits' },
  contact: { icon: '👤', label: 'Contacts' },
};

export interface SearchResult {
  id: string;
  title: string;
  type: string;
  color?: string;
  parentInfo?: string;
  done?: number;
  goalId?: string;
  projectId?: string;
}

export function useUniversalSearch(debounceMs = 250, typeFilter?: string[]) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Record<string, SearchResult[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const types = typeFilter || Object.keys(TYPE_META);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults({}); setError(null); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await api.universalSearch(q);
      const mapped: Record<string, SearchResult[]> = {};
      for (const type of types) {
        const items = data[type + 's'] || data[type] || [];
        if (items.length > 0) {
          mapped[type] = items.map((item: any) => ({
            id: item.id,
            title: item.title,
            type,
            color: item.hex_color || item.project_color,
            parentInfo: item.project_title || item.goal_title || undefined,
            done: item.done,
            goalId: item.goal_id,
            projectId: item.project_id,
          }));
        }
      }
      setResults(mapped);
    } catch (err: any) {
      console.error('Search error:', err);
      setError(err?.message || String(err));
      setResults({});
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), debounceMs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doSearch, debounceMs]);

  const hasResults = Object.values(results).some(arr => arr.length > 0);
  const flatResults = Object.entries(results).flatMap(([, items]) => items);

  return {
    query,
    setQuery,
    results,
    loading,
    error,
    hasResults,
    flatResults,
    handleQueryChange,
    doSearch,
  };
}
