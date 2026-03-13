import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDisplaySettings, sortTabs } from '../context/DisplaySettingsContext';
import Terminal from './Terminal';
import Settings from './Settings';

type AdminTab = 'terminal' | 'settings' | 'wiki';

const tabs: { key: AdminTab; label: string }[] = [
  { key: 'terminal', label: 'Terminal' },
  { key: 'settings', label: 'Settings' },
  { key: 'wiki', label: 'Wiki' },
];

function WikiPlaceholder() {
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <div className="container mx-auto px-4 sm:px-16 pt-16 pb-8">
        <div className="max-w-md mx-auto text-center">
          <div className="text-5xl mb-4">📖</div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Wiki</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Documentation for Thesys — how things work, keyboard shortcuts, data model, and more. Coming soon.
          </p>
        </div>
      </div>
    </div>
  );
}

function renderTab(tab: AdminTab) {
  switch (tab) {
    case 'terminal': return <Terminal />;
    case 'settings': return <Settings />;
    case 'wiki': return <WikiPlaceholder />;
  }
}

export default function Admin() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as AdminTab) || 'terminal';
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);
  const { settings } = useDisplaySettings();
  const sortedTabs = sortTabs(tabs, settings.tabOrder?.adminTabs ?? [], t => t.key);

  const switchTab = (tab: AdminTab) => {
    setActiveTab(tab);
    setSearchParams(tab === 'terminal' ? {} : { tab });
  };

  return (
    <>
      {/* Subtab bar */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-4 sm:px-16 flex items-center gap-0.5 h-9 overflow-x-auto">
          {sortedTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => switchTab(tab.key)}
              className={`flex items-center px-3 h-full text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-500 text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-700/50'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/30'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {renderTab(activeTab)}
    </>
  );
}
