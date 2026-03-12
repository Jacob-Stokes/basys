import { useTimer, type FocusItem } from '../context/TimerContext';

interface Props {
  focusItems: FocusItem[];
  size?: 'sm' | 'xs';
  className?: string;
}

export default function StartPomoButton({ focusItems, size = 'xs', className = '' }: Props) {
  const { startWithFocus, running } = useTimer();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (running) return;
    startWithFocus(focusItems);
  };

  const sizeClasses = size === 'sm' ? 'w-5 h-5' : 'w-4 h-4';

  return (
    <button
      onClick={handleClick}
      disabled={running}
      className={`text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 transition-colors ${running ? 'opacity-30 cursor-not-allowed' : ''} ${className}`}
      title={running ? 'Timer already running' : `Start pomodoro${focusItems.length > 0 ? ` — ${focusItems.map(f => f.title).join(', ')}` : ''}`}
    >
      <svg className={sizeClasses} viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="12" cy="4.5" r="1.5" />
        <path d="M12 7v5l-2 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  );
}
