import { useState } from 'react';
import { useLeftPanel } from '../context/LeftPanelContext';
import QuickNotes from './QuickNotes';

type PanelTab = 'tab1' | 'tab2' | 'tab3';

const TABS: { id: PanelTab; label: string }[] = [
  { id: 'tab1', label: 'Notes' },
  { id: 'tab2', label: 'Tab 2' },
  { id: 'tab3', label: 'Tab 3' },
];


function Tab2() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-3">
      <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
        <svg className="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
        </svg>
      </div>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Panel App 2</p>
      <p className="text-xs text-gray-400 dark:text-gray-500">Coming soon</p>
    </div>
  );
}

function Tab3() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-3">
      <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
        <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
        </svg>
      </div>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Panel App 3</p>
      <p className="text-xs text-gray-400 dark:text-gray-500">Coming soon</p>
    </div>
  );
}

export default function LeftPanel() {
  const { isOpen, close } = useLeftPanel();
  const [activeTab, setActiveTab] = useState<PanelTab>('tab1');

  return (
    <div
      className={`fixed top-14 left-0 bottom-14 w-full sm:w-[300px] bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 z-20 flex flex-col shadow-xl transition-transform duration-200 ease-in-out ${
        isOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
      }`}
    >
      {/* Header — mirrors ChatSidebar style */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Side Panel</span>
        <button
          onClick={close}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
          title="Close panel"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 shrink-0">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'tab1' && <QuickNotes />}
        {activeTab === 'tab2' && <Tab2 />}
        {activeTab === 'tab3' && <Tab3 />}
      </div>
    </div>
  );
}
