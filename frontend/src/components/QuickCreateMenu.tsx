import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useModKeySubmit } from '../hooks/useModKeySubmit';

interface QuickCreateMenuProps {
  compact?: boolean; // mobile style
}

const CREATE_OPTIONS = [
  { key: 'task', label: 'Task', icon: 'check', color: 'text-blue-500' },
  { key: 'goal', label: 'Goal', icon: 'target', color: 'text-purple-500' },
  { key: 'habit', label: 'Habit', icon: 'repeat', color: 'text-green-500' },
  { key: 'quit', label: 'Quit Tracker', icon: 'x-circle', color: 'text-red-500' },
  { key: 'project', label: 'Project', icon: 'folder', color: 'text-amber-500' },
] as const;

type CreateKey = typeof CREATE_OPTIONS[number]['key'];

export default function QuickCreateMenu({ compact }: QuickCreateMenuProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState<CreateKey | null>(null);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when inline create opens
  useEffect(() => {
    if (creating) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [creating]);

  // Open via keyboard shortcut (⌥N)
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('basys:quick-create', handler);
    return () => window.removeEventListener('basys:quick-create', handler);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open && !creating) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(null);
        setTitle('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, creating]);

  const handleSelect = (key: CreateKey) => {
    setOpen(false);
    setCreating(key);
    setTitle('');
  };

  const handleSubmit = async () => {
    const trimmed = title.trim();
    if (!trimmed || loading) return;
    setLoading(true);

    try {
      switch (creating) {
        case 'task':
          await api.createTask({ title: trimmed });
          navigate('/tasks');
          break;
        case 'goal':
          await api.createGoal({ title: trimmed });
          navigate('/goals');
          break;
        case 'habit':
          await api.createHabit({ title: trimmed, type: 'habit' });
          navigate('/habits');
          break;
        case 'quit':
          await api.createHabit({
            title: trimmed,
            type: 'quit',
            quit_date: new Date().toISOString().split('T')[0],
          });
          navigate('/habits');
          break;
        case 'project':
          await api.createProject({ title: trimmed, hex_color: '#3b82f6' });
          navigate('/tasks');
          break;
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setCreating(null);
      setTitle('');
    }
  };

  useModKeySubmit(!!creating, handleSubmit, !!title.trim() && !loading);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      setCreating(null);
      setTitle('');
    }
  };

  const labelForCreating = CREATE_OPTIONS.find(o => o.key === creating)?.label || '';

  return (
    <div className="relative" ref={menuRef}>
      {/* Plus button */}
      <button
        onClick={() => {
          if (creating) {
            setCreating(null);
            setTitle('');
          } else {
            setOpen(!open);
          }
        }}
        className={`${compact ? 'p-2' : 'p-1.5'} rounded transition-colors ${
          open || creating
            ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`}
        title="Quick create"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-700 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 z-20 py-1">
            {CREATE_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => handleSelect(opt.key)}
                className="flex items-center gap-2.5 w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
              >
                <span className={opt.color}>
                  <OptionIcon icon={opt.icon} />
                </span>
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Inline create input */}
      {creating && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => { setCreating(null); setTitle(''); }} />
          <div className="absolute right-0 top-full mt-1 w-64 bg-white dark:bg-gray-700 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 z-20 p-3">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
              New {labelForCreating}
            </p>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`${labelForCreating} name...`}
                className="flex-1 text-sm px-2.5 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                disabled={loading}
              />
              <button
                onClick={handleSubmit}
                disabled={!title.trim() || loading}
                className="px-2.5 py-1.5 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function OptionIcon({ icon }: { icon: string }) {
  switch (icon) {
    case 'check':
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'target':
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
        </svg>
      );
    case 'repeat':
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      );
    case 'x-circle':
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'folder':
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      );
    default:
      return null;
  }
}
