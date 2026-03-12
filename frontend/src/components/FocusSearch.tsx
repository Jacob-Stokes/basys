import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useTimer, type FocusItem } from '../context/TimerContext';

const TYPE_META: Record<string, { icon: string; label: string }> = {
  project: { icon: '📁', label: 'Projects' },
  sprint: { icon: '🔄', label: 'Sprints' },
  task: { icon: '☐', label: 'Tasks' },
  goal: { icon: '🎯', label: 'Goals' },
  subgoal: { icon: '📌', label: 'Subgoals' },
  habit: { icon: '✅', label: 'Habits' },
};

const EXPANDABLE = new Set(['project', 'sprint', 'goal']);

interface SearchResult {
  id: string;
  title: string;
  type: string;
  color?: string;
  parentInfo?: string;
  done?: number;
}

interface ExpandedChildren {
  [parentKey: string]: { loading: boolean; items: SearchResult[] };
}

export default function FocusSearch({ onClose }: { onClose: () => void }) {
  const { addFocusItem, focusItems } = useTimer();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Record<string, SearchResult[]>>({});
  const [expanded, setExpanded] = useState<ExpandedChildren>({});
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults({}); return; }
    setLoading(true);
    try {
      const data = await api.universalSearch(q);
      const mapped: Record<string, SearchResult[]> = {};
      for (const type of Object.keys(TYPE_META)) {
        const items = data[type + 's'] || data[type] || [];
        if (items.length > 0) {
          mapped[type] = items.map((item: any) => ({
            id: item.id,
            title: item.title,
            type,
            color: item.hex_color || item.project_color,
            parentInfo: item.project_title || item.goal_title || undefined,
            done: item.done,
          }));
        }
      }
      setResults(mapped);
    } catch {
      setResults({});
    }
    setLoading(false);
  }, []);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 250);
  };

  const handleExpand = async (type: string, id: string) => {
    const key = `${type}:${id}`;
    if (expanded[key]) {
      // Toggle collapse
      setExpanded(prev => { const next = { ...prev }; delete next[key]; return next; });
      return;
    }
    setExpanded(prev => ({ ...prev, [key]: { loading: true, items: [] } }));
    try {
      const children = await api.searchChildren(type, id);
      setExpanded(prev => ({
        ...prev,
        [key]: {
          loading: false,
          items: children.map((c: any) => ({
            id: c.id,
            title: c.title,
            type: c.entity_type || type,
            done: c.done,
          })),
        },
      }));
    } catch {
      setExpanded(prev => ({ ...prev, [key]: { loading: false, items: [] } }));
    }
  };

  const handleSelect = (item: SearchResult) => {
    const focus: FocusItem = {
      id: item.id,
      type: item.type as FocusItem['type'],
      title: item.title,
      color: item.color,
      parentInfo: item.parentInfo,
    };
    addFocusItem(focus);
  };

  const alreadySelected = new Set(focusItems.map(f => f.id));
  const hasResults = Object.values(results).some(arr => arr.length > 0);

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 mx-4 sm:mx-16">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl max-w-lg mx-auto overflow-hidden">
        {/* Search input */}
        <div className="p-3 border-b border-gray-100 dark:border-gray-700">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            placeholder="Search projects, tasks, goals, habits..."
            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto">
          {loading && <div className="px-4 py-3 text-xs text-gray-400">Searching...</div>}
          {!loading && query && !hasResults && (
            <div className="px-4 py-3 text-xs text-gray-400">No results for "{query}"</div>
          )}
          {!loading && Object.entries(results).map(([type, items]) => (
            <div key={type}>
              <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide bg-gray-50 dark:bg-gray-900/50 sticky top-0">
                {TYPE_META[type]?.icon} {TYPE_META[type]?.label}
              </div>
              {items.map(item => {
                const isSelected = alreadySelected.has(item.id);
                const canExpand = EXPANDABLE.has(type);
                const expandKey = `${type}:${item.id}`;
                const isExpanded = !!expanded[expandKey];
                return (
                  <div key={item.id}>
                    <div
                      className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-900 dark:text-gray-100'
                      }`}
                      onClick={() => !isSelected && handleSelect(item)}
                    >
                      {canExpand && (
                        <button
                          onClick={e => { e.stopPropagation(); handleExpand(type, item.id); }}
                          className={`p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        >
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M6 4l8 6-8 6V4z" /></svg>
                        </button>
                      )}
                      {!canExpand && <span className="w-4" />}
                      {item.color && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />}
                      <span className={`text-sm flex-1 truncate ${item.done ? 'line-through opacity-50' : ''}`}>
                        {item.title}
                      </span>
                      {item.parentInfo && (
                        <span className="text-[10px] text-gray-400 truncate max-w-[100px]">{item.parentInfo}</span>
                      )}
                      {isSelected && (
                        <svg className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    {/* Expanded children */}
                    {isExpanded && expanded[expandKey] && (
                      <div className="bg-gray-50/50 dark:bg-gray-900/30">
                        {expanded[expandKey].loading ? (
                          <div className="pl-10 pr-3 py-2 text-[10px] text-gray-400">Loading...</div>
                        ) : expanded[expandKey].items.length === 0 ? (
                          <div className="pl-10 pr-3 py-2 text-[10px] text-gray-400">No items</div>
                        ) : (
                          expanded[expandKey].items.map(child => {
                            const childSelected = alreadySelected.has(child.id);
                            const childCanExpand = EXPANDABLE.has(child.type);
                            const childExpandKey = `${child.type}:${child.id}`;
                            const childIsExpanded = !!expanded[childExpandKey];
                            return (
                              <div key={child.id}>
                                <div
                                  className={`flex items-center gap-2 pl-8 pr-3 py-1.5 cursor-pointer transition-colors ${
                                    childSelected
                                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                                      : 'hover:bg-gray-100 dark:hover:bg-gray-700/30 text-gray-700 dark:text-gray-300'
                                  }`}
                                  onClick={() => !childSelected && handleSelect(child)}
                                >
                                  {childCanExpand ? (
                                    <button
                                      onClick={e => { e.stopPropagation(); handleExpand(child.type, child.id); }}
                                      className={`p-0.5 text-gray-400 hover:text-gray-600 transition-transform ${childIsExpanded ? 'rotate-90' : ''}`}
                                    >
                                      <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path d="M6 4l8 6-8 6V4z" /></svg>
                                    </button>
                                  ) : (
                                    <span className="w-3.5" />
                                  )}
                                  <span className={`text-xs flex-1 truncate ${child.done ? 'line-through opacity-50' : ''}`}>
                                    {child.title}
                                  </span>
                                  {childSelected && (
                                    <svg className="w-3 h-3 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                  )}
                                </div>
                                {/* Third level children */}
                                {childIsExpanded && expanded[childExpandKey] && (
                                  <div>
                                    {expanded[childExpandKey].loading ? (
                                      <div className="pl-14 pr-3 py-1.5 text-[10px] text-gray-400">Loading...</div>
                                    ) : expanded[childExpandKey].items.map(grandchild => {
                                      const gcSelected = alreadySelected.has(grandchild.id);
                                      return (
                                        <div
                                          key={grandchild.id}
                                          className={`flex items-center gap-2 pl-14 pr-3 py-1.5 cursor-pointer transition-colors ${
                                            gcSelected
                                              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600'
                                              : 'hover:bg-gray-100 dark:hover:bg-gray-700/30 text-gray-600 dark:text-gray-400'
                                          }`}
                                          onClick={() => !gcSelected && handleSelect(grandchild)}
                                        >
                                          <span className="w-3.5" />
                                          <span className={`text-[11px] flex-1 truncate ${grandchild.done ? 'line-through opacity-50' : ''}`}>
                                            {grandchild.title}
                                          </span>
                                          {gcSelected && (
                                            <svg className="w-3 h-3 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {/* Backdrop */}
      <div className="fixed inset-0 -z-10" onClick={onClose} />
    </div>
  );
}
