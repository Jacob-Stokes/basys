import { useLeftPanel } from '../context/LeftPanelContext';

export default function LeftPanel() {
  const { isOpen } = useLeftPanel();

  return (
    <div
      className={`fixed top-14 left-0 bottom-14 w-full sm:w-[300px] bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 z-20 flex flex-col shadow-xl transition-transform duration-200 ease-in-out ${
        isOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
      }`}
    >
      {/* Empty for now — content will go here */}
    </div>
  );
}
