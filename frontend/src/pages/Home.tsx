import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { api, API_URL } from '../api/client';

interface Goal {
  id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
}

export default function Home() {
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
  const navigate = useNavigate();
  const location = useLocation();

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
    if (!confirm('Delete this goal?')) return;

    try {
      await api.deleteGoal(id);
      loadGoals();
    } catch (err) {
      setError((err as Error).message);
    }
  };

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
    if (format === 'json') {
      return `${API_URL}/api/agents/brief?apiKey=${encodeURIComponent(pastedApiKey)}`;
    }
    const baseUrl = window.location.origin;
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
        throw new Error(data.error || 'Failed to create API key');
      }
      const key = data.data?.key;
      setPastedApiKey(key || '');
      setAgentKeyNotice({ type: 'success', message: 'New API key generated. Copy and store it securely.' });
    } catch (err) {
      setAgentKeyNotice({ type: 'error', message: (err as Error).message });
    } finally {
      setCreatingAgentKey(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto px-4 py-8">
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <svg width="64" height="64" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
              <rect x="0" y="0" width="100" height="100" fill="hsl(0, 100%, 75%)" stroke="white" strokeWidth="2"/>
              <rect x="100" y="0" width="100" height="100" fill="hsl(30, 100%, 75%)" stroke="white" strokeWidth="2"/>
              <rect x="200" y="0" width="100" height="100" fill="hsl(60, 100%, 75%)" stroke="white" strokeWidth="2"/>
              <rect x="0" y="100" width="100" height="100" fill="hsl(120, 100%, 75%)" stroke="white" strokeWidth="2"/>
              <rect x="100" y="100" width="100" height="100" fill="hsl(180, 100%, 75%)" stroke="white" strokeWidth="2"/>
              <rect x="200" y="100" width="100" height="100" fill="hsl(210, 100%, 75%)" stroke="white" strokeWidth="2"/>
              <rect x="0" y="200" width="100" height="100" fill="hsl(240, 100%, 75%)" stroke="white" strokeWidth="2"/>
              <rect x="100" y="200" width="100" height="100" fill="hsl(270, 100%, 75%)" stroke="white" strokeWidth="2"/>
              <rect x="200" y="200" width="100" height="100" fill="hsl(300, 100%, 75%)" stroke="white" strokeWidth="2"/>
            </svg>
            <div>
              <h1 className="text-4xl font-bold text-gray-900">xharada</h1>
              <p className="text-gray-600 mt-2">Your Goal Planning System</p>
            </div>
          </div>
          <div className="flex gap-3 flex-wrap justify-end">
            <button
              onClick={handleOpenAgentDialog}
              className="px-4 py-2 text-sm text-blue-600 hover:text-blue-900 border border-blue-200 rounded hover:bg-blue-50"
            >
              Agent Landing
            </button>
            <Link
              to="/settings"
              state={{ from: location.pathname }}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded hover:bg-gray-100"
            >
              Settings
            </Link>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded hover:bg-gray-100"
            >
              Logout
            </button>
          </div>
        </header>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4">Create New Goal</h2>
          <form onSubmit={handleCreateGoal} className="flex gap-4">
            <input
              type="text"
              value={newGoalTitle}
              onChange={(e) => setNewGoalTitle(e.target.value)}
              placeholder="Enter goal title..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Create Goal
            </button>
          </form>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-semibold mb-4">Your Goals</h2>

          {loading ? (
            <p className="text-gray-500">Loading goals...</p>
          ) : goals.length === 0 ? (
            <p className="text-gray-500">No goals yet. Create your first goal above!</p>
          ) : (
            <div className="grid gap-4">
              {goals.map((goal) => (
                <div
                  key={goal.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold text-gray-900">{goal.title}</h3>
                      {goal.description && (
                        <p className="text-gray-600 mt-1">{goal.description}</p>
                      )}
                      <div className="flex gap-4 mt-2 text-sm text-gray-500">
                        <span className="capitalize">Status: {goal.status}</span>
                        <span>Created: {new Date(goal.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link
                        to={`/goal/${goal.id}`}
                        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-sm"
                      >
                        View Grid
                      </Link>
                      <button
                        onClick={() => handleDeleteGoal(goal.id)}
                        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Agent Landing Dialog */}
      {showAgentDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-900">Agent Landing Page</h2>
              <button
                onClick={() => setShowAgentDialog(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Paste Your API Key
                </label>
                <input
                  type="text"
                  value={pastedApiKey}
                  onChange={(e) => setPastedApiKey(e.target.value)}
                  placeholder="Paste your API key here..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    {creatingAgentKey ? 'Generating…' : 'Generate API Key'}
                  </button>
                  <Link
                    to="/settings"
                    className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                    onClick={() => setShowAgentDialog(false)}
                  >
                    Manage Keys in Settings
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Agent Landing URL
                    </label>
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={getAgentLandingUrl()}
                          readOnly
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                        />
                        <button
                          onClick={handleCopyUrl}
                          className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap"
                        >
                          {copied ? '✓ Copied!' : 'Copy'}
                        </button>
                      </div>
                      {allowQueryParamAuth && (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={getAgentLandingUrl('json')}
                            readOnly
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                          />
                          <button
                            onClick={() => {
                              const url = getAgentLandingUrl('json');
                              navigator.clipboard.writeText(url);
                            }}
                            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap"
                          >
                            Copy JSON URL
                          </button>
                        </div>
                      )}
                    </div>
                    {allowQueryParamAuth ? (
                      <>
                        <p className="text-xs text-gray-500 mt-2">
                          Share the UI link with browser-based agents. The JSON link returns raw API data directly — works with CLI agents, MCP, curl, etc.
                        </p>
                        <p className="text-xs text-amber-600 mt-1">
                          ⚠️ These URLs contain your API key. Only share them with trusted agents — anyone with the link can read and modify your goals.
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-gray-500 mt-2">
                        JSON URL sharing is disabled. Enable "Allow API key in URL" in <Link to="/settings" className="text-blue-600 underline" onClick={() => setShowAgentDialog(false)}>Settings</Link> to generate a shareable JSON link.
                      </p>
                    )}
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={handlePreview}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Preview Landing Page
                    </button>
                    <Link
                      to="/settings"
                      onClick={() => setShowAgentDialog(false)}
                      className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-center"
                    >
                      Manage API Keys
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
