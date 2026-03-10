import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, API_URL } from '../api/client';
import { useDisplaySettings } from '../context/DisplaySettingsContext';
import LogoGrid from './LogoGrid';

export default function NavBar() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { settings: displaySettings } = useDisplaySettings();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [username, setUsername] = useState<string>('');
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getMe().then((u: any) => setUsername(u?.username || '')).catch(() => {});
  }, []);

  const handleLogout = async () => {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
      navigate('/login');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const isActive = (path: string) => {
    if (path === '/goals') {
      return location.pathname === '/goals' || location.pathname.startsWith('/goal/');
    }
    return location.pathname === path;
  };

  const linkClass = (path: string) =>
    `px-3 py-1.5 text-sm rounded transition-colors ${
      isActive(path)
        ? 'font-medium text-gray-900 dark:text-gray-100 bg-gray-200 dark:bg-gray-700'
        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700'
    }`;

  return (
    <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30">
      <div className="container mx-auto px-4 sm:px-16 flex items-center justify-between h-14">
        {/* Left: Logo + brand */}
        <Link to="/" className="flex items-center gap-3 shrink-0">
          <LogoGrid theme={displaySettings.appTheme} size={28} />
          <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">Basys</span>
        </Link>

        {/* Center: nav links (desktop) */}
        <div className="hidden sm:flex items-center gap-1">
          <Link to="/" className={linkClass('/')}>
            Home
          </Link>
          <Link to="/timer" className={linkClass('/timer')}>
            Pomo
          </Link>
          <Link to="/goals" className={linkClass('/goals')}>
            Goals
          </Link>
          <Link to="/habits" className={linkClass('/habits')}>
            Habits
          </Link>
          <Link to="/tasks" className={linkClass('/tasks')}>
            Todo
          </Link>
          <Link to="/journal" className={linkClass('/journal')}>
            Journal
          </Link>
          <Link to="/phonebook" className={linkClass('/phonebook')}>
            Phonebook
          </Link>
          <Link to="/terminal" className={linkClass('/terminal')}>
            Terminal
          </Link>
        </div>

        {/* Right: username dropdown (desktop) */}
        <div className="hidden sm:flex items-center relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <span>{username || '...'}</span>
            <svg className={`w-3.5 h-3.5 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-gray-700 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 z-20 py-1">
                <Link
                  to="/settings"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {t('home.settings')}
                </Link>
                <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
                <button
                  onClick={() => { handleLogout(); setUserMenuOpen(false); }}
                  className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  {t('home.logout')}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Mobile burger */}
        <div className="relative sm:hidden">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
          {mobileMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMobileMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-700 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 z-20 py-1">
                {username && (
                  <>
                    <div className="px-4 py-2 text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                      {username}
                    </div>
                    <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
                  </>
                )}
                <Link
                  to="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                >
                  Home
                </Link>
                <Link
                  to="/timer"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                >
                  Pomo
                </Link>
                <Link
                  to="/goals"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                >
                  Goals
                </Link>
                <Link
                  to="/habits"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                >
                  Habits
                </Link>
                <Link
                  to="/tasks"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                >
                  Todo
                </Link>
                <Link
                  to="/journal"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                >
                  Journal
                </Link>
                <Link
                  to="/phonebook"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                >
                  Phonebook
                </Link>
                <Link
                  to="/terminal"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                >
                  Terminal
                </Link>
                <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
                <Link
                  to="/settings"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                >
                  {t('home.settings')}
                </Link>
                <button
                  onClick={() => { handleLogout(); setMobileMenuOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  {t('home.logout')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
