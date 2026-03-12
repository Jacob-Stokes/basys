import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUniversalSearch, type SearchResult } from '../hooks/useUniversalSearch';
import SearchResultList from './SearchResultList';

export default function GlobalSearch({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { query, results, loading, hasResults, flatResults, handleQueryChange } = useUniversalSearch(200);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Reset active index when results change
  useEffect(() => { setActiveIndex(0); }, [results]);

  const handleSelect = (item: SearchResult) => {
    onClose();
    switch (item.type) {
      case 'project': {
        const fire = () => window.dispatchEvent(new CustomEvent('thesys:open-project', { detail: { projectId: item.id } }));
        if (location.pathname === '/sprints') { fire(); } else { navigate('/sprints'); setTimeout(fire, 50); }
        break;
      }
      case 'sprint': {
        const fire = () => window.dispatchEvent(new CustomEvent('thesys:open-sprint', { detail: { sprintId: item.id, projectId: item.projectId } }));
        if (location.pathname === '/sprints') { fire(); } else { navigate('/sprints'); setTimeout(fire, 50); }
        break;
      }
      case 'task': {
        if (item.projectId) {
          const fire = () => window.dispatchEvent(new CustomEvent('thesys:open-project', { detail: { projectId: item.projectId } }));
          if (location.pathname === '/sprints') { fire(); } else { navigate('/sprints'); setTimeout(fire, 50); }
        } else { navigate('/'); }
        break;
      }
      case 'goal': navigate(`/goal/${item.id}`); break;
      case 'subgoal': navigate(`/goal/${item.goalId || ''}`); break;
      case 'habit': navigate('/life?tab=habits'); break;
      case 'contact': navigate('/phonebook'); break;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, flatResults.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && flatResults[activeIndex]) { e.preventDefault(); handleSelect(flatResults[activeIndex]); }
  };

  useEffect(() => {
    const el = resultsRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search projects, tasks, goals, habits..."
            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none"
          />
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-gray-400 bg-gray-100 dark:bg-gray-700 rounded">ESC</kbd>
        </div>

        <div className="max-h-80 overflow-y-auto">
          <SearchResultList
            results={results}
            loading={loading}
            query={query}
            hasResults={hasResults}
            activeIndex={activeIndex}
            onSelect={handleSelect}
            onHover={setActiveIndex}
            resultsRef={resultsRef}
          />
        </div>

        {!loading && hasResults && (
          <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700 flex items-center gap-3 text-[10px] text-gray-400">
            <span><kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded font-mono">↑↓</kbd> navigate</span>
            <span><kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded font-mono">↵</kbd> open</span>
            <span><kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded font-mono">esc</kbd> close</span>
          </div>
        )}
      </div>
    </div>
  );
}
