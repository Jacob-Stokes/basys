import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, API_URL } from '../api/client';
import ConfirmModal from '../components/ConfirmModal';
import Guestbook from '../components/Guestbook';
import { useDisplaySettings } from '../context/DisplaySettingsContext';

interface Goal {
  id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
}

export default function Home() {
  const { t } = useTranslation();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [showAgentDialog, setShowAgentDialog] = useState(false);
  const [pastedApiKey, setPastedApiKey] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [creatingAgentKey, setCreatingAgentKey] = useState(false);
  const [agentKeyNotice, setAgentKeyNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [allowQueryParamAuth, setAllowQueryParamAuth] = useState(true);
  const [confirmDeleteGoalId, setConfirmDeleteGoalId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'active' | 'completed' | 'archived' | 'all' | 'guestbook'>('active');
  const [openMenuGoalId, setOpenMenuGoalId] = useState<string | null>(null);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const { settings: displaySettings } = useDisplaySettings();

  useEffect(() => {
    loadGoals();
  }, []);

  const loadGoals = async () => {
    try {
      setLoading(true);
      const data = await api.getGoals();
      setGoals(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoalTitle.trim()) return;

    try {
      await api.createGoal({ title: newGoalTitle });
      setNewGoalTitle('');
      loadGoals();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDeleteGoal = async (id: string) => {
    try {
      await api.deleteGoal(id);
      loadGoals();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleOpenAgentDialog = async () => {
    setShowAgentDialog(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/settings`, { credentials: 'include' });
      const data = await response.json();
      if (data.success) {
        setAllowQueryParamAuth(data.data.allow_query_param_auth);
      }
    } catch {}
  };

  const getAgentLandingUrl = (format?: 'json') => {
    if (!pastedApiKey.trim()) return '';
    const baseUrl = window.location.origin;
    if (format === 'json') {
      return `${baseUrl}/api/agents/brief?apiKey=${encodeURIComponent(pastedApiKey)}`;
    }
    return `${baseUrl}/agents?apiKey=${encodeURIComponent(pastedApiKey)}`;
  };

  const handleCopyUrl = () => {
    const url = getAgentLandingUrl();
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePreview = () => {
    const url = getAgentLandingUrl();
    if (url) {
      window.open(url, '_blank');
    }
  };

  const handleGenerateAgentKey = async () => {
    if (creatingAgentKey) return;
    try {
      setCreatingAgentKey(true);
      setAgentKeyNotice(null);
      const response = await fetch(`${API_URL}/api/auth/api-keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          name: `Agent Landing ${new Date().toLocaleString()}`,
          expiresInDays: 365,
        }),
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || t('home.failedCreateApiKey'));
      }
      const key = data.data?.key;
      setPastedApiKey(key || '');
      setAgentKeyNotice({ type: 'success', message: t('home.newApiKeyGenerated') });
    } catch (err) {
      setAgentKeyNotice({ type: 'error', message: (err as Error).message });
    } finally {
      setCreatingAgentKey(false);
    }
  };

  const perPage = displaySettings.goalsPerPage;
  const filteredGoals = useMemo(
    () => statusFilter === 'all' ? goals : goals.filter(g => g.status === statusFilter),
    [goals, statusFilter]
  );
  const totalPages = Math.max(1, Math.ceil(filteredGoals.length / perPage));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedGoals = useMemo(
    () => filteredGoals.slice((safePage - 1) * perPage, safePage * perPage),
    [filteredGoals, safePage, perPage]
  );

  const handleUpdateStatus = async (goalId: string, status: string) => {
    try {
      await api.updateGoal(goalId, { status });
      setOpenMenuGoalId(null);
      loadGoals();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <div className="container mx-auto px-4 sm:px-16 pt-8 pb-8">
        {error && (
          <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-400 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold dark:text-gray-100">{t('home.createNewGoal')}</h2>
            <button
              onClick={handleOpenAgentDialog}
              className="px-3 py-1.5 text-sm text-blue-600 hover:text-blue-900 border border-blue-200 rounded hover:bg-blue-50"
            >
              {t('home.agentLanding')}
            </button>
          </div>
          <form onSubmit={handleCreateGoal} className="flex gap-4">
            <input
              type="text"
              value={newGoalTitle}
              onChange={(e) => setNewGoalTitle(e.target.value)}
              placeholder={t('home.enterGoalTitle')}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
            />
            <button
              type="submit"
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {t('home.createGoal')}
            </button>
          </form>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold dark:text-gray-100">{t('home.yourGoals')}</h2>
            {/* Desktop filter tabs */}
            <div className="hidden sm:flex gap-1 items-center">
              {(['active', 'completed', 'archived', 'all'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => { setStatusFilter(filter); setCurrentPage(1); }}
                  className={`px-3 py-1 text-sm rounded ${
                    statusFilter === filter ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {t(`home.filter_${filter}`)}
                </button>
              ))}
              <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
              <button
                onClick={() => { setStatusFilter('guestbook'); setCurrentPage(1); }}
                className={`px-3 py-1 text-sm rounded ${
                  statusFilter === 'guestbook' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {t('home.filter_guestbook')}
              </button>
            </div>

            {/* Mobile filter dropdown */}
            <div className="relative sm:hidden">
              <button
                onClick={() => setFilterMenuOpen(!filterMenuOpen)}
                className="flex items-center gap-1 px-3 py-1 text-sm rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
              >
                {statusFilter === 'guestbook' ? t('home.filter_guestbook') : t(`home.filter_${statusFilter}`)}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {filterMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setFilterMenuOpen(false)} />
                  <div className="absolute right-0 mt-1 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[140px]">
                    {(['active', 'completed', 'archived', 'all'] as const).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => { setStatusFilter(filter); setCurrentPage(1); setFilterMenuOpen(false); }}
                        className={`block w-full text-left px-4 py-2 text-sm ${
                          statusFilter === filter ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        {t(`home.filter_${filter}`)}
                      </button>
                    ))}
                    <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                    <button
                      onClick={() => { setStatusFilter('guestbook'); setCurrentPage(1); setFilterMenuOpen(false); }}
                      className={`block w-full text-left px-4 py-2 text-sm ${
                        statusFilter === 'guestbook' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      {t('home.filter_guestbook')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {statusFilter === 'guestbook' ? (
            <Guestbook targetType="user" />
          ) : loading ? (
            <p className="text-gray-500 dark:text-gray-400">{t('home.loadingGoals')}</p>
          ) : filteredGoals.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">{t('home.noGoals')}</p>
          ) : (
            <>
              <div className="grid gap-4">
                {paginatedGoals.map((goal) => (
                  <div
                    key={goal.id}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{goal.title}</h3>
                        {goal.description && (
                          <p className="text-gray-600 dark:text-gray-400 mt-1">{goal.description}</p>
                        )}
                        <div className="flex gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400 items-center">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            goal.status === 'active' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                            goal.status === 'completed' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                            'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                          }`}>
                            {t(`home.status_${goal.status}`)}
                          </span>
                          <span>{t('common.created')}{new Date(goal.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex gap-2 items-center">
                        <Link
                          to={`/goal/${goal.id}`}
                          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-sm"
                        >
                          {t('home.viewGrid')}
                        </Link>
                        {/* Three-dots menu */}
                        <div className="relative">
                          <button
                            onClick={() => setOpenMenuGoalId(openMenuGoalId === goal.id ? null : goal.id)}
                            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                              <circle cx="10" cy="4" r="1.5" />
                              <circle cx="10" cy="10" r="1.5" />
                              <circle cx="10" cy="16" r="1.5" />
                            </svg>
                          </button>
                          {openMenuGoalId === goal.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setOpenMenuGoalId(null)} />
                              <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-gray-700 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 z-20 py-1">
                                {goal.status === 'active' && (
                                  <>
                                    <button
                                      onClick={() => handleUpdateStatus(goal.id, 'completed')}
                                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                                    >
                                      {t('home.markComplete')}
                                    </button>
                                    <button
                                      onClick={() => handleUpdateStatus(goal.id, 'archived')}
                                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                                    >
                                      {t('home.archive')}
                                    </button>
                                  </>
                                )}
                                {goal.status === 'completed' && (
                                  <>
                                    <button
                                      onClick={() => handleUpdateStatus(goal.id, 'active')}
                                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                                    >
                                      {t('home.reactivate')}
                                    </button>
                                    <button
                                      onClick={() => handleUpdateStatus(goal.id, 'archived')}
                                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                                    >
                                      {t('home.archive')}
                                    </button>
                                  </>
                                )}
                                {goal.status === 'archived' && (
                                  <button
                                    onClick={() => handleUpdateStatus(goal.id, 'active')}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                                  >
                                    {t('home.reactivate')}
                                  </button>
                                )}
                                <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
                                <button
                                  onClick={() => { setOpenMenuGoalId(null); setConfirmDeleteGoalId(goal.id); }}
                                  className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                                >
                                  {t('common.delete')}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t dark:border-gray-700">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('home.showingRange', {
                      start: (safePage - 1) * perPage + 1,
                      end: Math.min(safePage * perPage, filteredGoals.length),
                      total: filteredGoals.length,
                    })}
                  </p>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={safePage === 1}
                      className="px-3 py-1 text-sm border dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed dark:text-gray-300"
                    >
                      {t('home.prev')}
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`px-3 py-1 text-sm border dark:border-gray-600 rounded ${
                          page === safePage ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={safePage === totalPages}
                      className="px-3 py-1 text-sm border dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed dark:text-gray-300"
                    >
                      {t('home.next')}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Agent Landing Dialog */}
      {showAgentDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('home.agentLandingPage')}</h2>
              <button
                onClick={() => setShowAgentDialog(false)}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-2xl"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('home.pasteApiKey')}
                </label>
                <input
                  type="text"
                  value={pastedApiKey}
                  onChange={(e) => setPastedApiKey(e.target.value)}
                  placeholder={t('home.pasteApiKeyPlaceholder')}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleGenerateAgentKey}
                    disabled={creatingAgentKey}
                    className={`px-4 py-2 rounded text-sm text-white ${
                      creatingAgentKey ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    {creatingAgentKey ? t('home.generatingKey') : t('home.generateApiKey')}
                  </button>
                  <Link
                    to="/settings"
                    className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                    onClick={() => setShowAgentDialog(false)}
                  >
                    {t('home.manageKeysInSettings')}
                  </Link>
                </div>
                {agentKeyNotice && (
                  <p
                    className={`mt-2 text-xs ${
                      agentKeyNotice.type === 'success' ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {agentKeyNotice.message}
                  </p>
                )}
              </div>

              {pastedApiKey.trim() && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {t('home.agentLandingUrl')}
                    </label>
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={getAgentLandingUrl()}
                          readOnly
                          className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-gray-100 text-sm"
                        />
                        <button
                          onClick={handleCopyUrl}
                          className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap"
                        >
                          {copied ? t('common.copied') : t('common.copy')}
                        </button>
                      </div>
                      {allowQueryParamAuth && (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={getAgentLandingUrl('json')}
                            readOnly
                            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-gray-100 text-sm"
                          />
                          <button
                            onClick={() => {
                              const url = getAgentLandingUrl('json');
                              navigator.clipboard.writeText(url);
                            }}
                            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap"
                          >
                            {t('home.copyJsonUrl')}
                          </button>
                        </div>
                      )}
                    </div>
                    {allowQueryParamAuth ? (
                      <>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                          {t('home.shareUrlInfo')}
                        </p>
                        <p className="text-xs text-amber-600 mt-1">
                          {t('home.shareUrlWarning')}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        {t('home.jsonUrlDisabled')}<Link to="/settings" className="text-blue-600 underline" onClick={() => setShowAgentDialog(false)}>{t('home.jsonUrlDisabledSettings')}</Link>{t('home.jsonUrlDisabledSuffix')}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={handlePreview}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      {t('home.previewLandingPage')}
                    </button>
                    <Link
                      to="/settings"
                      onClick={() => setShowAgentDialog(false)}
                      className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-center"
                    >
                      {t('home.manageApiKeys')}
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmDeleteGoalId && (
        <ConfirmModal
          title={t('home.deleteGoalTitle')}
          message={t('home.deleteGoalMessage')}
          confirmLabel={t('common.delete')}
          onConfirm={() => {
            handleDeleteGoal(confirmDeleteGoalId);
            setConfirmDeleteGoalId(null);
          }}
          onCancel={() => setConfirmDeleteGoalId(null)}
        />
      )}

      <footer className="mt-12 pb-6 text-center">
        <p className="text-xs text-gray-400 dark:text-gray-600 tracking-wider">原田メソッド · Harada Method</p>
      </footer>
    </div>
  );
}
