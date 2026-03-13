import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDisplaySettings, sortTabs } from '../context/DisplaySettingsContext';
import Home from './Home';
import Habits from './Habits';

type LifeTab = 'goals' | 'habits' | 'recipes' | 'bookshelf';

const tabs: { key: LifeTab; label: string }[] = [
  { key: 'goals', label: 'Goals' },
  { key: 'habits', label: 'Habits' },
  { key: 'recipes', label: 'Recipes' },
  { key: 'bookshelf', label: 'Bookshelf' },
];

function Placeholder({ title, description, icon }: { title: string; description: string; icon: string }) {
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <div className="container mx-auto px-4 sm:px-16 pt-16 pb-8">
        <div className="max-w-md mx-auto text-center">
          <div className="text-5xl mb-4">{icon}</div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">{title}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
        </div>
      </div>
    </div>
  );
}

function renderTab(tab: LifeTab) {
  switch (tab) {
    case 'goals': return <Home />;
    case 'habits': return <Habits />;
    case 'recipes': return <Placeholder icon="🍳" title="Recipes" description="Save and organize your favorite recipes. Coming soon." />;
    case 'bookshelf': return <Placeholder icon="📚" title="Bookshelf" description="Track books you're reading, want to read, and have finished. Coming soon." />;
  }
}

export default function Life() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as LifeTab) || 'goals';
  const [activeTab, setActiveTab] = useState<LifeTab>(initialTab);
  const { settings } = useDisplaySettings();
  const sortedTabs = sortTabs(tabs, settings.tabOrder?.lifeTabs ?? [], t => t.key);

  const switchTab = (tab: LifeTab) => {
    setActiveTab(tab);
    setSearchParams(tab === 'goals' ? {} : { tab });
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
