import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Timer from './pages/Timer';
import Life from './pages/Life';
import Tasks from './pages/Tasks';
import Phonebook from './pages/Phonebook';
import Journal from './pages/Journal';
import Terminal from './pages/Terminal';
import GoalGrid from './pages/GoalGrid';
import Login from './pages/Login';
import Settings from './pages/Settings';
import Agents from './pages/Agents';
import SharedGoalView from './pages/SharedGoalView';
import SprintBoard from './pages/SprintBoard';
import Sprints from './pages/Sprints';
import NavBar from './components/NavBar';
import TimerFooter from './components/TimerFooter';
import ChatSidebar from './components/chat/ChatSidebar';
import PixelMan from './components/chat/PixelMan';
import LeftPanel from './components/LeftPanel';
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal';
import { ChatSidebarProvider, useChatSidebarSafe } from './context/ChatSidebarContext';
import { LeftPanelProvider, useLeftPanelSafe } from './context/LeftPanelContext';
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
  const agentState = sidebar?.agentState ?? 'idle';
  const leftPanel = useLeftPanelSafe();
  const leftPanelOpen = leftPanel?.isOpen ?? false;
  const swapped = usePanelSwap();

  useKeyboardShortcuts();

  // When swapped: left panel is on the right, chat sidebar is on the left
  const chatMargin = sidebarOpen ? (swapped ? 'sm:ml-[300px]' : 'sm:mr-[300px]') : '';
  const leftMargin = leftPanelOpen ? (swapped ? 'sm:mr-[300px]' : 'sm:ml-[300px]') : '';

  return (
    <>
      <div
        className={`transition-[margin] duration-200 ease-in-out ${chatMargin} ${leftMargin}`}
      >
        <NavBar />
        <div className="pb-14">
          <Outlet />
        </div>
        <TimerFooter />
      </div>
      <LeftPanel />
      <ChatSidebar />
      <KeyboardShortcutsModal />
      {sidebarOpen && (
        <div className={`fixed top-0 ${swapped ? 'left-0' : 'right-0'} w-[400px] h-14 hidden sm:flex items-end justify-center pb-0 z-40 pointer-events-none`}>
          <PixelMan state={agentState} />
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
          <Route path="/goals" element={<Navigate to="/life" replace />} />
          <Route path="/habits" element={<Navigate to="/life?tab=habits" replace />} />
          <Route path="/phonebook" element={<Phonebook />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/terminal" element={<Terminal />} />
          <Route path="/goal/:goalId" element={<GoalGrid />} />
          <Route path="/sprints" element={<Sprints />} />
          <Route path="/sprints/:sprintId" element={<SprintBoard />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
