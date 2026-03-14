import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { STATUS_COLORS, formatDuration, formatCost, formatTokens } from '../utils/agentActions';
import AgentActionModal from './AgentActionModal';

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
type ViewMode = 'flat' | 'grouped';

export default function AgentsDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [viewMode, setViewMode] = useState<ViewMode>('flat');
  const [actionModal, setActionModal] = useState<{ taskId: string; taskTitle: string } | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const loadData = async () => {
    setLoading(true);
    try {
      const params: any = { limit: 200 };
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

  const handleStage = async (action: any) => {
    try {
      await api.updateAgentActionStatus(action.task_id, action.id, { status: 'staged' });
      loadData();
    } catch (err: any) { alert(err.message || 'Failed to stage'); }
  };

  const handleDelete = async (action: any) => {
    try {
      await api.deleteAgentAction(action.task_id, action.id);
      loadData();
    } catch (err: any) { alert(err.message || 'Failed to delete'); }
  };

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

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

  // Build grouped structure: project -> sprint -> task -> actions
  const buildGrouped = () => {
    const groups: Record<string, {
      project: { id: string; title: string; color: string };
      sprints: Record<string, {
        sprint: { id: string; title: string };
        tasks: Record<string, {
          task: { id: string; title: string };
          actions: any[];
        }>;
      }>;
    }> = {};

    for (const action of actions) {
      const projId = action.project_id || '__none';
      const projTitle = action.project_title || 'No Project';
      const projColor = action.project_color || '#6b7280';
      const sprintId = action.sprint_id || '__none';
      const sprintTitle = action.sprint_title || 'No Sprint';
      const taskId = action.task_id;
      const taskTitle = action.task_title || 'Unknown Task';

      if (!groups[projId]) {
        groups[projId] = { project: { id: projId, title: projTitle, color: projColor }, sprints: {} };
      }
      if (!groups[projId].sprints[sprintId]) {
        groups[projId].sprints[sprintId] = { sprint: { id: sprintId, title: sprintTitle }, tasks: {} };
      }
      if (!groups[projId].sprints[sprintId].tasks[taskId]) {
        groups[projId].sprints[sprintId].tasks[taskId] = { task: { id: taskId, title: taskTitle }, actions: [] };
      }
      groups[projId].sprints[sprintId].tasks[taskId].actions.push(action);
    }
    return groups;
  };

  const ActionRow = ({ action, indent = 0 }: { action: any; indent?: number }) => (
    <tr
      className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer group"
      onClick={() => setActionModal({ taskId: action.task_id, taskTitle: action.task_title || 'Task' })}
    >
      <td className="px-3 py-2 text-gray-900 dark:text-gray-100 max-w-[250px] truncate" style={{ paddingLeft: `${12 + indent * 16}px` }}>
        {action.title}
      </td>
      {viewMode === 'flat' && (
        <>
          <td className="px-3 py-2 text-gray-500 dark:text-gray-400 max-w-[150px] truncate">{action.task_title || '—'}</td>
          <td className="px-3 py-2">
            {action.project_title ? (
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: action.project_color || '#6b7280' }} />
                <span className="text-gray-500 dark:text-gray-400 truncate max-w-[120px]">{action.project_title}</span>
              </span>
            ) : '—'}
          </td>
        </>
      )}
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
      <td className="px-2 py-2 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
          {action.status === 'draft' && (
            <>
              <button
                onClick={() => handleStage(action)}
                className="text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-600 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-400 dark:hover:bg-blue-900/60 font-medium"
                title="Stage this action"
              >
                Stage
              </button>
              <button
                onClick={() => handleDelete(action)}
                className="p-0.5 text-gray-300 hover:text-red-500"
                title="Delete"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );

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

      {/* Filters + View Toggle */}
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

        {/* View toggle */}
        <div className="flex rounded border border-gray-300 dark:border-gray-600 overflow-hidden ml-2">
          <button onClick={() => setViewMode('flat')}
            className={`px-2 py-1 text-xs transition-colors ${viewMode === 'flat' ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800' : 'bg-white dark:bg-gray-800 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
            title="Flat list">
            List
          </button>
          <button onClick={() => setViewMode('grouped')}
            className={`px-2 py-1 text-xs transition-colors ${viewMode === 'grouped' ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800' : 'bg-white dark:bg-gray-800 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
            title="Grouped by project/sprint/task">
            Grouped
          </button>
        </div>

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
                  {viewMode === 'flat' && (
                    <>
                      <th className="text-left px-3 py-2 font-medium">Task</th>
                      <th className="text-left px-3 py-2 font-medium">Project</th>
                    </>
                  )}
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-left px-3 py-2 font-medium">Model</th>
                  <th className="text-right px-3 py-2 font-medium">Cost</th>
                  <th className="text-right px-3 py-2 font-medium">Duration</th>
                  <th className="text-right px-3 py-2 font-medium">Date</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody>
                {viewMode === 'flat' ? (
                  actions.map(action => <ActionRow key={action.id} action={action} />)
                ) : (
                  Object.entries(buildGrouped()).map(([projId, projGroup]) => {
                    const projKey = `proj-${projId}`;
                    const projCollapsed = collapsedGroups.has(projKey);
                    const colSpan = 7;
                    return [
                      <tr key={projKey} className="bg-gray-50 dark:bg-gray-800/80 cursor-pointer" onClick={() => toggleGroup(projKey)}>
                        <td colSpan={colSpan} className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <svg className={`w-3 h-3 text-gray-400 transition-transform ${projCollapsed ? '' : 'rotate-90'}`} fill="currentColor" viewBox="0 0 24 24"><path d="M10 6l6 6-6 6z" /></svg>
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: projGroup.project.color }} />
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{projGroup.project.title}</span>
                          </div>
                        </td>
                      </tr>,
                      ...(!projCollapsed ? Object.entries(projGroup.sprints).flatMap(([sprintId, sprintGroup]) => {
                        const sprintKey = `sprint-${projId}-${sprintId}`;
                        const sprintCollapsed = collapsedGroups.has(sprintKey);
                        return [
                          <tr key={sprintKey} className="bg-gray-50/50 dark:bg-gray-800/40 cursor-pointer" onClick={() => toggleGroup(sprintKey)}>
                            <td colSpan={colSpan} className="px-3 py-1.5" style={{ paddingLeft: '28px' }}>
                              <div className="flex items-center gap-2">
                                <svg className={`w-3 h-3 text-gray-400 transition-transform ${sprintCollapsed ? '' : 'rotate-90'}`} fill="currentColor" viewBox="0 0 24 24"><path d="M10 6l6 6-6 6z" /></svg>
                                <span className="text-xs text-gray-500 dark:text-gray-400">{sprintGroup.sprint.title}</span>
                              </div>
                            </td>
                          </tr>,
                          ...(!sprintCollapsed ? Object.entries(sprintGroup.tasks).flatMap(([taskId, taskGroup]) => {
                            const taskKey = `task-${projId}-${sprintId}-${taskId}`;
                            const taskCollapsed = collapsedGroups.has(taskKey);
                            return [
                              <tr key={taskKey} className="cursor-pointer" onClick={() => toggleGroup(taskKey)}>
                                <td colSpan={colSpan} className="px-3 py-1.5" style={{ paddingLeft: '44px' }}>
                                  <div className="flex items-center gap-2">
                                    <svg className={`w-3 h-3 text-gray-400 transition-transform ${taskCollapsed ? '' : 'rotate-90'}`} fill="currentColor" viewBox="0 0 24 24"><path d="M10 6l6 6-6 6z" /></svg>
                                    <span className="text-xs text-gray-600 dark:text-gray-300">{taskGroup.task.title}</span>
                                    <span className="text-[10px] text-gray-400">({taskGroup.actions.length})</span>
                                  </div>
                                </td>
                              </tr>,
                              ...(!taskCollapsed ? taskGroup.actions.map(action =>
                                <ActionRow key={action.id} action={action} indent={3} />
                              ) : []),
                            ];
                          }) : []),
                        ];
                      }) : []),
                    ];
                  }).flat()
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Agent Action Modal */}
      {actionModal && (
        <AgentActionModal
          taskId={actionModal.taskId}
          taskTitle={actionModal.taskTitle}
          onClose={() => { setActionModal(null); loadData(); }}
        />
      )}
    </div>
  );
}
