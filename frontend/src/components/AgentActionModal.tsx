import { useState, useEffect } from 'react';
import { api } from '../api/client';
import {
  AgentActionItem, AgentActionConfig, STATUS_COLORS,
  CONFIG_OPTIONS, MODEL_OPTIONS,
  parseConfig, formatDuration, formatCost, formatTokens, parseFilesChanged,
} from '../utils/agentActions';

interface Props {
  taskId: string;
  taskTitle: string;
  onClose: () => void;
}

export default function AgentActionModal({ taskId, taskTitle, onClose }: Props) {
  const [actions, setActions] = useState<AgentActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [expandedAction, setExpandedAction] = useState<string | null>(null);
  const [editingDesc, setEditingDesc] = useState<string | null>(null);
  const [descDraft, setDescDraft] = useState('');
  const [templates, setTemplates] = useState<any[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    api.getAgentActions(taskId).then(a => { setActions(a); setLoading(false); }).catch(() => setLoading(false));
    api.getActionTemplates().then(setTemplates).catch(() => {});
  }, [taskId]);

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    try {
      const action = await api.createAgentAction(taskId, { title: newTitle.trim() });
      setActions(prev => [...prev, action]);
      setNewTitle('');
    } catch (err) { console.error(err); }
  };

  const handleAddFromTemplate = async (template: any) => {
    try {
      const action = await api.createAgentAction(taskId, { title: template.title, description: template.description || undefined });
      if (template.default_config) {
        const updated = await api.updateAgentAction(taskId, action.id, { config: template.default_config });
        setActions(prev => [...prev, updated]);
      } else {
        setActions(prev => [...prev, action]);
      }
      setShowTemplates(false);
    } catch (err) { console.error(err); }
  };

  const handleToggleStaging = async (action: AgentActionItem) => {
    if (action.status !== 'draft' && action.status !== 'staged') return;
    try {
      const updated = await api.updateAgentActionStatus(taskId, action.id, { status: action.status === 'draft' ? 'staged' : 'draft' });
      setActions(prev => prev.map(a => a.id === action.id ? updated : a));
    } catch (err) { console.error(err); }
  };

  const handleRun = async (action: AgentActionItem) => {
    if (action.status !== 'staged') return;
    if (action.depends_on) {
      const dep = actions.find(a => a.id === action.depends_on);
      if (dep && dep.status !== 'done') { alert(`Blocked by: ${dep.title} (${dep.status})`); return; }
    }
    try {
      const updated = await api.updateAgentActionStatus(taskId, action.id, { status: 'running' });
      setActions(prev => prev.map(a => a.id === action.id ? updated : a));
    } catch (err: any) { alert(err.message || 'Failed'); }
  };

  const handleDelete = async (actionId: string) => {
    try {
      await api.deleteAgentAction(taskId, actionId);
      setActions(prev => prev.filter(a => a.id !== actionId));
    } catch (err) { console.error(err); }
  };

  const handleSaveDesc = async (action: AgentActionItem) => {
    try {
      const updated = await api.updateAgentAction(taskId, action.id, { description: descDraft || null });
      setActions(prev => prev.map(a => a.id === action.id ? updated : a));
      setEditingDesc(null);
    } catch (err) { console.error(err); }
  };

  const handleUpdateConfig = async (action: AgentActionItem, newConfig: AgentActionConfig) => {
    try {
      const updated = await api.updateAgentAction(taskId, action.id, { config: JSON.stringify(newConfig) });
      setActions(prev => prev.map(a => a.id === action.id ? updated : a));
    } catch (err) { console.error(err); }
  };

  const handleSetDependency = async (action: AgentActionItem, dependsOn: string | null) => {
    try {
      const updated = await api.updateAgentAction(taskId, action.id, { depends_on: dependsOn });
      setActions(prev => prev.map(a => a.id === action.id ? updated : a));
    } catch (err) { console.error(err); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
            </svg>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">Agent Actions</h3>
            <span className="text-xs text-gray-400 dark:text-gray-500 truncate">— {taskTitle}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="text-sm text-gray-400 py-4 text-center">Loading...</div>
          ) : actions.length === 0 ? (
            <div className="text-sm text-gray-400 py-8 text-center">No agent actions yet. Add one below.</div>
          ) : (
            <div className="space-y-1.5">
              {actions.map(action => {
                const config = parseConfig(action.config);
                const depAction = action.depends_on ? actions.find(a => a.id === action.depends_on) : null;
                const isBlocked = depAction ? depAction.status !== 'done' : false;
                return (
                  <div key={action.id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 group">
                      {/* Staging checkbox */}
                      {(action.status === 'draft' || action.status === 'staged') && (
                        <button onClick={() => handleToggleStaging(action)}
                          className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                            action.status === 'staged' ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                          }`}>
                          {action.status === 'staged' && (
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          )}
                        </button>
                      )}
                      {action.status === 'running' && <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center"><span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" /></span>}
                      {action.status === 'done' && <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                      {action.status === 'failed' && <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>}

                      {isBlocked && <span className="text-gray-400" title={`Blocked by: ${depAction?.title}`}><svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg></span>}

                      <span className="text-sm flex-1 text-gray-900 dark:text-gray-100 truncate">{action.title}</span>

                      {config.plan_mode && <span className="text-[9px] px-1 py-0.5 rounded bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400">plan</span>}
                      {config.model_override && <span className="text-[9px] px-1 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">{config.model_override}</span>}

                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[action.status]}`}>{action.status}</span>

                      {action.status === 'staged' && (
                        <button onClick={() => handleRun(action)} disabled={isBlocked}
                          className={`p-0.5 ${isBlocked ? 'text-gray-300 cursor-not-allowed' : 'text-green-500 hover:text-green-700'}`} title={isBlocked ? `Blocked by: ${depAction?.title}` : 'Run'}>
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                        </button>
                      )}

                      <button onClick={() => setExpandedAction(expandedAction === action.id ? null : action.id)}
                        className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                        <svg className={`w-3 h-3 transition-transform ${expandedAction === action.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                      </button>

                      {(action.status === 'draft' || action.status === 'staged') && (
                        <button onClick={() => handleDelete(action.id)}
                          className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-0.5">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                    </div>

                    {/* Expanded */}
                    {expandedAction === action.id && (
                      <div className="px-3 pb-3 pt-1 border-t border-gray-100 dark:border-gray-700 space-y-2 bg-gray-50/50 dark:bg-gray-800/50">
                        {editingDesc === action.id ? (
                          <div className="space-y-1">
                            <textarea value={descDraft} onChange={e => setDescDraft(e.target.value)} rows={3} placeholder="Instructions for the agent..."
                              className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-none focus:ring-1 focus:ring-blue-500" />
                            <div className="flex gap-1">
                              <button onClick={() => handleSaveDesc(action)} className="px-2 py-0.5 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
                              <button onClick={() => setEditingDesc(null)} className="px-2 py-0.5 text-[10px] text-gray-500 hover:text-gray-700">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="cursor-pointer" onClick={() => { setEditingDesc(action.id); setDescDraft(action.description || ''); }}>
                            {action.description ? <p className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{action.description}</p>
                              : <p className="text-xs text-gray-400 italic">Click to add instructions...</p>}
                          </div>
                        )}

                        {(action.status === 'draft' || action.status === 'staged') && (
                          <>
                            <div className="space-y-1.5">
                              <span className="text-[10px] text-gray-400 uppercase tracking-wider">Config</span>
                              <div className="grid grid-cols-2 gap-1.5">
                                {CONFIG_OPTIONS.map(opt => (
                                  <label key={opt.key} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 cursor-pointer" title={opt.description}>
                                    <input type="checkbox" checked={!!config[opt.key]}
                                      onChange={e => handleUpdateConfig(action, { ...config, [opt.key]: e.target.checked })}
                                      className="w-3 h-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                                    {opt.label}
                                  </label>
                                ))}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500">Model:</span>
                                <select value={config.model_override || ''} onChange={e => handleUpdateConfig(action, { ...config, model_override: (e.target.value || null) as any })}
                                  className="text-xs border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                                  {MODEL_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                </select>
                              </div>
                            </div>
                            {actions.length > 1 && (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-gray-400 uppercase tracking-wider">Depends on:</span>
                                <select value={action.depends_on || ''} onChange={e => handleSetDependency(action, e.target.value || null)}
                                  className="text-xs border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 flex-1">
                                  <option value="">None</option>
                                  {actions.filter(a => a.id !== action.id).map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                                </select>
                              </div>
                            )}
                          </>
                        )}

                        {action.result && (
                          <div>
                            <span className="text-[10px] text-gray-400 uppercase tracking-wider">Result</span>
                            <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5 whitespace-pre-wrap bg-white dark:bg-gray-800 rounded p-2 border border-gray-200 dark:border-gray-700">{action.result}</p>
                          </div>
                        )}
                        {action.error && (
                          <div>
                            <span className="text-[10px] text-red-400 uppercase tracking-wider">Error</span>
                            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 whitespace-pre-wrap bg-red-50 dark:bg-red-900/20 rounded p-2 border border-red-200 dark:border-red-800">{action.error}</p>
                          </div>
                        )}

                        {(action.commit_hash || action.agent_model || action.completed_at || action.tokens_in || action.cost_cents) && (
                          <div className="space-y-1">
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-400">
                              {action.agent_model && <span>Model: <span className="text-gray-600 dark:text-gray-300">{action.agent_model}</span></span>}
                              {formatDuration(action.started_at, action.completed_at) && <span>Duration: <span className="text-gray-600 dark:text-gray-300">{formatDuration(action.started_at, action.completed_at)}</span></span>}
                              {action.completed_at && <span>Completed: <span className="text-gray-600 dark:text-gray-300">{new Date(action.completed_at).toLocaleString()}</span></span>}
                            </div>
                            {(action.tokens_in || action.cost_cents) && (
                              <div className="flex flex-wrap gap-x-3 text-[10px] text-gray-400">
                                {formatTokens(action.tokens_in, action.tokens_out) && <span>Tokens: <span className="text-gray-600 dark:text-gray-300">{formatTokens(action.tokens_in, action.tokens_out)}</span></span>}
                                {action.cost_cents != null && action.cost_cents > 0 && <span>Cost: <span className="text-gray-600 dark:text-gray-300">{formatCost(action.cost_cents)}</span></span>}
                              </div>
                            )}
                            {action.commit_hash && (
                              <div className="flex items-center gap-1 text-[10px] text-gray-400">
                                <span>Commit:</span>
                                <code className="font-mono text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded select-all">{action.commit_hash.slice(0, 7)}</code>
                                <button onClick={() => navigator.clipboard.writeText(action.commit_hash!)} className="text-gray-400 hover:text-blue-500" title="Copy">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg>
                                </button>
                              </div>
                            )}
                            {parseFilesChanged(action.files_changed).length > 0 && (
                              <div className="text-[10px]">
                                <span className="text-gray-400">Files ({parseFilesChanged(action.files_changed).length}):</span>
                                <div className="mt-0.5 font-mono text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded p-1.5 max-h-20 overflow-y-auto">
                                  {parseFilesChanged(action.files_changed).map((f, i) => <div key={i} className="truncate">{f}</div>)}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer — Add action */}
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex gap-2 flex-shrink-0">
          <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') onClose(); }}
            placeholder="Add agent action..." autoFocus
            className="flex-1 px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm placeholder-gray-400 focus:ring-1 focus:ring-blue-500 outline-none" />
          {templates.length > 0 && (
            <div className="relative">
              <button onClick={() => setShowTemplates(!showTemplates)}
                className="px-2 py-1.5 text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-500" title="From template">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
              </button>
              {showTemplates && (
                <div className="absolute bottom-full right-0 mb-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 py-1 max-h-48 overflow-y-auto">
                  {templates.map(t => (
                    <button key={t.id} onClick={() => handleAddFromTemplate(t)}
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 truncate">{t.title}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button onClick={handleAdd} disabled={!newTitle.trim()}
            className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">Add</button>
        </div>
      </div>
    </div>
  );
}
