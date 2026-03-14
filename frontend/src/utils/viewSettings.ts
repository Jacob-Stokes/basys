// ── Bucket Templates ────────────────────────────────────────────

export interface BucketTemplateColumn {
  title: string;
  emoji: string | null;
  is_done_column: number;
  show_inline: number;
  bucket_type: string | null; // 'in_progress' | 'review' | 'done' | null
}

export interface BucketTemplate {
  id: string;
  name: string;
  columns: BucketTemplateColumn[];
}

export const BUILT_IN_BUCKET_TEMPLATES: BucketTemplate[] = [
  {
    id: 'kanban-standard',
    name: 'Kanban (Standard)',
    columns: [
      { title: 'Backlog', emoji: '📥', is_done_column: 0, show_inline: 0, bucket_type: null },
      { title: 'To Do', emoji: '📋', is_done_column: 0, show_inline: 1, bucket_type: null },
      { title: 'In Progress', emoji: '🔨', is_done_column: 0, show_inline: 1, bucket_type: 'in_progress' },
      { title: 'Review', emoji: '👀', is_done_column: 0, show_inline: 1, bucket_type: 'review' },
      { title: 'Done', emoji: '✅', is_done_column: 1, show_inline: 1, bucket_type: 'done' },
    ],
  },
  {
    id: 'kanban-simple',
    name: 'Simple (3-column)',
    columns: [
      { title: 'To Do', emoji: '📋', is_done_column: 0, show_inline: 1, bucket_type: null },
      { title: 'Doing', emoji: '🔨', is_done_column: 0, show_inline: 1, bucket_type: 'in_progress' },
      { title: 'Done', emoji: '✅', is_done_column: 1, show_inline: 1, bucket_type: 'done' },
    ],
  },
  {
    id: 'bug-tracking',
    name: 'Bug Tracking',
    columns: [
      { title: 'Reported', emoji: '🐛', is_done_column: 0, show_inline: 1, bucket_type: null },
      { title: 'Triaged', emoji: '🔍', is_done_column: 0, show_inline: 1, bucket_type: null },
      { title: 'Fixing', emoji: '🔧', is_done_column: 0, show_inline: 1, bucket_type: 'in_progress' },
      { title: 'Testing', emoji: '🧪', is_done_column: 0, show_inline: 1, bucket_type: 'review' },
      { title: 'Resolved', emoji: '✅', is_done_column: 1, show_inline: 1, bucket_type: 'done' },
    ],
  },
  {
    id: 'content-pipeline',
    name: 'Content Pipeline',
    columns: [
      { title: 'Ideas', emoji: '💡', is_done_column: 0, show_inline: 1, bucket_type: null },
      { title: 'Drafting', emoji: '✏️', is_done_column: 0, show_inline: 1, bucket_type: 'in_progress' },
      { title: 'Editing', emoji: '📝', is_done_column: 0, show_inline: 1, bucket_type: 'review' },
      { title: 'Published', emoji: '🚀', is_done_column: 1, show_inline: 1, bucket_type: 'done' },
    ],
  },
  {
    id: 'design-process',
    name: 'Design Process',
    columns: [
      { title: 'Brief', emoji: '📄', is_done_column: 0, show_inline: 1, bucket_type: null },
      { title: 'Research', emoji: '🔬', is_done_column: 0, show_inline: 1, bucket_type: null },
      { title: 'Design', emoji: '🎨', is_done_column: 0, show_inline: 1, bucket_type: 'in_progress' },
      { title: 'Feedback', emoji: '💬', is_done_column: 0, show_inline: 1, bucket_type: 'review' },
      { title: 'Approved', emoji: '✅', is_done_column: 1, show_inline: 1, bucket_type: 'done' },
    ],
  },
  {
    id: 'sprint-dev',
    name: 'Sprint (Dev)',
    columns: [
      { title: 'Backlog', emoji: '📥', is_done_column: 0, show_inline: 0, bucket_type: null },
      { title: 'Ready', emoji: '📋', is_done_column: 0, show_inline: 1, bucket_type: null },
      { title: 'In Dev', emoji: '💻', is_done_column: 0, show_inline: 1, bucket_type: 'in_progress' },
      { title: 'Code Review', emoji: '🔎', is_done_column: 0, show_inline: 1, bucket_type: 'review' },
      { title: 'QA', emoji: '🧪', is_done_column: 0, show_inline: 1, bucket_type: 'review' },
      { title: 'Done', emoji: '✅', is_done_column: 1, show_inline: 1, bucket_type: 'done' },
    ],
  },
];

// ── View Settings ───────────────────────────────────────────────

export interface ViewSettings {
  sprintViewMode?: 'kanban' | 'list';
  projectsViewMode?: 'card' | 'list';
  projectsCardSize?: 'sm' | 'md' | 'lg';
  projectsSort?: 'alpha' | 'recent' | 'created';
  projectsSubprojectMode?: 'grouped' | 'nested';
}

export const VIEW_DEFAULTS: Required<ViewSettings> = {
  sprintViewMode: 'kanban',
  projectsViewMode: 'card',
  projectsCardSize: 'md',
  projectsSort: 'alpha',
  projectsSubprojectMode: 'grouped',
};

function stripUndefined(obj: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null)
  );
}

export function resolveViewSettings(
  global?: ViewSettings,
  project?: ViewSettings,
  sprint?: ViewSettings
): Required<ViewSettings> {
  return {
    ...VIEW_DEFAULTS,
    ...stripUndefined(global || {}),
    ...stripUndefined(project || {}),
    ...stripUndefined(sprint || {}),
  } as Required<ViewSettings>;
}

export function parseViewSettings(jsonStr: string | null | undefined): ViewSettings {
  if (!jsonStr) return {};
  try { return JSON.parse(jsonStr); } catch { return {}; }
}
