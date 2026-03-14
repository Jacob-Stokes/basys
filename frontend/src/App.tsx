import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Timer from './pages/Timer';
import Life from './pages/Life';
import Tasks from './pages/Tasks';
import Admin from './pages/Admin';
import Command from './pages/Command';
import GoalGrid from './pages/GoalGrid';
import Login from './pages/Login';
import Agents from './pages/Agents';
import SharedGoalView from './pages/SharedGoalView';
import SprintBoard from './pages/SprintBoard';
import Sprints from './pages/Sprints';
import NavBar from './components/NavBar';
import TimerFooter from './components/TimerFooter';
import PomodoroWidget from './components/PomodoroWidget';
import ChatSidebar from './components/chat/ChatSidebar';
import LeftPanel from './components/LeftPanel';
import CornerWidget from './components/CornerWidget';
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal';
import { ChatSidebarProvider, useChatSidebarSafe } from './context/ChatSidebarContext';
import { LeftPanelProvider, useLeftPanelSafe } from './context/LeftPanelContext';
import { useDisplaySettings } from './context/DisplaySettingsContext';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { usePanelSwap } from './hooks/usePanelSwap';
import { api } from './api/client';

// Protected Route Component
function ProtectedRoute({ children }: { children?: React.ReactNode }) {
  const { t } = useTranslation();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        await api.getMe();
        setIsAuthenticated(true);
      } catch {
        setIsAuthenticated(false);
      }
    };

    checkAuth();
  }, []);

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">{t('app.loading')}</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children || <Outlet />}</>;
}

// Layout with persistent nav bar and timer footer
function AuthenticatedLayout() {
  return (
    <ProtectedRoute>
      <LeftPanelProvider>
        <ChatSidebarProvider>
          <MainContent />
        </ChatSidebarProvider>
      </LeftPanelProvider>
    </ProtectedRoute>
  );
}

function MainContent() {
  const sidebar = useChatSidebarSafe();
  const sidebarOpen = sidebar?.isOpen ?? false;
  const leftPanel = useLeftPanelSafe();
  const leftPanelOpen = leftPanel?.isOpen ?? false;
  const swapped = usePanelSwap();
  const { settings } = useDisplaySettings();
  const pomoPos = settings.pomodoroPosition || 'footer';

  useKeyboardShortcuts();

  // When swapped: left panel is on the right, chat sidebar is on the left
  const chatMargin = sidebarOpen ? (swapped ? 'sm:ml-[300px]' : 'sm:mr-[300px]') : '';
  const leftMargin = leftPanelOpen ? (swapped ? 'sm:mr-[300px]' : 'sm:ml-[300px]') : '';

  // Corner side: widget goes on left-panel side (left by default, right if swapped)
  const cornerSide = swapped ? 'right-0' : 'left-0';
  const cornerBorder = swapped ? 'border-l' : 'border-r';

  return (
    <>
      <div
        className={`transition-[margin] duration-200 ease-in-out ${chatMargin} ${leftMargin}`}
      >
        <NavBar />
        <div className={pomoPos === 'footer' ? 'pb-14' : ''}>
          <Outlet />
        </div>
        {/* Footer: show on desktop when selected, always show on mobile as fallback */}
        {pomoPos === 'footer' ? (
          <TimerFooter />
        ) : (
          <div className="sm:hidden">
            <TimerFooter />
          </div>
        )}
      </div>
      <LeftPanel />
      <ChatSidebar />
      <KeyboardShortcutsModal />

      {/* Top-right corner widget — associated with ChatSidebar */}
      {sidebarOpen && (
        <div className={`fixed top-0 ${swapped ? 'left-0' : 'right-0'} w-full sm:w-[300px] h-14 hidden sm:block z-30 bg-white dark:bg-gray-800`}>
          <CornerWidget corner={swapped ? 'top-left' : 'top-right'} />
        </div>
      )}

      {/* Pomodoro corner widgets — desktop only */}
      {pomoPos === 'corner-top' && (
        <div className={`fixed top-0 ${cornerSide} w-[300px] h-14 hidden sm:block z-30`}>
          <PomodoroWidget variant="small" />
        </div>
      )}
      {pomoPos === 'corner-bottom-sm' && (
        <div className={`fixed bottom-0 ${cornerSide} w-[300px] h-14 hidden sm:block z-30`}>
          <PomodoroWidget variant="small" />
        </div>
      )}
      {pomoPos === 'corner-bottom-lg' && (
        <div className={`fixed bottom-0 ${cornerSide} w-[300px] h-[20vh] min-h-[180px] hidden sm:block z-30 ${cornerBorder} border-gray-200 dark:border-gray-700`}>
          <PomodoroWidget variant="large" />
        </div>
      )}
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/agents" element={<Agents />} />
        <Route path="/share/:token" element={<SharedGoalView />} />

        {/* Authenticated routes with persistent nav */}
        <Route element={<AuthenticatedLayout />}>
          <Route path="/" element={<Tasks />} />
          <Route path="/tasks" element={<Navigate to="/" replace />} />
          <Route path="/projects" element={<Navigate to="/sprints" replace />} />
          <Route path="/timer" element={<Timer />} />
          <Route path="/life" element={<Life />} />
          <Route path="/goals" element={<Navigate to="/life?tab=goals" replace />} />
          <Route path="/habits" element={<Navigate to="/life?tab=habits" replace />} />
          <Route path="/phonebook" element={<Navigate to="/life?tab=phonebook" replace />} />
          <Route path="/journal" element={<Navigate to="/life" replace />} />
          <Route path="/command" element={<Command />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/terminal" element={<Navigate to="/admin" replace />} />
          <Route path="/settings" element={<Navigate to="/admin?tab=settings" replace />} />
          <Route path="/goal/:goalId" element={<GoalGrid />} />
          <Route path="/sprints" element={<Sprints />} />
          <Route path="/sprints/:sprintId" element={<SprintBoard />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
