import { TYPE_META, type SearchResult } from '../hooks/useUniversalSearch';

interface SearchResultListProps {
  results: Record<string, SearchResult[]>;
  loading: boolean;
  error?: string | null;
  query: string;
  hasResults: boolean;
  selectedIds?: Set<string>;
  activeIndex?: number;
  onSelect: (item: SearchResult) => void;
  onHover?: (index: number) => void;
  resultsRef?: React.Ref<HTMLDivElement>;
}

export default function SearchResultList({
  results,
  loading,
  error,
  query,
  hasResults,
  selectedIds,
  activeIndex,
  onSelect,
  onHover,
  resultsRef,
}: SearchResultListProps) {
  let flatIndex = 0;

  return (
    <div ref={resultsRef}>
      {loading && <div className="px-4 py-3 text-xs text-gray-400">Searching...</div>}
      {error && <div className="px-4 py-3 text-xs text-red-500">Error: {error}</div>}
      {!loading && !error && query && !hasResults && (
        <div className="px-4 py-3 text-xs text-gray-400">No results for &ldquo;{query}&rdquo;</div>
      )}
      {!loading && Object.entries(results).map(([type, items]) => (
        <div key={type}>
          <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide bg-gray-50 dark:bg-gray-900/50 sticky top-0">
            {TYPE_META[type]?.icon} {TYPE_META[type]?.label}
          </div>
          {items.map(item => {
            const idx = flatIndex++;
            const isSelected = selectedIds?.has(item.id);
            const isActive = activeIndex !== undefined && idx === activeIndex;
            return (
              <div
                key={item.id}
                data-index={idx}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors text-sm ${
                  isSelected
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                    : isActive
                      ? 'bg-blue-50 dark:bg-blue-900/30'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-900 dark:text-gray-100'
                }`}
                onClick={() => !isSelected && onSelect(item)}
                onMouseEnter={() => onHover?.(idx)}
              >
                {item.color && (
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                )}
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
                {!isSelected && isActive && (
                  <svg className="w-3.5 h-3.5 flex-shrink-0 opacity-50" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
