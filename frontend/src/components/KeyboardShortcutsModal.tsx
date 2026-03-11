import { useState, useEffect } from 'react';

const IS_MAC = navigator.platform?.toUpperCase().includes('MAC') ?? false;
const MOD_LABEL = IS_MAC ? '⌥' : 'Alt+';

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string; description: string }[];
}

const GROUPS: ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: `${MOD_LABEL}1`, description: 'Todo' },
      { keys: `${MOD_LABEL}2`, description: 'Projects' },
      { keys: `${MOD_LABEL}3`, description: 'Pomo' },
      { keys: `${MOD_LABEL}4`, description: 'Goals' },
      { keys: `${MOD_LABEL}5`, description: 'Habits' },
      { keys: `${MOD_LABEL}6`, description: 'Journal' },
      { keys: `${MOD_LABEL}7`, description: 'Phonebook' },
      { keys: `${MOD_LABEL}8`, description: 'Terminal' },
      { keys: `${MOD_LABEL},`, description: 'Settings' },
    ],
  },
  {
    title: 'Panels',
    shortcuts: [
      { keys: `${MOD_LABEL}[`, description: 'Toggle left panel' },
      { keys: `${MOD_LABEL}]`, description: 'Toggle chat sidebar' },
    ],
  },
  {
    title: 'Quick Actions',
    shortcuts: [
      { keys: `${MOD_LABEL}N`, description: 'Quick create' },
      { keys: `${MOD_LABEL}/`, description: 'Show this help' },
    ],
  },
  {
    title: 'Timer',
    shortcuts: [
      { keys: `${MOD_LABEL}S`, description: 'Start / stop timer' },
      { keys: `${MOD_LABEL}R`, description: 'Reset timer' },
    ],
  },
];

export default function KeyboardShortcutsModal() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onShow = () => setShow(true);
    window.addEventListener('basys:show-shortcuts', onShow);
    return () => window.removeEventListener('basys:show-shortcuts', onShow);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShow(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show]);

  if (!show) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-50"
        onClick={() => setShow(false)}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg pointer-events-auto max-h-[80vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Keyboard Shortcuts
            </h2>
            <button
              onClick={() => setShow(false)}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-4 space-y-5">
            {GROUPS.map((group) => (
              <div key={group.title}>
                <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                  {group.title}
                  {group.title === 'Timer' && (
                    <span className="normal-case font-normal ml-1">(on Timer page)</span>
                  )}
                </h3>
                <div className="space-y-1.5">
                  {group.shortcuts.map((s) => (
                    <div
                      key={s.keys}
                      className="flex items-center justify-between py-1"
                    >
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {s.description}
                      </span>
                      <kbd className="inline-flex items-center gap-0.5 px-2 py-0.5 text-xs font-mono font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded">
                        {s.keys}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer hint */}
          <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
              Shortcuts are disabled while typing in text fields
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
