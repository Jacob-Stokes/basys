import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Dashboard from './pages/Dashboard';
import Timer from './pages/Timer';
import Home from './pages/Home';
import Habits from './pages/Habits';
import Tasks from './pages/Tasks';
import GoalGrid from './pages/GoalGrid';
import Login from './pages/Login';
import Settings from './pages/Settings';
import Agents from './pages/Agents';
import SharedGoalView from './pages/SharedGoalView';
import NavBar from './components/NavBar';
import TimerFooter from './components/TimerFooter';
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
      <NavBar />
      <div className="pb-14">
        <Outlet />
      </div>
      <TimerFooter />
    </ProtectedRoute>
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
          <Route path="/" element={<Dashboard />} />
          <Route path="/timer" element={<Timer />} />
          <Route path="/goals" element={<Home />} />
          <Route path="/habits" element={<Habits />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/goal/:goalId" element={<GoalGrid />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
