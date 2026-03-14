import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { STATUS_COLORS, formatDuration, formatCost, formatTokens } from '../utils/agentActions';

interface DashboardData {
  actions: any[];
  stats: {
    total: number; done: number; failed: number; running: number; staged: number; draft: number;
    total_cost_cents: number; total_tokens_in: number; total_tokens_out: number;
    avg_duration_seconds: number | null;
  };
  models: string[];
  projects: { id: string; title: string; hex_color: string }[];
}

type DateRange = '7d' | '30d' | '90d' | 'all';

export default function AgentsDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>('30d');

  const loadData = async () => {
    setLoading(true);
    try {
      const params: any = { limit: 100 };
      if (statusFilter) params.status = statusFilter;
      if (projectFilter) params.project_id = projectFilter;
      if (modelFilter) params.agent_model = modelFilter;
      if (dateRange !== 'all') {
        const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
        const from = new Date();
        from.setDate(from.getDate() - days);
        params.date_from = from.toISOString();
      }
      const result = await api.getAgentDashboard(params);
      setData(result);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [statusFilter, projectFilter, modelFilter, dateRange]);

  if (loading && !data) {
    return <div className="p-6 text-gray-400 text-sm">Loading dashboard...</div>;
  }
  if (!data) {
    return <div className="p-6 text-gray-400 text-sm">No data available</div>;
  }

  const { stats, actions, models, projects } = data;
  const successRate = stats.total > 0 ? Math.round(((stats.done) / Math.max(stats.done + stats.failed, 1)) * 100) : 0;
  const avgDuration = stats.avg_duration_seconds
    ? stats.avg_duration_seconds < 60 ? `${Math.round(stats.avg_duration_seconds)}s`
    : `${Math.round(stats.avg_duration_seconds / 60)}m`
    : '—';

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
          <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">Total Actions</div>
          <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mt-1">{stats.total}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">
            {stats.running > 0 && <span className="text-amber-500">{stats.running} running</span>}
            {stats.running > 0 && stats.staged > 0 && ' · '}
            {stats.staged > 0 && <span className="text-blue-500">{stats.staged} staged</span>}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
          <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">Success Rate</div>
          <div className={`text-2xl font-semibold mt-1 ${successRate >= 80 ? 'text-green-600' : successRate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
            {successRate}%
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">{stats.done} done · {stats.failed} failed</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
          <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">Total Cost</div>
          <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mt-1">
            {stats.total_cost_cents > 0 ? formatCost(stats.total_cost_cents) : '$0'}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">
            {formatTokens(stats.total_tokens_in, stats.total_tokens_out) || 'No token data'}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
          <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">Avg Duration</div>
          <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mt-1">{avgDuration}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">{models.length} model{models.length !== 1 ? 's' : ''} used</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="staged">Staged</option>
          <option value="running">Running</option>
          <option value="done">Done</option>
          <option value="failed">Failed</option>
        </select>
        <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
          className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
          <option value="">All projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        {models.length > 0 && (
          <select value={modelFilter} onChange={e => setModelFilter(e.target.value)}
            className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
            <option value="">All models</option>
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
        <div className="flex rounded border border-gray-300 dark:border-gray-600 overflow-hidden ml-auto">
          {(['7d', '30d', '90d', 'all'] as DateRange[]).map(r => (
            <button key={r} onClick={() => setDateRange(r)}
              className={`px-2 py-1 text-xs transition-colors ${dateRange === r ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800' : 'bg-white dark:bg-gray-800 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
              {r === 'all' ? 'All' : r}
            </button>
          ))}
        </div>
      </div>

      {/* Actions Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {actions.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">No agent actions found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  <th className="text-left px-3 py-2 font-medium">Action</th>
                  <th className="text-left px-3 py-2 font-medium">Task</th>
                  <th className="text-left px-3 py-2 font-medium">Project</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-left px-3 py-2 font-medium">Model</th>
                  <th className="text-right px-3 py-2 font-medium">Cost</th>
                  <th className="text-right px-3 py-2 font-medium">Duration</th>
                  <th className="text-right px-3 py-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {actions.map(action => (
                  <tr key={action.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-3 py-2 text-gray-900 dark:text-gray-100 max-w-[200px] truncate">{action.title}</td>
                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400 max-w-[150px] truncate">{action.task_title || '—'}</td>
                    <td className="px-3 py-2">
                      {action.project_title ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: action.project_color || '#6b7280' }} />
                          <span className="text-gray-500 dark:text-gray-400 truncate max-w-[120px]">{action.project_title}</span>
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[action.status]}`}>
                        {action.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-400 text-xs">{action.agent_model || '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-500 text-xs tabular-nums">{action.cost_cents ? formatCost(action.cost_cents) : '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-500 text-xs tabular-nums">{formatDuration(action.started_at, action.completed_at) || '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-400 text-xs whitespace-nowrap">
                      {new Date(action.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
