// Shared types and constants for agent actions

export interface AgentActionItem {
  id: string;
  task_id: string;
  title: string;
  description: string | null;
  status: 'draft' | 'staged' | 'running' | 'done' | 'failed';
  position: number;
  result: string | null;
  error: string | null;
  commit_hash: string | null;
  files_changed: string | null;
  agent_model: string | null;
  started_at: string | null;
  completed_at: string | null;
  config: string | null;
  depends_on: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_cents: number | null;
  prompt_template: string | null;
  template_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentActionConfig {
  plan_mode?: boolean;
  use_worktree?: boolean;
  include_tests?: boolean;
  dry_run?: boolean;
  model_override?: 'sonnet' | 'opus' | 'haiku' | null;
}

export const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  staged: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
  running: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
  done: 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400',
  failed: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
};

export const STATUS_DOT_COLORS: Record<string, string> = {
  draft: 'bg-gray-400',
  staged: 'bg-blue-500',
  running: 'bg-amber-500 animate-pulse',
  done: 'bg-green-500',
  failed: 'bg-red-500',
};

export const CONFIG_OPTIONS = [
  { key: 'plan_mode' as const, label: 'Plan mode', description: 'Force agent to plan before coding' },
  { key: 'use_worktree' as const, label: 'Use worktree', description: 'Run in isolated git worktree' },
  { key: 'include_tests' as const, label: 'Include tests', description: 'Require test coverage' },
  { key: 'dry_run' as const, label: 'Dry run', description: 'Preview changes without applying' },
];

export const MODEL_OPTIONS = [
  { value: '', label: 'Default' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'opus', label: 'Opus' },
  { value: 'haiku', label: 'Haiku' },
];

export function parseConfig(configStr: string | null): AgentActionConfig {
  if (!configStr) return {};
  try { return JSON.parse(configStr); } catch { return {}; }
}

export function formatDuration(startedAt: string | null, completedAt: string | null): string | null {
  if (!startedAt || !completedAt) return null;
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 0) return null;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

export function formatCost(costCents: number | null): string {
  if (costCents === null || costCents === undefined) return '';
  return `$${(costCents / 100).toFixed(2)}`;
}

export function formatTokens(tokensIn: number | null, tokensOut: number | null): string {
  if (tokensIn === null && tokensOut === null) return '';
  const formatNum = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  return `${formatNum(tokensIn || 0)} in / ${formatNum(tokensOut || 0)} out`;
}

export function parseFilesChanged(filesStr: string | null): string[] {
  if (!filesStr) return [];
  try { return JSON.parse(filesStr); } catch { return []; }
}
