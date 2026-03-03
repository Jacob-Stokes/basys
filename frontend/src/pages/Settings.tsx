import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import ConfirmModal from '../components/ConfirmModal';
import { API_URL, api } from '../api/client';
import { useDisplaySettings, paletteOptions, PaletteName } from '../context/DisplaySettingsContext';
import { lightenColor } from '../utils/color';

interface ApiKey {
  id: string;
  name: string;
  last_used_at: string | null;
  created_at: string;
  expires_at: string | null;
}

interface GoalSummary {
  id: string;
  title: string;
  status: string;
  created_at: string;
}

export default function Settings() {
  const { t } = useTranslation();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyExpireDays, setNewKeyExpireDays] = useState('365');
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [confirmDeleteKeyId, setConfirmDeleteKeyId] = useState<{ id: string; name: string } | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [allowQueryParamAuth, setAllowQueryParamAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<'api' | 'display' | 'data' | 'etiquette'>('api');
  const [apiSubTab, setApiSubTab] = useState<'keys' | 'security' | 'docs'>('keys');
  const [keysPage, setKeysPage] = useState(1);
  const KEYS_PER_PAGE = 5;
  const [goalSummaries, setGoalSummaries] = useState<GoalSummary[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [exportMode, setExportMode] = useState<'all' | 'selected'>('all');
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>([]);
  const [exportingGoals, setExportingGoals] = useState(false);
  const [importingGoals, setImportingGoals] = useState(false);
  const [dataNotice, setDataNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [etiquetteRules, setEtiquetteRules] = useState<{ id: string; content: string; is_default: number }[]>([]);
  const [etiquetteLoading, setEtiquetteLoading] = useState(false);
  const [newEtiquetteContent, setNewEtiquetteContent] = useState('');
  const [editingEtiquetteId, setEditingEtiquetteId] = useState<string | null>(null);
  const [editingEtiquetteContent, setEditingEtiquetteContent] = useState('');
  const [confirmResetEtiquette, setConfirmResetEtiquette] = useState(false);
  const {
    settings: displaySettings,
    updateSettings: updateDisplaySettings,
    setSubGoalColor,
    resetSubGoalColors,
    computedColors
  } = useDisplaySettings();
  const previewBaseColor = computedColors[1] || '#22c55e';
  const previewActionColor = lightenColor(previewBaseColor, displaySettings.actionShadePercent);
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state as { from?: string } | null) ?? null;
  const candidateBackTarget = locationState?.from;
  const backTarget = candidateBackTarget && candidateBackTarget.startsWith('/')
    ? candidateBackTarget
    : '/';
  const cameFromGoal = backTarget.startsWith('/goal/');
  const backLabel = cameFromGoal ? t('settings.backToGoal') : t('settings.backToGoals');

  const handleBackClick = () => {
    navigate(backTarget);
  };

  useEffect(() => {
    loadKeys();
    loadSettings();
  }, []);

  useEffect(() => {
    if (activeTab === 'data' && goalSummaries.length === 0 && !goalsLoading) {
      fetchGoalSummaries();
    }
    if (activeTab === 'etiquette' && etiquetteRules.length === 0 && !etiquetteLoading) {
      loadEtiquette();
    }
  }, [activeTab]);

  const loadKeys = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/auth/api-keys`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        setKeys(data.data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      const response = await fetch(`${API_URL}/api/auth/settings`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        setAllowQueryParamAuth(data.data.allow_query_param_auth);
      }
    } catch (err) {
      // silently fail — default stays true
    }
  };

  const toggleQueryParamAuth = async () => {
    const newValue = !allowQueryParamAuth;
    try {
      const response = await fetch(`${API_URL}/api/auth/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ allow_query_param_auth: newValue }),
      });
      const data = await response.json();
      if (data.success) {
        setAllowQueryParamAuth(data.data.allow_query_param_auth);
      } else {
        setError(data.error || t('settings.failedUpdateSetting'));
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const fetchGoalSummaries = async () => {
    try {
      setGoalsLoading(true);
      const response = await fetch(`${API_URL}/api/goals`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        setGoalSummaries(data.data);
      } else {
        setDataNotice({ type: 'error', message: data.error || 'Failed to load goals' });
      }
    } catch (err) {
      setDataNotice({ type: 'error', message: (err as Error).message });
    } finally {
      setGoalsLoading(false);
    }
  };

  const loadEtiquette = async () => {
    try {
      setEtiquetteLoading(true);
      const rules = await api.getEtiquette();
      setEtiquetteRules(rules);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEtiquetteLoading(false);
    }
  };

  const handleAddEtiquette = async () => {
    if (!newEtiquetteContent.trim()) return;
    try {
      const rule = await api.createEtiquette(newEtiquetteContent);
      setEtiquetteRules(prev => [...prev, rule]);
      setNewEtiquetteContent('');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleUpdateEtiquette = async (id: string) => {
    if (!editingEtiquetteContent.trim()) return;
    try {
      const updated = await api.updateEtiquette(id, editingEtiquetteContent);
      setEtiquetteRules(prev => prev.map(r => r.id === id ? updated : r));
      setEditingEtiquetteId(null);
      setEditingEtiquetteContent('');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDeleteEtiquette = async (id: string) => {
    try {
      await api.deleteEtiquette(id);
      setEtiquetteRules(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleResetEtiquette = async () => {
    try {
      const rules = await api.resetEtiquette();
      setEtiquetteRules(rules);
      setConfirmResetEtiquette(false);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleCreateKey = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/auth/api-keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          name: newKeyName,
          expiresInDays: parseInt(newKeyExpireDays),
        }),
      });

      const data = await response.json();

      if (data.success) {
        setGeneratedKey(data.data.key);
        setNewKeyName('');
        setNewKeyExpireDays('365');
        loadKeys();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const toggleGoalSelection = (goalId: string) => {
    setSelectedGoalIds((prev) =>
      prev.includes(goalId) ? prev.filter((id) => id !== goalId) : [...prev, goalId]
    );
  };

  const handleExportGoals = async () => {
    if (exportMode === 'selected' && selectedGoalIds.length === 0) {
      setDataNotice({ type: 'error', message: t('settings.selectAtLeastOneGoal') });
      return;
    }

    try {
      setExportingGoals(true);
      setDataNotice(null);
      const params =
        exportMode === 'selected' && selectedGoalIds.length
          ? `?goalIds=${encodeURIComponent(selectedGoalIds.join(','))}`
          : '';
      const response = await fetch(`${API_URL}/api/goals/export${params}`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || t('settings.exportFailed'));
      }
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      link.href = url;
      link.download = `harada-goals-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setDataNotice({
        type: 'success',
        message: t('settings.exportedGoals', { count: data.data?.count ?? 0 }),
      });
    } catch (err) {
      setDataNotice({ type: 'error', message: (err as Error).message });
    } finally {
      setExportingGoals(false);
    }
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setImportingGoals(true);
      setDataNotice(null);
      const text = await file.text();
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch (parseErr) {
        throw new Error(t('settings.selectedFileNotJson'));
      }

      const goalsPayload = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.goals)
          ? parsed.goals
          : parsed.data && Array.isArray(parsed.data.goals)
            ? parsed.data.goals
            : null;

      if (!goalsPayload || goalsPayload.length === 0) {
        throw new Error(t('settings.noGoalsInFile'));
      }

      const response = await fetch(`${API_URL}/api/goals/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ goals: goalsPayload }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || t('settings.importFailed'));
      }

      const summary = data.data?.imported;
      setDataNotice({
        type: 'success',
        message: t('settings.importedGoals', {
          goals: summary?.goals ?? 0,
          subGoals: summary?.subGoals ?? 0,
          actions: summary?.actions ?? 0,
        }),
      });
      fetchGoalSummaries();
    } catch (err) {
      setDataNotice({ type: 'error', message: (err as Error).message });
    } finally {
      setImportingGoals(false);
      event.target.value = '';
    }
  };

  const handleDeleteKey = async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/api/auth/api-keys/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        loadKeys();
        // If we'd be on an empty page after deletion, go back a page
        const remaining = keys.length - 1;
        const maxPage = Math.max(1, Math.ceil(remaining / KEYS_PER_PAGE));
        if (keysPage > maxPage) setKeysPage(maxPage);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return t('settings.never');
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <header className="mb-8">
          <button
            type="button"
            onClick={handleBackClick}
            className="text-blue-600 hover:underline mb-2 inline-block"
          >
            {backLabel}
          </button>
          <h1 className="text-4xl font-bold text-gray-900">{t('settings.title')}</h1>
          <p className="text-gray-600 mt-2">
            {t('settings.subtitle')}
          </p>
        </header>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('api')}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              activeTab === 'api'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t('settings.tabApi')}
          </button>
          <button
            onClick={() => setActiveTab('display')}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              activeTab === 'display'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t('settings.tabDisplay')}
          </button>
          <button
            onClick={() => setActiveTab('data')}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              activeTab === 'data'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t('settings.tabData')}
          </button>
          <button
            onClick={() => setActiveTab('etiquette')}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              activeTab === 'etiquette'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t('settings.tabEtiquette')}
          </button>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {activeTab === 'api' && (
          <>
            {/* Sub-tabs */}
            <div className="flex gap-1 mb-6 border-b border-gray-200">
              {(['keys', 'security', 'docs'] as const).map((sub) => (
                <button
                  key={sub}
                  onClick={() => setApiSubTab(sub)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    apiSubTab === sub
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {sub === 'keys' ? t('settings.subTabKeys') : sub === 'security' ? t('settings.subTabSecurity') : t('settings.subTabDocs')}
                </button>
              ))}
            </div>

            {apiSubTab === 'keys' && (
              <>
                <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold">{t('settings.yourApiKeys')}</h2>
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      {t('settings.createNewKey')}
                    </button>
                  </div>

                  {loading ? (
                    <p className="text-gray-500 text-center py-8">{t('common.loading')}</p>
                  ) : keys.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">
                      {t('settings.noApiKeys')}
                    </p>
                  ) : (
                    <>
                      <div className="space-y-3">
                        {keys
                          .slice((keysPage - 1) * KEYS_PER_PAGE, keysPage * KEYS_PER_PAGE)
                          .map((key) => (
                          <div
                            key={key.id}
                            className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h3 className="font-semibold text-lg">{key.name}</h3>
                                <div className="mt-2 space-y-1 text-sm text-gray-600">
                                  <p>
                                    <span className="font-medium">{t('settings.createdLabel')}</span>{' '}
                                    {formatDate(key.created_at)}
                                  </p>
                                  <p>
                                    <span className="font-medium">{t('settings.lastUsed')}</span>{' '}
                                    {formatDate(key.last_used_at)}
                                  </p>
                                  {key.expires_at && (
                                    <p>
                                      <span className="font-medium">{t('settings.expires')}</span>{' '}
                                      {formatDate(key.expires_at)}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={() => setConfirmDeleteKeyId({ id: key.id, name: key.name })}
                                className="ml-4 px-3 py-1 text-sm text-red-600 hover:text-red-800 border border-red-300 rounded hover:bg-red-50"
                              >
                                {t('common.revoke')}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {keys.length > KEYS_PER_PAGE && (
                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                          <button
                            onClick={() => setKeysPage((p) => Math.max(1, p - 1))}
                            disabled={keysPage === 1}
                            className="px-3 py-1 text-sm rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50 disabled:hover:bg-white"
                          >
                            {t('home.prev')}
                          </button>
                          <span className="text-sm text-gray-600">
                            {t('settings.pageOf', { page: keysPage, total: Math.ceil(keys.length / KEYS_PER_PAGE) })}
                          </span>
                          <button
                            onClick={() => setKeysPage((p) => Math.min(Math.ceil(keys.length / KEYS_PER_PAGE), p + 1))}
                            disabled={keysPage >= Math.ceil(keys.length / KEYS_PER_PAGE)}
                            className="px-3 py-1 text-sm rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50 disabled:hover:bg-white"
                          >
                            {t('home.next')}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                  <h3 className="font-semibold text-blue-900 mb-2">{t('settings.quickStart')}</h3>
                  <p className="text-sm text-blue-800 mb-3">
                    {t('settings.quickStartDesc')}
                  </p>
                  <pre className="bg-blue-900 text-blue-100 p-3 rounded text-xs overflow-x-auto">
                    curl -H "x-api-key: YOUR-API-KEY" \{'\n'}
                    {'  '}https://harada.jacobstokes.com/api/user/summary
                  </pre>
                </div>
              </>
            )}

            {apiSubTab === 'security' && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h3 className="text-lg font-semibold mb-3">{t('settings.security')}</h3>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowQueryParamAuth}
                    onChange={toggleQueryParamAuth}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="font-medium text-gray-900">{t('settings.allowApiKeyInUrl')}</span>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {t('settings.allowApiKeyInUrlDesc')}<code className="bg-gray-100 px-1 rounded">{t('settings.apiKeyQueryParam')}</code>{t('settings.allowApiKeyInUrlDescSuffix')}
                    </p>
                  </div>
                </label>
              </div>
            )}

            {apiSubTab === 'docs' && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-2xl font-semibold mb-4">{t('settings.apiDocumentation')}</h2>

            <div className="space-y-6">
              {/* Overview */}
              <section>
                <h3 className="text-lg font-semibold mb-2">{t('settings.overview')}</h3>
                <p className="text-gray-700">
                  The xharada API exposes every goal, sub-goal, action item, log, and guestbook entry so AI agents can coach, summarize, or automate check-ins. The API is RESTful, JSON-only, and every endpoint returns a predictable <code className="bg-gray-100 px-1 rounded text-sm">success/data/error</code> envelope.
                </p>
              </section>

              {/* Base URL */}
              <section>
                <h3 className="text-lg font-semibold mb-2">{t('settings.baseUrlHeaders')}</h3>
                <div className="bg-gray-50 p-4 rounded text-sm space-y-2">
                  <p><strong>{t('settings.production')}</strong> <code className="bg-white px-2 py-1 rounded border">https://harada.jacobstokes.com</code></p>
                  <p><strong>{t('settings.localDev')}</strong> <code className="bg-white px-2 py-1 rounded border">http://localhost:3001</code></p>
                  <p>All requests must send <code className="bg-white px-2 py-1 rounded border">Content-Type: application/json</code> when a body is present.</p>
                  <pre className="bg-gray-900 text-green-400 p-3 rounded text-xs overflow-x-auto">
curl -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  "$API_URL/api/user/summary"
                  </pre>
                </div>
              </section>

              {/* Authentication */}
              <section>
                <h3 className="text-lg font-semibold mb-2">{t('settings.authentication')}</h3>
                <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                  <li>
                    <strong>Session Cookie:</strong> The web app sets <code className="bg-gray-100 px-1 rounded">connect.sid</code>. Use it for browser-based integrations.
                  </li>
                  <li>
                    <strong>API Key:</strong> Create keys in the Settings → API Keys tab. Send <code className="bg-gray-100 px-1 rounded">x-api-key: YOUR_KEY</code> on every request. Keys inherit the same permissions as your user.
                  </li>
                </ul>
              </section>

              {/* Core Resources */}
              <section>
                <h3 className="text-lg font-semibold mb-3">{t('settings.coreResources')}</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {[
                    { method: 'GET', path: '/api/user/summary', text: 'Full tree of goals → sub-goals → actions plus optional logs and guestbook data.' },
                    { method: 'GET', path: '/api/goals', text: 'List every primary goal. Use `/api/goals/:id` for a single goal and `/api/goals/:id/tree` for nested data.' },
                    { method: 'GET', path: '/api/subgoals/:id', text: 'Retrieve or update the 8 supporting goals that belong to a primary goal.' },
                    { method: 'POST', path: '/api/goals | /api/subgoals | /api/actions', text: 'Create goals, sub-goals, or actions. Bodies accept `title`, optional `description`, and ordering fields.' },
                    { method: 'GET', path: '/api/logs/action/:actionId', text: 'Fetch recent activity logs and derived stats for a single action item.' },
                    { method: 'POST', path: '/api/logs/action/:actionId', text: 'Create a new log entry with `log_type`, `content`, `log_date`, optional `metric_value/unit`, and `mood`.' },
                    { method: 'GET', path: '/api/guestbook', text: 'List AI messages. Filter with `target_type=user|goal|subgoal|action` and `target_id`.' },
                    { method: 'POST', path: '/api/guestbook', text: 'Let agents leave encouragement or insights. Provide `agent_name`, `comment`, `target_type`, and optional `target_id`.' },
                  ].map((item) => (
                    <div key={item.path + item.method} className="border border-gray-200 rounded-lg p-4 h-full">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs font-semibold px-2 py-1 rounded ${item.method === 'GET' ? 'bg-green-600 text-white' : 'bg-blue-600 text-white'}`}>
                          {item.method}
                        </span>
                        <code className="text-sm font-mono">{item.path}</code>
                      </div>
                      <p className="text-sm text-gray-600">{item.text}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* User Summary Options */}
              <section>
                <h3 className="text-lg font-semibold mb-2">{t('settings.summaryParameters')}</h3>
                <div className="bg-gray-50 p-4 rounded text-sm space-y-2">
                  <p><code className="bg-white px-2 py-1 rounded border">level</code> (default <code>standard</code>)</p>
                  <ul className="list-disc list-inside ml-4 space-y-1 text-gray-700">
                    <li><strong>minimal:</strong> goal IDs/titles only</li>
                    <li><strong>standard:</strong> full tree plus activity counts</li>
                    <li><strong>detailed:</strong> adds descriptions, timestamps, metadata</li>
                    <li><strong>full:</strong> includes everything above and supports log hydration</li>
                  </ul>
                  <p className="pt-2"><code className="bg-white px-2 py-1 rounded border">include_logs=true</code> → attach up to 10 recent logs per action (only honored when <code>level=full</code>).</p>
                  <p><code className="bg-white px-2 py-1 rounded border">include_guestbook=true</code> → embed user, goal, and sub-goal guestbook comments inline.</p>
                </div>
              </section>

              {/* Guestbook + Logs */}
              <section>
                <h3 className="text-lg font-semibold mb-2">{t('settings.logsGuestbookPayloads')}</h3>
                <pre className="bg-gray-900 text-green-400 p-3 rounded text-xs overflow-x-auto">
{`# Log progress on an action (captures metrics & mood)
curl -X POST "$API_URL/api/logs/action/{ACTION_ID}" \\
  -H "x-api-key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
        "log_type": "progress",
        "content": "Completed algorithm course module 3",
        "log_date": "2026-02-23",
        "metric_value": 2.5,
        "metric_unit": "hours",
        "mood": "accomplished"
      }'

# Leave an encouragement note
curl -X POST "$API_URL/api/guestbook" \\
  -H "x-api-key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
        "agent_name": "Daily Coach",
        "comment": "Momentum looks great—keep logging nightly!",
        "target_type": "user"
      }'`}
                </pre>
              </section>

              {/* Data Model */}
              <section>
                <h3 className="text-lg font-semibold mb-2">{t('settings.dataModelMentalModel')}</h3>
                <div className="bg-gray-50 p-4 rounded space-y-2 text-sm">
                  <p><strong>Primary Goal</strong> → 8 <strong>Sub-Goals</strong> → 8 <strong>Action Items</strong> (64 actions per goal).</p>
                  <p><strong>Activity Logs</strong> capture continuous progress—no "done" checkbox exists.</p>
                  <p className="text-xs text-gray-600">
                    Log types: note, progress, completion, media, link · Moods: motivated, challenged, accomplished, frustrated, neutral.
                  </p>
                </div>
              </section>

              {/* Response Format */}
              <section>
                <h3 className="text-lg font-semibold mb-2">{t('settings.responseErrorFormat')}</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <pre className="bg-gray-900 text-green-400 p-3 rounded text-xs overflow-x-auto">
{`{
  "success": true,
  "data": { ...nested payload... },
  "error": null
}`}
                  </pre>
                  <pre className="bg-gray-900 text-red-300 p-3 rounded text-xs overflow-x-auto">
{`{
  "success": false,
  "data": null,
  "error": "API key is invalid"
}`}
                  </pre>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  HTTP status codes follow standards (200 success, 400 validation errors, 401 auth failures, 500 server issues). Retry cautiously on 500s only.
                </p>
              </section>

              {/* Example Workflows */}
              <section>
                <h3 className="text-lg font-semibold mb-2">{t('settings.suggestedAgentWorkflow')}</h3>
                <ol className="list-decimal list-inside space-y-2 text-gray-700">
                  <li>Call <code className="bg-gray-100 px-1 rounded">GET /api/user/summary?level=detailed</code> once per run to build context.</li>
                  <li>Deep dive on neglected actions via <code className="bg-gray-100 px-1 rounded">GET /api/logs/action/:actionId</code>.</li>
                  <li>Post insights or reminders through <code className="bg-gray-100 px-1 rounded">POST /api/guestbook</code>.</li>
                  <li>Record new work by logging activity with metrics for each finished session.</li>
                </ol>
              </section>
            </div>
          </div>
            )}
          </>
        )}

        {activeTab === 'display' && (
          <div className="bg-white rounded-lg shadow-lg p-6 space-y-8">
            <div>
              <h2 className="text-2xl font-semibold mb-2">{t('settings.displayPreferences')}</h2>
              <p className="text-gray-600 text-sm">
                {t('settings.displayPreferencesDesc')}
              </p>
            </div>

            {/* Default View */}
            <section>
              <h3 className="text-lg font-semibold mb-2">{t('settings.defaultGoalView')}</h3>
              <p className="text-sm text-gray-600 mb-3">
                {t('settings.defaultGoalViewDesc')}
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                {(['compact', 'full'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => updateDisplaySettings({ defaultView: mode })}
                    className={`flex-1 border rounded-lg px-4 py-3 text-left transition-colors ${
                      displaySettings.defaultView === mode
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <div className="font-medium capitalize">{mode}{t('settings.viewSuffix')}</div>
                    <p className="text-sm text-gray-600">
                      {mode === 'compact'
                        ? t('settings.compactViewDesc')
                        : t('settings.fullViewDesc')}
                    </p>
                  </button>
                ))}
              </div>
            </section>

            {/* Goals Per Page */}
            <section>
              <h3 className="text-lg font-semibold mb-2">{t('settings.goalsPerPage')}</h3>
              <p className="text-sm text-gray-600 mb-3">
                {t('settings.goalsPerPageDesc')}
              </p>
              <div className="flex items-center gap-3">
                {[3, 5, 10, 25].map((n) => (
                  <button
                    key={n}
                    onClick={() => updateDisplaySettings({ goalsPerPage: n })}
                    className={`px-4 py-2 border rounded-lg text-sm font-medium transition-colors ${
                      displaySettings.goalsPerPage === n
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </section>

            {/* Guestbook Per Page */}
            <section>
              <h3 className="text-lg font-semibold mb-2">{t('settings.guestbookPerPage')}</h3>
              <p className="text-sm text-gray-600 mb-3">
                {t('settings.guestbookPerPageDesc')}
              </p>
              <div className="flex items-center gap-3">
                {[3, 5, 10, 25].map((n) => (
                  <button
                    key={n}
                    onClick={() => updateDisplaySettings({ guestbookPerPage: n })}
                    className={`px-4 py-2 border rounded-lg text-sm font-medium transition-colors ${
                      displaySettings.guestbookPerPage === n
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </section>

            {/* Language */}
            <section>
              <h3 className="text-lg font-semibold mb-2">{t('settings.language')}</h3>
              <p className="text-sm text-gray-600 mb-3">
                {t('settings.languageDesc')}
              </p>
              <div className="flex items-center gap-3">
                {[
                  { code: 'en-US', label: 'English (US)' },
                  { code: 'en-GB', label: 'English (UK)' },
                  { code: 'ja', label: '日本語' },
                ].map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      i18n.changeLanguage(lang.code);
                      updateDisplaySettings({ language: lang.code });
                    }}
                    className={`px-4 py-2 border rounded-lg text-sm font-medium transition-colors ${
                      (displaySettings.language || i18n.language) === lang.code
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </section>

            {/* Palette */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">{t('settings.colorPalette')}</h3>
                <button
                  onClick={resetSubGoalColors}
                  className="text-sm text-blue-600 hover:underline"
                >
                  {t('settings.resetCustomColors')}
                </button>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                {t('settings.colorPaletteDesc')}
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                {Object.entries(paletteOptions).map(([name, option]) => {
                  const paletteName = name as PaletteName;
                  return (
                    <button
                      key={name}
                      onClick={() => updateDisplaySettings({ palette: paletteName })}
                      className={`border rounded-lg p-4 text-left transition-colors ${
                        displaySettings.palette === paletteName
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-200'
                      }`}
                    >
                      <div className="font-semibold mb-2">{t('palette.' + name)}</div>
                      <div className="flex gap-1">
                        {option.colors.map((color, idx) => (
                          <span
                            key={`${name}-${idx}`}
                            className="h-6 w-full rounded"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Custom Colors */}
            <section>
              <h3 className="text-lg font-semibold mb-2">{t('settings.customSubGoalColors')}</h3>
              <p className="text-sm text-gray-600 mb-4">
                {t('settings.customSubGoalColorsDesc')}
              </p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {Array.from({ length: 8 }, (_, index) => {
                  const position = index + 1;
                  const currentColor =
                    displaySettings.customSubGoalColors[position] ||
                    computedColors[position] ||
                    '#22c55e';
                  return (
                    <div
                      key={position}
                      className="border rounded-lg p-3 flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between text-sm font-medium">
                        <span>{t('settings.subGoalPosition', { position })}</span>
                        {displaySettings.customSubGoalColors[position] && (
                          <button
                            type="button"
                            className="text-xs text-red-500 hover:underline"
                            onClick={() => setSubGoalColor(position, null)}
                          >
                            {t('settings.clear')}
                          </button>
                        )}
                      </div>
                      <input
                        type="color"
                        value={currentColor}
                        onChange={(e) => setSubGoalColor(position, e.target.value)}
                        className="w-full h-10 cursor-pointer"
                      />
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Action Styling */}
            <section>
              <h3 className="text-lg font-semibold mb-2">{t('settings.actionTileStyling')}</h3>
              <div className="flex items-center gap-3">
                <input
                  id="inherit-action-color"
                  type="checkbox"
                  checked={displaySettings.inheritActionColors}
                  onChange={(e) =>
                    updateDisplaySettings({ inheritActionColors: e.target.checked })
                  }
                  className="h-4 w-4"
                />
                <label htmlFor="inherit-action-color" className="text-sm text-gray-700">
                  {t('settings.inheritActionColors')}
                </label>
              </div>
              <div className="mt-4">
                <label className="text-sm text-gray-600 flex justify-between">
                  <span>{t('settings.actionLightness')}</span>
                  <span>{displaySettings.actionShadePercent}%</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={displaySettings.actionShadePercent}
                  onChange={(e) =>
                    updateDisplaySettings({ actionShadePercent: Number(e.target.value) })
                  }
                  disabled={!displaySettings.inheritActionColors}
                  className="w-full mt-2"
                />
                <div className="mt-3 flex items-center gap-3 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-5 w-5 rounded border" style={{ backgroundColor: previewBaseColor }} />
                    {t('settings.parent')}
                  </div>
                  <span>{t('settings.arrow')}</span>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-5 w-5 rounded border" style={{ backgroundColor: previewActionColor }} />
                    {t('settings.actionPreview')}
                  </div>
                </div>
              </div>
            </section>

            {/* Center Layout */}
            <section>
              <h3 className="text-lg font-semibold mb-2">{t('settings.centerLayout')}</h3>
              <p className="text-sm text-gray-600 mb-3">
                {t('settings.centerLayoutDesc')}
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                {[
                  {
                    key: 'single',
                    title: t('settings.singleFocusBlock'),
                    description: t('settings.singleFocusBlockDesc'),
                  },
                  {
                    key: 'radial',
                    title: t('settings.directionalBridges'),
                    description: t('settings.directionalBridgesDesc'),
                  },
                ].map((layoutOption) => (
                  <button
                    key={layoutOption.key}
                    onClick={() =>
                      updateDisplaySettings({ centerLayout: layoutOption.key as 'single' | 'radial' })
                    }
                    className={`border rounded-lg p-4 text-left transition-colors ${
                      displaySettings.centerLayout === layoutOption.key
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-blue-200'
                    }`}
                  >
                    <div className="font-semibold">{layoutOption.title}</div>
                    <p className="text-sm text-gray-600">{layoutOption.description}</p>
                  </button>
                ))}
              </div>
            </section>

            {/* Center Background */}
            <section>
              <h3 className="text-lg font-semibold mb-2">{t('settings.centerBackground')}</h3>
              <p className="text-sm text-gray-600 mb-3">
                {t('settings.centerBackgroundDesc')}
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                {[
                  { key: 'card', title: t('settings.matchCard'), description: t('settings.matchCardDesc') },
                  { key: 'page', title: t('settings.matchPage'), description: t('settings.matchPageDesc') },
                ].map((option) => (
                  <button
                    key={option.key}
                    onClick={() =>
                      updateDisplaySettings({ centerBackdrop: option.key as 'card' | 'page' })
                    }
                    className={`flex-1 border rounded-lg px-4 py-3 text-left transition-colors ${
                      displaySettings.centerBackdrop === option.key
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-blue-200'
                    }`}
                  >
                    <div className="font-medium">{option.title}</div>
                    <p className="text-sm text-gray-600">{option.description}</p>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'data' && (
          <div className="bg-white rounded-lg shadow-lg p-6 space-y-8">
            {dataNotice && (
              <div
                className={`px-4 py-3 rounded ${
                  dataNotice.type === 'success'
                    ? 'bg-green-50 text-green-800 border border-green-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}
              >
                {dataNotice.message}
              </div>
            )}

            <section className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-1">{t('settings.exportGoals')}</h3>
                <p className="text-sm text-gray-600">
                  {t('settings.exportGoalsDesc')}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="export-mode"
                    value="all"
                    checked={exportMode === 'all'}
                    onChange={() => setExportMode('all')}
                  />
                  {t('settings.exportAllGoals')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="export-mode"
                    value="selected"
                    checked={exportMode === 'selected'}
                    onChange={() => setExportMode('selected')}
                  />
                  {t('settings.chooseSpecificGoals')}
                </label>
              </div>
              {exportMode === 'selected' && (
                <div className="border rounded-lg p-3 bg-gray-50 max-h-64 overflow-y-auto text-sm">
                  {goalsLoading ? (
                    <p className="text-gray-500">{t('settings.loadingGoals')}</p>
                  ) : goalSummaries.length === 0 ? (
                    <p className="text-gray-500">{t('settings.noGoalsAvailable')}</p>
                  ) : (
                    goalSummaries.map((goal) => (
                      <label key={goal.id} className="flex items-center gap-3 py-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedGoalIds.includes(goal.id)}
                          onChange={() => toggleGoalSelection(goal.id)}
                        />
                        <div>
                          <div className="font-medium text-gray-800">{goal.title}</div>
                          <div className="text-xs text-gray-500">
                            {t('common.status')}{goal.status} • {t('common.created')}{new Date(goal.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={handleExportGoals}
                disabled={exportingGoals || (exportMode === 'selected' && selectedGoalIds.length === 0)}
                className={`px-4 py-2 rounded text-white ${
                  exportingGoals ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {exportingGoals ? t('settings.preparing') : t('settings.downloadJson')}
              </button>
            </section>

            <section className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-1">{t('settings.importGoals')}</h3>
                <p className="text-sm text-gray-600">
                  {t('settings.importGoalsDesc')}
                </p>
              </div>
              <label
                htmlFor="goal-import-input"
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 cursor-pointer hover:bg-gray-50 w-fit"
              >
                <svg className="h-5 w-5 text-gray-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                {importingGoals ? t('settings.uploading') : t('settings.chooseJsonFile')}
                <input
                  id="goal-import-input"
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={handleImportFile}
                  disabled={importingGoals}
                />
              </label>
              <p className="text-xs text-gray-500">
                {t('settings.importTip')}
              </p>
            </section>
          </div>
        )}

        {activeTab === 'etiquette' && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{t('settings.agentEtiquetteRules')}</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {t('settings.agentEtiquetteDesc')}
                </p>
              </div>
              <button
                onClick={() => setConfirmResetEtiquette(true)}
                className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
              >
                {t('settings.resetToDefaults')}
              </button>
            </div>

            {etiquetteLoading ? (
              <p className="text-gray-500">{t('common.loading')}</p>
            ) : (
              <div className="space-y-2">
                {etiquetteRules.map((rule) => (
                  <div key={rule.id} className="flex items-start gap-2 group">
                    {editingEtiquetteId === rule.id ? (
                      <div className="flex-1 flex gap-2">
                        <input
                          type="text"
                          value={editingEtiquetteContent}
                          onChange={(e) => setEditingEtiquetteContent(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleUpdateEtiquette(rule.id);
                            if (e.key === 'Escape') { setEditingEtiquetteId(null); setEditingEtiquetteContent(''); }
                          }}
                          className="flex-1 px-3 py-2 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          autoFocus
                        />
                        <button
                          onClick={() => handleUpdateEtiquette(rule.id)}
                          className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                        >
                          {t('common.save')}
                        </button>
                        <button
                          onClick={() => { setEditingEtiquetteId(null); setEditingEtiquetteContent(''); }}
                          className="px-3 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50"
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 px-3 py-2 bg-gray-50 rounded text-sm text-gray-700 border border-gray-200">
                          {rule.content}
                          {rule.is_default ? (
                            <span className="ml-2 text-xs text-gray-400">{t('settings.defaultBadge')}</span>
                          ) : null}
                        </div>
                        <button
                          onClick={() => { setEditingEtiquetteId(rule.id); setEditingEtiquetteContent(rule.content); }}
                          className="px-2 py-2 text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity text-sm"
                          title={t('common.edit')}
                        >
                          {t('common.edit')}
                        </button>
                        <button
                          onClick={() => handleDeleteEtiquette(rule.id)}
                          className="px-2 py-2 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity text-sm"
                          title={t('common.remove')}
                        >
                          {t('common.remove')}
                        </button>
                      </>
                    )}
                  </div>
                ))}

                {/* Add new rule */}
                <div className="flex gap-2 pt-3 border-t mt-3">
                  <input
                    type="text"
                    value={newEtiquetteContent}
                    onChange={(e) => setNewEtiquetteContent(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddEtiquette(); }}
                    placeholder={t('settings.addEtiquettePlaceholder')}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  <button
                    onClick={handleAddEtiquette}
                    disabled={!newEtiquetteContent.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('common.add')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Key Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6 border-b">
              <h2 className="text-2xl font-bold text-gray-900">{t('settings.createApiKey')}</h2>
            </div>

            <form onSubmit={handleCreateKey} className="p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('settings.keyName')}
                </label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder={t('settings.keyNamePlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('settings.expiresInDays')}
                </label>
                <input
                  type="number"
                  value={newKeyExpireDays}
                  onChange={(e) => setNewKeyExpireDays(e.target.value)}
                  min="1"
                  max="3650"
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  {t('settings.expiresHint')}
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewKeyName('');
                    setNewKeyExpireDays('365');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  {t('settings.createKey')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Generated Key Modal */}
      {generatedKey && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
            <div className="p-6 border-b">
              <h2 className="text-2xl font-bold text-gray-900">{t('settings.apiKeyCreated')}</h2>
            </div>

            <div className="p-6">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-yellow-800 font-semibold">
                  {t('settings.copyKeyWarning')}
                </p>
              </div>

              <div className="bg-gray-900 text-green-400 p-4 rounded font-mono text-sm break-all">
                {generatedKey}
              </div>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(generatedKey!);
                  setKeyCopied(true);
                  setTimeout(() => setKeyCopied(false), 2000);
                }}
                className="w-full mt-4 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                {keyCopied ? t('common.copied') : t('settings.copyToClipboard')}
              </button>
            </div>

            <div className="p-6 border-t">
              <button
                onClick={() => {
                  setGeneratedKey(null);
                  setShowCreateModal(false);
                }}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                {t('common.done')}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmResetEtiquette && (
        <ConfirmModal
          title={t('settings.resetEtiquetteTitle')}
          message={t('settings.resetEtiquetteMessage')}
          confirmLabel={t('common.reset')}
          confirmClassName="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm font-medium"
          onConfirm={handleResetEtiquette}
          onCancel={() => setConfirmResetEtiquette(false)}
        />
      )}

      {confirmDeleteKeyId && (
        <ConfirmModal
          title={t('settings.revokeApiKeyTitle')}
          message={t('settings.revokeApiKeyMessage', { name: confirmDeleteKeyId.name })}
          confirmLabel={t('common.revoke')}
          onConfirm={() => {
            handleDeleteKey(confirmDeleteKeyId.id);
            setConfirmDeleteKeyId(null);
          }}
          onCancel={() => setConfirmDeleteKeyId(null)}
        />
      )}
    </div>
  );
}
