import { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { WIKI_SECTIONS, WIKI_PAGES } from '../data/wikiContent';

export default function Wiki() {
  const [selectedPageId, setSelectedPageId] = useState('welcome');
  const [search, setSearch] = useState('');

  const filteredPages = useMemo(() => {
    if (!search.trim()) return WIKI_PAGES;
    const q = search.toLowerCase();
    return WIKI_PAGES.filter(
      (p) => p.title.toLowerCase().includes(q) || p.section.toLowerCase().includes(q)
    );
  }, [search]);

  const selectedPage = WIKI_PAGES.find((p) => p.id === selectedPageId) ?? WIKI_PAGES[0];

  // Group filtered pages by section
  const pagesBySection = useMemo(() => {
    const map = new Map<string, typeof WIKI_PAGES>();
    for (const section of WIKI_SECTIONS) {
      const pages = filteredPages.filter((p) => p.section === section);
      if (pages.length > 0) map.set(section, pages);
    }
    return map;
  }, [filteredPages]);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <div className="container mx-auto px-4 sm:px-16 py-8">
        <div className="flex gap-6" style={{ minHeight: 'calc(100vh - 180px)' }}>
          {/* Left sidebar — navigation */}
          <div className="w-2/5 flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
            {/* Search */}
            <div className="p-3 border-b border-gray-200 dark:border-gray-700">
              <input
                type="text"
                placeholder="Search pages..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Section list */}
            <div className="flex-1 overflow-y-auto">
              {WIKI_SECTIONS.map((section) => {
                const pages = pagesBySection.get(section);
                if (!pages) return null;
                return (
                  <div key={section}>
                    <div className="px-4 py-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                      {section}
                    </div>
                    {pages.map((page) => (
                      <button
                        key={page.id}
                        onClick={() => setSelectedPageId(page.id)}
                        className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                          selectedPageId === page.id
                            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-l-2 border-l-blue-500'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/30'
                        }`}
                      >
                        {page.title}
                      </button>
                    ))}
                  </div>
                );
              })}
              {pagesBySection.size === 0 && (
                <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                  No pages match your search.
                </div>
              )}
            </div>
          </div>

          {/* Right column — content */}
          <div className="w-3/5 flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
            <div className="flex-1 overflow-y-auto p-8">
              <div className="wiki-prose max-w-none text-gray-900 dark:text-gray-100">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ children }) => (
                      <h1 className="text-2xl font-bold mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
                        {children}
                      </h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-xl font-semibold mt-8 mb-3 text-gray-900 dark:text-gray-100">
                        {children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-lg font-semibold mt-6 mb-2 text-gray-800 dark:text-gray-200">
                        {children}
                      </h3>
                    ),
                    p: ({ children }) => (
                      <p className="mb-4 leading-relaxed text-gray-700 dark:text-gray-300">
                        {children}
                      </p>
                    ),
                    ul: ({ children }) => (
                      <ul className="mb-4 pl-6 space-y-1 list-disc text-gray-700 dark:text-gray-300">
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="mb-4 pl-6 space-y-1 list-decimal text-gray-700 dark:text-gray-300">
                        {children}
                      </ol>
                    ),
                    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                    a: ({ href, children }) => (
                      <a
                        href={href}
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {children}
                      </a>
                    ),
                    code: ({ className, children, ...props }) => {
                      const isInline = !className;
                      if (isInline) {
                        return (
                          <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-sm font-mono text-pink-600 dark:text-pink-400">
                            {children}
                          </code>
                        );
                      }
                      return (
                        <code className={`${className ?? ''} text-sm`} {...props}>
                          {children}
                        </code>
                      );
                    },
                    pre: ({ children }) => (
                      <pre className="mb-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 overflow-x-auto text-sm font-mono">
                        {children}
                      </pre>
                    ),
                    table: ({ children }) => (
                      <div className="mb-4 overflow-x-auto">
                        <table className="min-w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                          {children}
                        </table>
                      </div>
                    ),
                    thead: ({ children }) => (
                      <thead className="bg-gray-50 dark:bg-gray-900">{children}</thead>
                    ),
                    th: ({ children }) => (
                      <th className="px-4 py-2 text-left font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                        {children}
                      </th>
                    ),
                    td: ({ children }) => (
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                        {children}
                      </td>
                    ),
                    blockquote: ({ children }) => (
                      <blockquote className="mb-4 pl-4 border-l-4 border-blue-300 dark:border-blue-600 text-gray-600 dark:text-gray-400 italic">
                        {children}
                      </blockquote>
                    ),
                    hr: () => <hr className="my-6 border-gray-200 dark:border-gray-700" />,
                    strong: ({ children }) => (
                      <strong className="font-semibold text-gray-900 dark:text-gray-100">
                        {children}
                      </strong>
                    ),
                  }}
                >
                  {selectedPage.content}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
