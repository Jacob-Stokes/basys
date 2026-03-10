import { useState, useEffect, useRef, useCallback, FormEvent, ChangeEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import ConfirmModal from '../components/ConfirmModal';
import { API_URL, api } from '../api/client';
import { useDisplaySettings, getAllPalettes, appThemeOptions, AppThemeName, DEFAULT_FALLBACK_COLOR } from '../context/DisplaySettingsContext';
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
  const [activeTab, setActiveTab] = useState<'account' | 'api' | 'display' | 'data' | 'etiquette' | 'admin'>('account');
  const [apiSubTab, setApiSubTab] = useState<'keys' | 'security' | 'docs'>('keys');

  // Password change state
  const [currentPasswordField, setCurrentPasswordField] = useState('');
  const [newPasswordField, setNewPasswordField] = useState('');
  const [confirmPasswordField, setConfirmPasswordField] = useState('');
  const [passwordNotice, setPasswordNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
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

  // Admin state
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string; is_admin: boolean } | null>(null);
  const [adminUsers, setAdminUsers] = useState<{ id: string; username: string; email: string | null; is_admin: number; created_at: string }[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [adminNotice, setAdminNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<{ id: string; username: string } | null>(null);
  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [adminUsersPage, setAdminUsersPage] = useState(1);
  const ADMIN_USERS_PER_PAGE = 10;
  const {
    settings: displaySettings,
    updateSettings: updateDisplaySettings,
    setSubGoalColor,
    resetSubGoalColors,
    computedColors,
    createCustomPalette,
    deleteCustomPalette,
  } = useDisplaySettings();
  const [customCSSLocal, setCustomCSSLocal] = useState(displaySettings.customCSS || '');
  const customCSSTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const handleCustomCSSChange = useCallback((value: string) => {
    setCustomCSSLocal(value);
    clearTimeout(customCSSTimerRef.current);
    customCSSTimerRef.current = setTimeout(() => {
      updateDisplaySettings({ customCSS: value });
    }, 500);
  }, [updateDisplaySettings]);
  const loadTemplate = useCallback(async () => {
    try {
      const res = await fetch('/theme-template.css');
      const text = await res.text();
      setCustomCSSLocal(text);
      updateDisplaySettings({ customCSS: text });
    } catch {
      // template fetch failed, ignore
    }
  }, [updateDisplaySettings]);
  const customPaletteNameRef = useRef<HTMLInputElement>(null);
  const previewBaseColor = computedColors[1] || DEFAULT_FALLBACK_COLOR;
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

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordNotice(null);
    if (newPasswordField !== confirmPasswordField) {
      setPasswordNotice({ type: 'error', message: t('account.passwordsDoNotMatch') });
      return;
    }
    if (newPasswordField.length < 6) {
      setPasswordNotice({ type: 'error', message: t('account.passwordMinLength') });
      return;
    }
    try {
      setChangingPassword(true);
      await api.changePassword(currentPasswordField, newPasswordField);
      setPasswordNotice({ type: 'success', message: t('account.passwordChanged') });
      setCurrentPasswordField('');
      setNewPasswordField('');
      setConfirmPasswordField('');
    } catch (err) {
      setPasswordNotice({ type: 'error', message: (err as Error).message });
    } finally {
      setChangingPassword(false);
    }
  };

  useEffect(() => {
    loadKeys();
    loadSettings();
    loadCurrentUser();
  }, []);

  useEffect(() => {
    if (activeTab === 'data' && goalSummaries.length === 0 && !goalsLoading) {
      fetchGoalSummaries();
    }
    if (activeTab === 'etiquette' && etiquetteRules.length === 0 && !etiquetteLoading) {
      loadEtiquette();
    }
    if (activeTab === 'admin' && adminUsers.length === 0 && !adminLoading && currentUser?.is_admin) {
      loadAdminUsers();
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

  // Admin functions
  const loadCurrentUser = async () => {
    try {
      const response = await fetch(`${API_URL}/api/auth/me`, { credentials: 'include' });
      const data = await response.json();
      if (data.success) {
        setCurrentUser(data.data);
      }
    } catch {}
  };

  const loadAdminUsers = async () => {
    try {
      setAdminLoading(true);
      const response = await fetch(`${API_URL}/api/admin/users`, { credentials: 'include' });
      const data = await response.json();
      if (data.success) {
        setAdminUsers(data.data);
      }
    } catch (err) {
      setAdminNotice({ type: 'error', message: (err as Error).message });
    } finally {
      setAdminLoading(false);
    }
  };

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    setAdminNotice(null);
    try {
      const response = await fetch(`${API_URL}/api/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: newUsername, password: newPassword, email: newEmail || undefined, is_admin: newIsAdmin }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error);
      setAdminNotice({ type: 'success', message: t('admin.userCreated') });
      setNewUsername(''); setNewPassword(''); setNewEmail(''); setNewIsAdmin(false); setShowCreateUser(false);
      loadAdminUsers();
    } catch (err) {
      setAdminNotice({ type: 'error', message: (err as Error).message });
    }
  };

  const handleToggleAdmin = async (userId: string, makeAdmin: boolean) => {
    setAdminNotice(null);
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_admin: makeAdmin }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error);
      loadAdminUsers();
    } catch (err) {
      setAdminNotice({ type: 'error', message: (err as Error).message });
    }
  };

  const handleResetPassword = async () => {
    if (!resetPasswordUserId || !resetPasswordValue) return;
    setAdminNotice(null);
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${resetPasswordUserId}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password: resetPasswordValue }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error);
      setAdminNotice({ type: 'success', message: t('admin.passwordReset') });
      setResetPasswordUserId(null); setResetPasswordValue('');
    } catch (err) {
      setAdminNotice({ type: 'error', message: (err as Error).message });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setAdminNotice(null);
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error);
      setAdminNotice({ type: 'success', message: t('admin.userDeleted') });
      setConfirmDeleteUserId(null);
      loadAdminUsers();
    } catch (err) {
      setAdminNotice({ type: 'error', message: (err as Error).message });
    }
  };

  const paginatedAdminUsers = adminUsers.slice(
    (adminUsersPage - 1) * ADMIN_USERS_PER_PAGE,
    adminUsersPage * ADMIN_USERS_PER_PAGE
  );
  const adminTotalPages = Math.max(1, Math.ceil(adminUsers.length / ADMIN_USERS_PER_PAGE));

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
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <header className="mb-8">
          <button
            type="button"
            onClick={handleBackClick}
            className="text-blue-600 hover:underline mb-2 inline-block"
          >
            {backLabel}
          </button>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100">{t('settings.title')}</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            {t('settings.subtitle')}
          </p>
        </header>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setActiveTab('account')}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              activeTab === 'account'
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {t('account.tabAccount')}
          </button>
          <button
            onClick={() => setActiveTab('api')}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              activeTab === 'api'
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {t('settings.tabApi')}
          </button>
          <button
            onClick={() => setActiveTab('display')}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              activeTab === 'display'
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {t('settings.tabDisplay')}
          </button>
          <button
            onClick={() => setActiveTab('data')}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              activeTab === 'data'
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {t('settings.tabData')}
          </button>
          <button
            onClick={() => setActiveTab('etiquette')}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              activeTab === 'etiquette'
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {t('settings.tabEtiquette')}
          </button>
          {currentUser?.is_admin && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                activeTab === 'admin'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {t('admin.tabAdmin')}
            </button>
          )}
        </div>

        {error && (
          <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-400 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {activeTab === 'account' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-semibold mb-2">{t('account.changePassword')}</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">{t('account.changePasswordDesc')}</p>
            {passwordNotice && (
              <div className={`px-4 py-3 rounded mb-4 ${
                passwordNotice.type === 'success'
                  ? 'bg-green-100 dark:bg-green-900/30 border border-green-400 text-green-700 dark:text-green-400'
                  : 'bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-400'
              }`}>
                {passwordNotice.message}
              </div>
            )}
            <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('account.currentPassword')}</label>
                <input type="password" value={currentPasswordField} onChange={e => setCurrentPasswordField(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('account.newPassword')}</label>
                <input type="password" value={newPasswordField} onChange={e => setNewPasswordField(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100" required minLength={6} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('account.confirmPassword')}</label>
                <input type="password" value={confirmPasswordField} onChange={e => setConfirmPasswordField(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100" required minLength={6} />
              </div>
              <button type="submit" disabled={changingPassword}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
                {changingPassword ? t('common.saving') : t('account.changePasswordButton')}
              </button>
            </form>
          </div>
        )}

        {activeTab === 'api' && (
          <>
            {/* Sub-tabs */}
            <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
              {(['keys', 'security', 'docs'] as const).map((sub) => (
                <button
                  key={sub}
                  onClick={() => setApiSubTab(sub)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    apiSubTab === sub
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  {sub === 'keys' ? t('settings.subTabKeys') : sub === 'security' ? t('settings.subTabSecurity') : t('settings.subTabDocs')}
                </button>
              ))}
            </div>

            {apiSubTab === 'keys' && (
              <>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
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
                    <p className="text-gray-500 dark:text-gray-400 text-center py-8">{t('common.loading')}</p>
                  ) : keys.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400 text-center py-8">
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
                            className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h3 className="font-semibold text-lg">{key.name}</h3>
                                <div className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
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
                                className="ml-4 px-3 py-1 text-sm text-red-600 dark:text-red-400 hover:text-red-800 border border-red-300 dark:border-red-600 rounded hover:bg-red-50"
                              >
                                {t('common.revoke')}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {keys.length > KEYS_PER_PAGE && (
                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                          <button
                            onClick={() => setKeysPage((p) => Math.max(1, p - 1))}
                            disabled={keysPage === 1}
                            className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:hover:bg-white"
                          >
                            {t('home.prev')}
                          </button>
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {t('settings.pageOf', { page: keysPage, total: Math.ceil(keys.length / KEYS_PER_PAGE) })}
                          </span>
                          <button
                            onClick={() => setKeysPage((p) => Math.min(Math.ceil(keys.length / KEYS_PER_PAGE), p + 1))}
                            disabled={keysPage >= Math.ceil(keys.length / KEYS_PER_PAGE)}
                            className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:hover:bg-white"
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
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                <h3 className="text-lg font-semibold mb-3">{t('settings.security')}</h3>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowQueryParamAuth}
                    onChange={toggleQueryParamAuth}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{t('settings.allowApiKeyInUrl')}</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {t('settings.allowApiKeyInUrlDesc')}<code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{t('settings.apiKeyQueryParam')}</code>{t('settings.allowApiKeyInUrlDescSuffix')}
                    </p>
                  </div>
                </label>
              </div>
            )}

            {apiSubTab === 'docs' && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                <h2 className="text-2xl font-semibold mb-4">{t('settings.apiDocumentation')}</h2>

            <div className="space-y-6">
              {/* Overview */}
              <section>
                <h3 className="text-lg font-semibold mb-2">{t('settings.overview')}</h3>
                <p className="text-gray-700 dark:text-gray-300">
                  The Basys API exposes every goal, sub-goal, action item, log, and guestbook entry so AI agents can coach, summarize, or automate check-ins. The API is RESTful, JSON-only, and every endpoint returns a predictable <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded text-sm">success/data/error</code> envelope.
                </p>
              </section>

              {/* Base URL */}
              <section>
                <h3 className="text-lg font-semibold mb-2">{t('settings.baseUrlHeaders')}</h3>
                <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded text-sm space-y-2">
                  <p><strong>{t('settings.production')}</strong> <code className="bg-white dark:bg-gray-800 px-2 py-1 rounded border dark:border-gray-600">https://harada.jacobstokes.com</code></p>
                  <p><strong>{t('settings.localDev')}</strong> <code className="bg-white dark:bg-gray-800 px-2 py-1 rounded border dark:border-gray-600">http://localhost:3001</code></p>
                  <p>All requests must send <code className="bg-white dark:bg-gray-800 px-2 py-1 rounded border dark:border-gray-600">Content-Type: application/json</code> when a body is present.</p>
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
                <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
                  <li>
                    <strong>Session Cookie:</strong> The web app sets <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">connect.sid</code>. Use it for browser-based integrations.
                  </li>
                  <li>
                    <strong>API Key:</strong> Create keys in the Settings → API Keys tab. Send <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">x-api-key: YOUR_KEY</code> on every request. Keys inherit the same permissions as your user.
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
                    <div key={item.path + item.method} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 h-full">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs font-semibold px-2 py-1 rounded ${item.method === 'GET' ? 'bg-green-600 text-white' : 'bg-blue-600 text-white'}`}>
                          {item.method}
                        </span>
                        <code className="text-sm font-mono">{item.path}</code>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{item.text}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* User Summary Options */}
              <section>
                <h3 className="text-lg font-semibold mb-2">{t('settings.summaryParameters')}</h3>
                <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded text-sm space-y-2">
                  <p><code className="bg-white dark:bg-gray-800 px-2 py-1 rounded border dark:border-gray-600">level</code> (default <code>standard</code>)</p>
                  <ul className="list-disc list-inside ml-4 space-y-1 text-gray-700 dark:text-gray-300">
                    <li><strong>minimal:</strong> goal IDs/titles only</li>
                    <li><strong>standard:</strong> full tree plus activity counts</li>
                    <li><strong>detailed:</strong> adds descriptions, timestamps, metadata</li>
                    <li><strong>full:</strong> includes everything above and supports log hydration</li>
                  </ul>
                  <p className="pt-2"><code className="bg-white dark:bg-gray-800 px-2 py-1 rounded border dark:border-gray-600">include_logs=true</code> → attach up to 10 recent logs per action (only honored when <code>level=full</code>).</p>
                  <p><code className="bg-white dark:bg-gray-800 px-2 py-1 rounded border dark:border-gray-600">include_guestbook=true</code> → embed user, goal, and sub-goal guestbook comments inline.</p>
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
                <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded space-y-2 text-sm">
                  <p><strong>Primary Goal</strong> → 8 <strong>Sub-Goals</strong> → 8 <strong>Action Items</strong> (64 actions per goal).</p>
                  <p><strong>Activity Logs</strong> capture continuous progress—no "done" checkbox exists.</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
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
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  HTTP status codes follow standards (200 success, 400 validation errors, 401 auth failures, 500 server issues). Retry cautiously on 500s only.
                </p>
              </section>

              {/* Example Workflows */}
              <section>
                <h3 className="text-lg font-semibold mb-2">{t('settings.suggestedAgentWorkflow')}</h3>
                <ol className="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300">
                  <li>Call <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">GET /api/user/summary?level=detailed</code> once per run to build context.</li>
                  <li>Deep dive on neglected actions via <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">GET /api/logs/action/:actionId</code>.</li>
                  <li>Post insights or reminders through <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">POST /api/guestbook</code>.</li>
                  <li>Record new work by logging activity with metrics for each finished session.</li>
                </ol>
              </section>
            </div>
          </div>
            )}
          </>
        )}

        {activeTab === 'display' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 space-y-8">
            <div>
              <h2 className="text-2xl font-semibold mb-2">{t('settings.displayPreferences')}</h2>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                {t('settings.displayPreferencesDesc')}
              </p>
            </div>

            {/* Default View */}
            <section>
              <h3 className="text-lg font-semibold mb-2">{t('settings.defaultGoalView')}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                {t('settings.defaultGoalViewDesc')}
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                {(['list', 'compact', 'full'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => updateDisplaySettings({ defaultView: mode })}
                    className={`flex-1 border rounded-lg px-4 py-3 text-left transition-colors ${
                      displaySettings.defaultView === mode
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'
                    }`}
                  >
                    <div className="font-medium capitalize">{mode}{t('settings.viewSuffix')}</div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {mode === 'list'
                        ? t('settings.listViewDesc')
                        : mode === 'compact'
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
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
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
                        : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'
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
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
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
                        : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'
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
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
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
                        : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </section>

            {/* App Theme */}
            <section>
              <h3 className="text-lg font-semibold mb-2">App Theme</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Controls the overall look and feel — fonts, backgrounds, and default grid colors.
              </p>
              <div className="grid md:grid-cols-3 gap-4">
                {Object.entries(appThemeOptions).map(([name, option]) => {
                  const themeName = name as AppThemeName;
                  return (
                    <button
                      key={name}
                      onClick={() => updateDisplaySettings({ appTheme: themeName })}
                      className={`border rounded-lg p-4 text-left transition-colors ${
                        displaySettings.appTheme === themeName
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-blue-200'
                      }`}
                    >
                      <div className="font-semibold mb-1">{option.label}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">{option.description}</div>
                    </button>
                  );
                })}
              </div>

              {/* Custom CSS editor — shown when custom-theme is selected */}
              {displaySettings.appTheme === 'custom-theme' && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={loadTemplate}
                      className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      Load Template
                    </button>
                    <a
                      href="/theme-template.css"
                      download
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Download template file
                    </a>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Write CSS scoped under <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">.custom-theme</code>.
                    Use the template for a list of all available selectors. Changes apply live.
                  </p>
                  <textarea
                    value={customCSSLocal}
                    onChange={(e) => handleCustomCSSChange(e.target.value)}
                    spellCheck={false}
                    rows={20}
                    className="w-full font-mono text-xs border border-gray-300 dark:border-gray-600 rounded-lg p-3 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="/* Paste or write your custom CSS here */&#10;.custom-theme .bg-blue-600 {&#10;  background-color: #7c3238 !important;&#10;}"
                  />
                </div>
              )}
            </section>

            {/* Dark Mode */}
            <section>
              <h3 className="text-lg font-semibold mb-2">{t('settings.darkMode')}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t('settings.darkModeDesc')}</p>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={displaySettings.darkMode}
                  onChange={(e) => updateDisplaySettings({ darkMode: e.target.checked })}
                  className="w-5 h-5 rounded"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('settings.enableDarkMode')}
                </span>
              </label>
            </section>

            {/* Header Branding */}
            <section>
              <h3 className="text-lg font-semibold mb-2">{t('settings.headerBranding')}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t('settings.headerBrandingDesc')}</p>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={displaySettings.showHeaderBranding}
                  onChange={(e) => updateDisplaySettings({ showHeaderBranding: e.target.checked })}
                  className="w-5 h-5 rounded"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('settings.showHeaderBranding')}
                </span>
              </label>
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
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                {t('settings.colorPaletteDesc')}
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                {Object.entries(getAllPalettes(displaySettings.customPalettes)).map(([name, option]) => (
                  <div
                    key={name}
                    className={`border rounded-lg p-4 text-left transition-colors relative ${
                      displaySettings.palette === name
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-blue-200'
                    }`}
                  >
                    <button
                      className="w-full text-left"
                      onClick={() => updateDisplaySettings({ palette: name, customSubGoalColors: {} })}
                    >
                      <div className="font-semibold mb-2">{option.label}</div>
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
                    {!option.builtIn && (
                      <button
                        onClick={() => deleteCustomPalette(name)}
                        className="absolute top-2 right-2 text-xs text-red-500 hover:text-red-700"
                      >
                        {t('common.delete')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {/* Save Custom Palette */}
              <div className="mt-4 border rounded-lg p-4 border-dashed border-gray-300 dark:border-gray-600">
                <h4 className="text-sm font-semibold mb-2">{t('settings.saveCustomPalette')}</h4>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <input
                      type="text"
                      placeholder={t('settings.paletteName')}
                      ref={customPaletteNameRef}
                      className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                    />
                  </div>
                  <button
                    onClick={() => {
                      const label = customPaletteNameRef.current?.value.trim();
                      if (!label) return;
                      const colors = Array.from({ length: 8 }, (_, i) => computedColors[i + 1] || DEFAULT_FALLBACK_COLOR);
                      createCustomPalette(label, colors);
                      if (customPaletteNameRef.current) customPaletteNameRef.current.value = '';
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                  >
                    {t('settings.save')}
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {t('settings.saveCustomPaletteDesc')}
                </p>
              </div>
            </section>

            {/* Custom Colors */}
            <section>
              <h3 className="text-lg font-semibold mb-2">{t('settings.customSubGoalColors')}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
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
                <label htmlFor="inherit-action-color" className="text-sm text-gray-700 dark:text-gray-300">
                  {t('settings.inheritActionColors')}
                </label>
              </div>
              <div className="mt-4">
                <label className="text-sm text-gray-600 dark:text-gray-400 flex justify-between">
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
                <div className="mt-3 flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
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
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
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
                        : 'border-gray-200 dark:border-gray-700 hover:border-blue-200'
                    }`}
                  >
                    <div className="font-semibold">{layoutOption.title}</div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{layoutOption.description}</p>
                  </button>
                ))}
              </div>
            </section>

            {/* Center Background */}
            <section>
              <h3 className="text-lg font-semibold mb-2">{t('settings.centerBackground')}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
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
                        : 'border-gray-200 dark:border-gray-700 hover:border-blue-200'
                    }`}
                  >
                    <div className="font-medium">{option.title}</div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{option.description}</p>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'data' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 space-y-8">
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
                <p className="text-sm text-gray-600 dark:text-gray-400">
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
                <div className="border dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-700 max-h-64 overflow-y-auto text-sm">
                  {goalsLoading ? (
                    <p className="text-gray-500 dark:text-gray-400">{t('settings.loadingGoals')}</p>
                  ) : goalSummaries.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400">{t('settings.noGoalsAvailable')}</p>
                  ) : (
                    goalSummaries.map((goal) => (
                      <label key={goal.id} className="flex items-center gap-3 py-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedGoalIds.includes(goal.id)}
                          onChange={() => toggleGoalSelection(goal.id)}
                        />
                        <div>
                          <div className="font-medium text-gray-800 dark:text-gray-200">{goal.title}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
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
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t('settings.importGoalsDesc')}
                </p>
              </div>
              <label
                htmlFor="goal-import-input"
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 w-fit"
              >
                <svg className="h-5 w-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
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
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('settings.importTip')}
              </p>
            </section>
          </div>
        )}

        {activeTab === 'etiquette' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('settings.agentEtiquetteRules')}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {t('settings.agentEtiquetteDesc')}
                </p>
              </div>
              <button
                onClick={() => setConfirmResetEtiquette(true)}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {t('settings.resetToDefaults')}
              </button>
            </div>

            {etiquetteLoading ? (
              <p className="text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
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
                          className="flex-1 px-3 py-2 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm dark:bg-gray-700 dark:text-gray-100"
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
                          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 rounded text-sm text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                          {rule.content}
                          {rule.is_default ? (
                            <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{t('settings.defaultBadge')}</span>
                          ) : null}
                        </div>
                        <button
                          onClick={() => { setEditingEtiquetteId(rule.id); setEditingEtiquetteContent(rule.content); }}
                          className="px-2 py-2 text-gray-400 dark:text-gray-500 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity text-sm"
                          title={t('common.edit')}
                        >
                          {t('common.edit')}
                        </button>
                        <button
                          onClick={() => handleDeleteEtiquette(rule.id)}
                          className="px-2 py-2 text-gray-400 dark:text-gray-500 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity text-sm"
                          title={t('common.remove')}
                        >
                          {t('common.remove')}
                        </button>
                      </>
                    )}
                  </div>
                ))}

                {/* Add new rule */}
                <div className="flex gap-2 pt-3 border-t dark:border-gray-700 mt-3">
                  <input
                    type="text"
                    value={newEtiquetteContent}
                    onChange={(e) => setNewEtiquetteContent(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddEtiquette(); }}
                    placeholder={t('settings.addEtiquettePlaceholder')}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm dark:bg-gray-700 dark:text-gray-100"
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

      {/* Admin Tab */}
        {activeTab === 'admin' && currentUser?.is_admin && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">{t('admin.userManagement')}</h2>
              <button
                onClick={() => setShowCreateUser(!showCreateUser)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                {showCreateUser ? t('common.cancel') : t('admin.createUser')}
              </button>
            </div>

            {adminNotice && (
              <div className={`px-4 py-3 rounded text-sm ${
                adminNotice.type === 'success' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-400 dark:border-red-600'
              }`}>
                {adminNotice.message}
              </div>
            )}

            {/* Create User Form */}
            {showCreateUser && (
              <form onSubmit={handleCreateUser} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('admin.username')}</label>
                    <input
                      type="text"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      required
                      minLength={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('admin.password')}</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('admin.email')} ({t('common.optional')})</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="newIsAdmin"
                    checked={newIsAdmin}
                    onChange={(e) => setNewIsAdmin(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="newIsAdmin" className="text-sm text-gray-700 dark:text-gray-300">{t('admin.grantAdmin')}</label>
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  {t('admin.createUser')}
                </button>
              </form>
            )}

            {/* User List */}
            {adminLoading ? (
              <p className="text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
                      <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('admin.username')}</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('admin.email')}</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('admin.role')}</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('admin.created')}</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('admin.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedAdminUsers.map((user) => (
                      <tr key={user.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-4 py-3 font-medium">
                          {user.username}
                          {user.id === currentUser?.id && (
                            <span className="ml-2 text-xs text-blue-600">({t('admin.you')})</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{user.email || '—'}</td>
                        <td className="px-4 py-3">
                          {user.is_admin ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                              {t('admin.adminBadge')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                              {t('admin.userBadge')}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{new Date(user.created_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => handleToggleAdmin(user.id, !user.is_admin)}
                              disabled={user.id === currentUser?.id}
                              className="text-xs px-2 py-1 border dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {user.is_admin ? t('admin.removeAdmin') : t('admin.makeAdmin')}
                            </button>
                            <button
                              onClick={() => { setResetPasswordUserId(user.id); setResetPasswordValue(''); }}
                              className="text-xs px-2 py-1 border dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 text-amber-600"
                            >
                              {t('admin.resetPassword')}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteUserId({ id: user.id, username: user.username })}
                              disabled={user.id === currentUser?.id}
                              className="text-xs px-2 py-1 border dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 text-red-600 dark:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {t('common.delete')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Admin Users Pagination */}
                {adminTotalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t dark:border-gray-700">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {t('admin.showingRange', {
                        start: (adminUsersPage - 1) * ADMIN_USERS_PER_PAGE + 1,
                        end: Math.min(adminUsersPage * ADMIN_USERS_PER_PAGE, adminUsers.length),
                        total: adminUsers.length,
                      })}
                    </p>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setAdminUsersPage(p => Math.max(1, p - 1))}
                        disabled={adminUsersPage === 1}
                        className="px-3 py-1 text-sm border dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {t('home.prev')}
                      </button>
                      <button
                        onClick={() => setAdminUsersPage(p => Math.min(adminTotalPages, p + 1))}
                        disabled={adminUsersPage === adminTotalPages}
                        className="px-3 py-1 text-sm border dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {t('home.next')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      {/* Reset Password Modal */}
      {resetPasswordUserId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold mb-4">{t('admin.resetPassword')}</h3>
            <input
              type="password"
              value={resetPasswordValue}
              onChange={(e) => setResetPasswordValue(e.target.value)}
              placeholder={t('admin.newPassword')}
              minLength={6}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setResetPasswordUserId(null)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 border dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700">
                {t('common.cancel')}
              </button>
              <button
                onClick={handleResetPassword}
                disabled={resetPasswordValue.length < 6}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {t('admin.resetPassword')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete User Modal */}
      {confirmDeleteUserId && (
        <ConfirmModal
          title={t('admin.deleteUserTitle')}
          message={t('admin.deleteUserMessage', { username: confirmDeleteUserId.username })}
          confirmLabel={t('common.delete')}
          onConfirm={() => handleDeleteUser(confirmDeleteUserId.id)}
          onCancel={() => setConfirmDeleteUserId(null)}
        />
      )}

      {/* Create Key Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6 border-b dark:border-gray-700">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('settings.createApiKey')}</h2>
            </div>

            <form onSubmit={handleCreateKey} className="p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('settings.keyName')}
                </label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder={t('settings.keyNamePlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                  required
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('settings.expiresInDays')}
                </label>
                <input
                  type="number"
                  value={newKeyExpireDays}
                  onChange={(e) => setNewKeyExpireDays(e.target.value)}
                  min="1"
                  max="3650"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                  required
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
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
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
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
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full">
            <div className="p-6 border-b dark:border-gray-700">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('settings.apiKeyCreated')}</h2>
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

            <div className="p-6 border-t dark:border-gray-700">
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
