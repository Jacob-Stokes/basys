import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDisplaySettings, sortTabs } from '../context/DisplaySettingsContext';

type CommandTab = 'actions' | 'monitoring' | 'agents';

const tabs: { key: CommandTab; label: string }[] = [
  { key: 'actions', label: 'Actions' },
  { key: 'monitoring', label: 'Monitoring' },
  { key: 'agents', label: 'Agents' },
];

function Placeholder({ title, description, icon }: { title: string; description: string; icon: string }) {
  return (
    <div className="container mx-auto px-4 sm:px-16 pt-16 pb-8">
      <div className="max-w-md mx-auto text-center">
        <div className="text-5xl mb-4">{icon}</div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">{title}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
      </div>
    </div>
  );
}

function renderTab(tab: CommandTab) {
  switch (tab) {
    case 'actions':
      return <Placeholder icon="⚡" title="Actions" description="Automations, triggers, and scheduled actions. Coming soon." />;
    case 'monitoring':
      return <Placeholder icon="📊" title="Monitoring" description="System health, metrics, and activity logs. Coming soon." />;
    case 'agents':
      return <Placeholder icon="🤖" title="Agents" description="AI agent configuration and management. Coming soon." />;
  }
}

export default function Command() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as CommandTab) || 'actions';
  const [activeTab, setActiveTab] = useState<CommandTab>(initialTab);
  const { settings } = useDisplaySettings();
  const sortedTabs = sortTabs(tabs, settings.tabOrder?.commandTabs ?? [], t => t.key);

  const switchTab = (tab: CommandTab) => {
    setActiveTab(tab);
    setSearchParams(tab === 'actions' ? {} : { tab });
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
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
        {renderTab(activeTab)}
      </div>
    </>
  );
}
