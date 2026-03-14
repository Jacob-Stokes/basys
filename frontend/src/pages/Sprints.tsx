import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useModKeySubmit } from '../hooks/useModKeySubmit';
import TaskEditModal from '../components/TaskEditModal';
import StartPomoButton from '../components/StartPomoButton';
import type { FocusItem } from '../context/TimerContext';
import { SprintBoardContent } from './SprintBoard';
import { buildObsidianUri } from '../utils/obsidian';

interface Project {
  id: string;
  title: string;
  description: string | null;
  hex_color: string;
  type: string;
  project_mode: 'simple' | 'sprint';
  open_tasks: number;
  done_tasks: number;
  is_favorite: number;
  archived: number;
  parent_project_id: string | null;
  obsidian_path: string | null;
  created_at: string;
  updated_at: string;
}

interface Sprint {
  id: string;
  project_id: string;
  title: string;
  sprint_number: number;
  status: string;
  start_date: string | null;
  end_date: string | null;
  open_tasks: number;
  done_tasks: number;
  obsidian_path: string | null;
  archived?: number;
}

interface SprintForm {
  title: string;
  description: string;
  start_date: string;
  end_date: string;
}

interface ProjectForm {
  title: string;
  type: string;
  customType: string;
  hex_color: string;
  description: string;
  project_mode: 'simple' | 'sprint';
  parent_project_id: string;
}

const statusColors: Record<string, string> = {
  planned: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
  active: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300',
  completed: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300',
};

const PRESET_COLORS = ['#e2e8f0', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280'];
const PROJECT_TYPES = ['personal', 'dev', 'design', 'work', 'research', 'learning'];

const emptySprintForm: SprintForm = { title: '', description: '', start_date: '', end_date: '' };
const emptyProjectForm: ProjectForm = { title: '', type: 'personal', customType: '', hex_color: '#3b82f6', description: '', project_mode: 'simple', parent_project_id: '' };

const modeLabel = (mode: string, plural = false) =>
  mode === 'sprint' ? (plural ? 'Sprints' : 'Sprint') : (plural ? 'Sections' : 'Section');

type ProjectViewMode = 'card' | 'list';
type ProjectSort = 'alpha' | 'recent' | 'created';
type CardSubprojectMode = 'grouped' | 'nested';
const CARD_SIZES = [
  { id: 'sm', label: 'S', width: 180 },
  { id: 'md', label: 'M', width: 240 },
  { id: 'lg', label: 'L', width: 300 },
] as const;
type CardSize = typeof CARD_SIZES[number]['id'];

// ProjectTaskEditModal replaced by shared TaskEditModal component

export default function Sprints() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [sprintsByProject, setSprintsByProject] = useState<Record<string, Sprint[]>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('home');
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [obsidianVaultName, setObsidianVaultName] = useState<string | null>(null);

  // View preferences (persisted in localStorage)
  const [projectViewMode, setProjectViewMode] = useState<ProjectViewMode>(() =>
    (localStorage.getItem('projects_view_mode') as ProjectViewMode) || 'card'
  );
  const [cardSize, setCardSize] = useState<CardSize>(() =>
    (localStorage.getItem('projects_card_size') as CardSize) || 'md'
  );

  const updateViewMode = (mode: ProjectViewMode) => {
    setProjectViewMode(mode);
    localStorage.setItem('projects_view_mode', mode);
  };
  const updateCardSize = (size: CardSize) => {
    setCardSize(size);
    localStorage.setItem('projects_card_size', size);
  };

  // Sort preference
  const [projectSort, setProjectSort] = useState<ProjectSort>(() =>
    (localStorage.getItem('projects_sort') as ProjectSort) || 'alpha'
  );
  const updateProjectSort = (sort: ProjectSort) => {
    setProjectSort(sort);
    localStorage.setItem('projects_sort', sort);
  };

  // Card subproject display mode
  const [cardSubprojectMode, setCardSubprojectMode] = useState<CardSubprojectMode>(() =>
    (localStorage.getItem('projects_card_subproject_mode') as CardSubprojectMode) || 'grouped'
  );
  const updateCardSubprojectMode = (mode: CardSubprojectMode) => {
    setCardSubprojectMode(mode);
    localStorage.setItem('projects_card_subproject_mode', mode);
  };

  const cardWidth = CARD_SIZES.find(s => s.id === cardSize)?.width ?? 240;

  // Sprint modal state
  const [sprintModalProjectId, setSprintModalProjectId] = useState<string | null>(null);
  const [editingSprint, setEditingSprint] = useState<Sprint | null>(null);
  const [sprintForm, setSprintForm] = useState<SprintForm>(emptySprintForm);
  const [savingSprint, setSavingSprint] = useState(false);

  // Project modal state
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectForm, setProjectForm] = useState<ProjectForm>(emptyProjectForm);
  const [savingProject, setSavingProject] = useState(false);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'project' | 'sprint'; id: string; title: string; taskCount: number; projectId?: string } | null>(null);
  const [deleteWithTasks, setDeleteWithTasks] = useState(true);

  // ── Workspace tabs (multiple project views) ─────────────────
  interface TabHistoryEntry { projectId: string | null; sprintId: string | null; statusFilter: string; }
  interface WorkspaceTab {
    id: string;
    projectId: string | null;
    sprintId: string | null;
    statusFilter: string;
    history: TabHistoryEntry[];
    isHome: boolean;
  }

  const migrateTab = (t: any, idx: number): WorkspaceTab => ({
    id: t.id || `tab-${idx}`,
    projectId: t.projectId || null,
    sprintId: t.sprintId || null,
    statusFilter: t.statusFilter || 'all',
    history: Array.isArray(t.history) ? t.history.slice(-20) : [],
    isHome: idx === 0 ? true : (t.isHome || false),
  });

  const [workspaceTabs, setWorkspaceTabs] = useState<WorkspaceTab[]>(() => {
    try {
      const stored = localStorage.getItem('projects_workspace_tabs');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed.map(migrateTab);
      }
    } catch { /* ignore */ }
    return [{ id: 'tab-home', projectId: null, sprintId: null, statusFilter: 'all', history: [], isHome: true }];
  });
  const [activeWorkspaceTabId, setActiveWorkspaceTabId] = useState<string>(() => {
    const stored = localStorage.getItem('projects_workspace_active_tab');
    return stored || 'tab-home';
  });

  // Persist workspace tabs
  useEffect(() => {
    localStorage.setItem('projects_workspace_tabs', JSON.stringify(workspaceTabs));
  }, [workspaceTabs]);
  useEffect(() => {
    localStorage.setItem('projects_workspace_active_tab', activeWorkspaceTabId);
  }, [activeWorkspaceTabId]);

  // Ensure active tab exists
  const activeWsTab = workspaceTabs.find(t => t.id === activeWorkspaceTabId) || workspaceTabs[0];

  // Active tab state drives the view — NOT URL search params
  const selectedProject = activeWsTab.projectId;
  const selectedSprint = activeWsTab.sprintId;
  const sprintStatusFilter = activeWsTab.statusFilter || 'all';

  // One-way sync: active tab state → URL (replace, no history pollution)
  const syncUrlRef = useRef(false);
  useEffect(() => {
    if (syncUrlRef.current) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        if (activeWsTab.projectId) { next.set('project', activeWsTab.projectId); } else { next.delete('project'); }
        if (activeWsTab.sprintId) { next.set('sprint', activeWsTab.sprintId); } else { next.delete('sprint'); }
        if (activeWsTab.statusFilter && activeWsTab.statusFilter !== 'all') { next.set('status', activeWsTab.statusFilter); } else { next.delete('status'); }
        return next;
      }, { replace: true });
    }
    syncUrlRef.current = true;
  }, [activeWsTab.projectId, activeWsTab.sprintId, activeWsTab.statusFilter, setSearchParams]);

  // ── Tab navigation helpers ─────────────────────────────────
  const updateActiveTab = useCallback((updates: Partial<WorkspaceTab>) => {
    setWorkspaceTabs(prev => prev.map(t =>
      t.id === activeWorkspaceTabId ? { ...t, ...updates } : t
    ));
  }, [activeWorkspaceTabId]);

  const navigateTab = useCallback((tabId: string, entry: { projectId: string | null; sprintId: string | null; statusFilter?: string }) => {
    setWorkspaceTabs(prev => prev.map(t => {
      if (t.id !== tabId) return t;
      const historyEntry: TabHistoryEntry = { projectId: t.projectId, sprintId: t.sprintId, statusFilter: t.statusFilter };
      return {
        ...t,
        projectId: entry.projectId,
        sprintId: entry.sprintId,
        statusFilter: entry.statusFilter || 'all',
        history: [...t.history.slice(-19), historyEntry],
      };
    }));
  }, []);

  const goBackInTab = useCallback((tabId: string) => {
    setWorkspaceTabs(prev => {
      const tab = prev.find(t => t.id === tabId);
      if (!tab) return prev;
      if (tab.history.length > 0) {
        // Pop from history stack
        return prev.map(t => {
          if (t.id !== tabId) return t;
          const history = [...t.history];
          const prev_entry = history.pop()!;
          return { ...t, projectId: prev_entry.projectId, sprintId: prev_entry.sprintId, statusFilter: prev_entry.statusFilter, history };
        });
      }
      // History empty on a non-home tab → switch to home tab
      if (!tab.isHome) {
        const homeTab = prev.find(t => t.isHome);
        if (homeTab) setActiveWorkspaceTabId(homeTab.id);
      }
      return prev;
    });
  }, []);

  const setSelectedProject = useCallback((id: string | null) => {
    if (id) {
      navigateTab(activeWorkspaceTabId, { projectId: id, sprintId: null });
    } else {
      goBackInTab(activeWorkspaceTabId);
    }
  }, [activeWorkspaceTabId, navigateTab, goBackInTab]);

  const setSprintStatusFilter = useCallback((status: string) => {
    updateActiveTab({ statusFilter: status || 'all' });
  }, [updateActiveTab]);

  const openProjectInTab = useCallback((projectId: string) => {
    // Find existing tab with this project
    const existing = workspaceTabs.find(t => !t.isHome && t.projectId === projectId);
    if (existing) {
      setActiveWorkspaceTabId(existing.id);
      return;
    }
    // Create new tab
    const id = `tab-${Date.now()}`;
    const newTab: WorkspaceTab = { id, projectId, sprintId: null, statusFilter: 'all', history: [], isHome: false };
    setWorkspaceTabs(prev => [...prev, newTab]);
    setActiveWorkspaceTabId(id);
  }, [workspaceTabs]);

  const openSprintInTab = useCallback((sprintId: string, projectId: string) => {
    // Find existing tab with this project
    const existing = workspaceTabs.find(t => !t.isHome && t.projectId === projectId);
    if (existing) {
      setActiveWorkspaceTabId(existing.id);
      // Navigate that tab to the sprint
      navigateTab(existing.id, { projectId, sprintId });
      return;
    }
    // Create new tab with project + sprint
    const id = `tab-${Date.now()}`;
    const newTab: WorkspaceTab = { id, projectId, sprintId, statusFilter: 'all', history: [{ projectId, sprintId: null, statusFilter: 'all' }], isHome: false };
    setWorkspaceTabs(prev => [...prev, newTab]);
    setActiveWorkspaceTabId(id);
  }, [workspaceTabs, navigateTab]);

  const switchWorkspaceTab = useCallback((tabId: string) => {
    setActiveWorkspaceTabId(tabId);
  }, []);

  const addWorkspaceTab = useCallback((projectId?: string | null) => {
    const id = `tab-${Date.now()}`;
    const newTab: WorkspaceTab = { id, projectId: projectId || null, sprintId: null, statusFilter: 'all', history: [], isHome: false };
    setWorkspaceTabs(prev => [...prev, newTab]);
    setActiveWorkspaceTabId(id);
  }, []);

  const closeWorkspaceTab = useCallback((tabId: string) => {
    setWorkspaceTabs(prev => {
      const tab = prev.find(t => t.id === tabId);
      if (!tab || tab.isHome || prev.length <= 1) return prev;
      const filtered = prev.filter(t => t.id !== tabId);
      if (tabId === activeWorkspaceTabId) {
        const idx = prev.findIndex(t => t.id === tabId);
        const nextTab = filtered[Math.min(idx, filtered.length - 1)];
        setActiveWorkspaceTabId(nextTab.id);
      }
      return filtered;
    });
  }, [activeWorkspaceTabId]);

  const getTabLabel = useCallback((tab: WorkspaceTab) => {
    if (tab.isHome) return 'Home';
    if (tab.projectId) {
      const p = projects.find(pr => pr.id === tab.projectId);
      return p?.title || 'Project';
    }
    return 'Projects';
  }, [projects]);

  // ── Popstate interceptor for per-tab back ──────────────────
  useEffect(() => {
    const handler = (e: PopStateEvent) => {
      const tab = workspaceTabs.find(t => t.id === activeWorkspaceTabId);
      if (tab && tab.history.length > 0) {
        e.preventDefault();
        // Push a dummy state to keep browser history balanced
        window.history.pushState(null, '', window.location.href);
        goBackInTab(tab.id);
      }
    };
    // Push initial state so we can intercept back
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [activeWorkspaceTabId, workspaceTabs, goBackInTab]);

  // Listen for cross-page navigation events (e.g. from GlobalSearch)
  useEffect(() => {
    const handleOpenProject = (e: Event) => {
      const { projectId } = (e as CustomEvent).detail;
      if (projectId) openProjectInTab(projectId);
    };
    const handleOpenSprint = (e: Event) => {
      const { sprintId, projectId } = (e as CustomEvent).detail;
      if (sprintId && projectId) openSprintInTab(sprintId, projectId);
    };
    window.addEventListener('thesys:open-project', handleOpenProject);
    window.addEventListener('thesys:open-sprint', handleOpenSprint);
    return () => {
      window.removeEventListener('thesys:open-project', handleOpenProject);
      window.removeEventListener('thesys:open-sprint', handleOpenSprint);
    };
  }, [openProjectInTab, openSprintInTab]);

  // Project-level tasks (sprint_id = NULL)
  const [projectTasks, setProjectTasks] = useState<any[]>([]);
  const [newProjectTaskTitle, setNewProjectTaskTitle] = useState('');
  const [showProjectTaskInput, setShowProjectTaskInput] = useState(false);
  const [editingProjectTask, setEditingProjectTask] = useState<any | null>(null);
  const [showProjectBucketSettings, setShowProjectBucketSettings] = useState(false);
  const [projectBuckets, setProjectBuckets] = useState<any[]>([]);

  // Expand/collapse state
  const [collapsedProjectTasks, setCollapsedProjectTasks] = useState<Set<string>>(new Set());
  const [expandedSprints, setExpandedSprints] = useState<Set<string>>(new Set());
  const [sprintTasks, setSprintTasks] = useState<Record<string, any[]>>({});
  const [loadingSprintTasks, setLoadingSprintTasks] = useState<Set<string>>(new Set());
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [collapsedSprintTasks, setCollapsedSprintTasks] = useState<Set<string>>(new Set());

  // Derive unique project types for tabs
  const projectTypes = useMemo(() => {
    const types = Array.from(new Set(projects.map(p => p.type || 'personal').filter(Boolean)));
    return types.sort();
  }, [projects]);

  const tabs = useMemo(() => {
    const list = [
      { id: 'home', label: 'Home' },
      { id: 'all', label: 'All Projects' },
    ];
    for (const t of projectTypes) {
      list.push({ id: `type:${t}`, label: t.charAt(0).toUpperCase() + t.slice(1) });
    }
    return list;
  }, [projectTypes]);

  const archivedCount = useMemo(() => projects.filter(p => p.archived).length, [projects]);

  // Sort comparator based on current sort mode
  const sortProjects = useCallback((a: Project, b: Project) => {
    // Favorites first always
    if (a.is_favorite !== b.is_favorite) return b.is_favorite - a.is_favorite;
    switch (projectSort) {
      case 'alpha':
        return a.title.localeCompare(b.title);
      case 'recent':
        return (b.updated_at || '').localeCompare(a.updated_at || '');
      case 'created':
        return (b.created_at || '').localeCompare(a.created_at || '');
      default:
        return a.title.localeCompare(b.title);
    }
  }, [projectSort]);

  const filteredProjects = useMemo(() => {
    // Filter by active/archived
    const pool = showArchived ? projects.filter(p => p.archived) : projects.filter(p => !p.archived);
    let base: Project[];
    if (activeTab === 'all') base = pool;
    else if (activeTab === 'home') base = pool;
    else if (activeTab.startsWith('type:')) {
      const type = activeTab.slice(5);
      base = pool.filter(p => (p.type || 'personal') === type);
    } else base = pool;

    // Separate top-level and children
    const topLevel = base.filter(p => !p.parent_project_id || !base.some(pp => pp.id === p.parent_project_id));
    const childrenMap = new Map<string, Project[]>();
    for (const p of base) {
      if (p.parent_project_id && base.some(pp => pp.id === p.parent_project_id)) {
        const kids = childrenMap.get(p.parent_project_id) || [];
        kids.push(p);
        childrenMap.set(p.parent_project_id, kids);
      }
    }

    // Sort top-level projects
    const sortedTopLevel = [...topLevel].sort(sortProjects);
    // Sort children within each parent by same comparator
    for (const [, kids] of childrenMap) {
      kids.sort(sortProjects);
    }

    // Build flat list: parent then children
    const result: Project[] = [];
    for (const parent of sortedTopLevel) {
      result.push(parent);
      const children = childrenMap.get(parent.id);
      if (children) result.push(...children);
    }
    return result;
  }, [activeTab, projects, showArchived, sortProjects]);

  // For card "nested" mode: only top-level projects, with children accessible via map
  const topLevelProjects = useMemo(() => {
    return filteredProjects.filter(p => !p.parent_project_id || !filteredProjects.some(pp => pp.id === p.parent_project_id));
  }, [filteredProjects]);

  const childrenByProject = useMemo(() => {
    const map = new Map<string, Project[]>();
    for (const p of filteredProjects) {
      if (p.parent_project_id && filteredProjects.some(pp => pp.id === p.parent_project_id)) {
        const kids = map.get(p.parent_project_id) || [];
        kids.push(p);
        map.set(p.parent_project_id, kids);
      }
    }
    return map;
  }, [filteredProjects]);

  const loadData = useCallback(async () => {
    try {
      const allProjects = await api.getProjects();
      setProjects(allProjects);

      const sprintsMap: Record<string, Sprint[]> = {};
      await Promise.all(
        allProjects.map(async (p: any) => {
          try {
            sprintsMap[p.id] = await api.getSprints(p.id);
          } catch {
            sprintsMap[p.id] = [];
          }
        })
      );
      setSprintsByProject(sprintsMap);
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Handle deep links from URL search params (e.g. /sprints?project=xxx&sprint=yyy)
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (loading || deepLinkHandled.current) return;
    const projectId = searchParams.get('project');
    const sprintId = searchParams.get('sprint');
    if (sprintId && projectId) {
      deepLinkHandled.current = true;
      openSprintInTab(sprintId, projectId);
      setSearchParams({}, { replace: true });
    } else if (projectId) {
      deepLinkHandled.current = true;
      openProjectInTab(projectId);
      setSearchParams({}, { replace: true });
    }
  }, [loading, searchParams, setSearchParams, openProjectInTab, openSprintInTab]);

  // Load Obsidian vault name for deep links
  useEffect(() => {
    api.getMe().then((u: any) => {
      if (u?.obsidian_enabled && u?.obsidian_vault_name) {
        setObsidianVaultName(u.obsidian_vault_name);
      }
    }).catch(() => {});
  }, []);

  // ── Sprint Modal ───────────────────────────────────────────────

  const openNewSprint = (projectId: string) => {
    setSprintModalProjectId(projectId);
    setEditingSprint(null);
    const project = projects.find(p => p.id === projectId);
    const isSimple = !project || (project.project_mode || 'simple') === 'simple';
    if (isSimple) {
      setSprintForm({ title: '', description: '', start_date: '', end_date: '' });
    } else {
      const today = new Date().toISOString().split('T')[0];
      const twoWeeks = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
      setSprintForm({ title: '', description: '', start_date: today, end_date: twoWeeks });
    }
  };

  const openEditSprint = (sprint: Sprint, projectId: string) => {
    setSprintModalProjectId(projectId);
    setEditingSprint(sprint);
    setSprintForm({
      title: sprint.title,
      description: '',
      start_date: sprint.start_date?.split('T')[0] || '',
      end_date: sprint.end_date?.split('T')[0] || '',
    });
  };

  const closeSprintModal = () => {
    setSprintModalProjectId(null);
    setEditingSprint(null);
    setSprintForm(emptySprintForm);
  };

  const handleSaveSprint = async () => {
    if (!sprintForm.title.trim() || !sprintModalProjectId) return;
    setSavingSprint(true);
    try {
      const data = {
        title: sprintForm.title.trim(),
        description: sprintForm.description.trim() || null,
        start_date: sprintForm.start_date || null,
        end_date: sprintForm.end_date || null,
      };
      if (editingSprint) {
        await api.updateSprint(editingSprint.id, data);
      } else {
        await api.createSprint(sprintModalProjectId, data);
      }
      closeSprintModal();
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
    setSavingSprint(false);
  };

  // ── Project Modal ──────────────────────────────────────────────

  const openNewProject = () => {
    setEditingProject(null);
    setProjectForm(emptyProjectForm);
    setShowProjectModal(true);
  };

  const openEditProject = (project: Project) => {
    setEditingProject(project);
    const knownType = PROJECT_TYPES.includes(project.type || 'personal');
    setProjectForm({
      title: project.title,
      type: knownType ? (project.type || 'personal') : 'custom',
      customType: knownType ? '' : (project.type || ''),
      hex_color: project.hex_color || '#3b82f6',
      description: project.description || '',
      project_mode: project.project_mode || 'simple',
      parent_project_id: project.parent_project_id || '',
    });
    setShowProjectModal(true);
  };

  const closeProjectModal = () => {
    setShowProjectModal(false);
    setEditingProject(null);
    setProjectForm(emptyProjectForm);
  };

  const handleSaveProject = async () => {
    if (!projectForm.title.trim()) return;
    setSavingProject(true);
    try {
      const type = projectForm.type === 'custom' ? projectForm.customType.trim() || 'personal' : projectForm.type;
      const data = {
        title: projectForm.title.trim(),
        type,
        hex_color: projectForm.hex_color,
        description: projectForm.description.trim() || null,
        project_mode: projectForm.project_mode,
        parent_project_id: projectForm.parent_project_id || null,
      };
      if (editingProject) {
        await api.updateProject(editingProject.id, data);
      } else {
        await api.createProject(data);
      }
      closeProjectModal();
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
    setSavingProject(false);
  };

  // ── Sprint Actions ─────────────────────────────────────────────

  const handleStatusChange = async (sprintId: string, status: string) => {
    try {
      await api.updateSprintStatus(sprintId, status);
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const promptDeleteSprint = (sprintId: string, projectId?: string) => {
    const proj = projectId ? projects.find(p => p.id === projectId) : undefined;
    const sprints = sprintsByProject[projectId || ''] || [];
    const sprint = sprints.find(s => s.id === sprintId);
    const taskCount = sprint ? (sprint.open_tasks || 0) + (sprint.done_tasks || 0) : 0;
    setDeleteWithTasks(true);
    setDeleteTarget({ type: 'sprint', id: sprintId, title: sprint?.title || modeLabel(proj?.project_mode || 'simple'), taskCount, projectId });
  };

  const promptDeleteProject = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    const sprints = sprintsByProject[projectId] || [];
    const taskCount = sprints.reduce((sum, s) => sum + (s.open_tasks || 0) + (s.done_tasks || 0), 0);
    setDeleteWithTasks(true);
    setDeleteTarget({ type: 'project', id: projectId, title: project?.title || 'Project', taskCount });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'project') {
        await api.deleteProject(deleteTarget.id, deleteWithTasks);
        if (selectedProject === deleteTarget.id) setSelectedProject(null);
      } else {
        await api.deleteSprint(deleteTarget.id, deleteWithTasks);
      }
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleToggleArchive = async (projectId: string) => {
    try {
      await api.toggleProjectArchive(projectId);
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleToggleSprintArchive = async (sprintId: string) => {
    try {
      await api.toggleSprintArchive(sprintId);
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // ── Project-level Tasks ────────────────────────────────────────

  const loadProjectTasks = useCallback(async (projectId: string) => {
    try {
      const tasks = await api.getTasks({ project_id: projectId, sprint_id: 'none', include_checklist: '1' });
      setProjectTasks(tasks);
    } catch {
      setProjectTasks([]);
    }
  }, []);

  const loadProjectBucketsData = useCallback(async (projectId: string) => {
    try {
      const buckets = await api.getProjectBuckets(projectId);
      setProjectBuckets(buckets.filter((b: any) => !b.sprint_id));
    } catch {
      setProjectBuckets([]);
    }
  }, []);

  useEffect(() => {
    if (selectedProject) {
      loadProjectTasks(selectedProject);
      loadProjectBucketsData(selectedProject);
      setShowProjectTaskInput(false);
      setNewProjectTaskTitle('');
    } else {
      setProjectTasks([]);
      setProjectBuckets([]);
      setShowProjectBucketSettings(false);
    }
  }, [selectedProject, loadProjectTasks, loadProjectBucketsData]);

  const handleUpdateProjectBucket = async (bucketId: string, data: any) => {
    if (!selectedProject) return;
    try {
      await api.updateProjectBucket(selectedProject, bucketId, data);
      await loadProjectBucketsData(selectedProject);
      await loadProjectTasks(selectedProject);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDeleteProjectBucket = async (bucketId: string) => {
    if (!selectedProject) return;
    try {
      await api.deleteProjectBucket(selectedProject, bucketId);
      await loadProjectBucketsData(selectedProject);
      await loadProjectTasks(selectedProject);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleAddProjectBucket = async () => {
    if (!selectedProject) return;
    try {
      await api.createProjectBucket(selectedProject, { title: 'New Stage' });
      await loadProjectBucketsData(selectedProject);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleAddProjectTask = async () => {
    if (!newProjectTaskTitle.trim() || !selectedProject) return;
    try {
      await api.createTask({ title: newProjectTaskTitle.trim(), project_id: selectedProject });
      setNewProjectTaskTitle('');
      await loadProjectTasks(selectedProject);
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleToggleProjectTask = async (taskId: string) => {
    try {
      await api.toggleTask(taskId);
      if (selectedProject) await loadProjectTasks(selectedProject);
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDeleteProjectTask = async (taskId: string) => {
    if (!confirm('Delete this task?')) return;
    try {
      await api.deleteTask(taskId);
      if (selectedProject) await loadProjectTasks(selectedProject);
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSaveProjectTask = async (data: any) => {
    if (!editingProjectTask) return;
    try {
      await api.updateTask(editingProjectTask.id, data);
      setEditingProjectTask(null);
      if (selectedProject) await loadProjectTasks(selectedProject);
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleMoveToBucket = async (task: any, sprintId?: string) => {
    if (!task.sprint_buckets || task.sprint_buckets.length === 0) return;
    const cycleable = task.sprint_buckets.filter((b: any) => !b.is_done_column && b.show_inline);
    if (cycleable.length <= 1) return;
    const curIdx = cycleable.findIndex((b: any) => b.id === task.bucket_id);
    const nextIdx = (curIdx + 1) % cycleable.length;
    const next = cycleable[nextIdx];
    if (!next || next.id === task.bucket_id) return;
    try {
      await api.updateTask(task.id, { bucket_id: next.id });
      if (sprintId) {
        const tasks = await api.getTasks({ sprint_id: sprintId, include_checklist: '1' });
        setSprintTasks(prev => ({ ...prev, [sprintId]: tasks }));
      }
      if (selectedProject) await loadProjectTasks(selectedProject);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleToggleProjectCheckItem = async (taskId: string, itemId: string, currentDone: number) => {
    setProjectTasks(prev => prev.map(t => {
      if (t.id !== taskId || !t.checklist_items) return t;
      const items = t.checklist_items.map((ci: any) => ci.id === itemId ? { ...ci, done: currentDone ? 0 : 1 } : ci);
      const doneCount = items.filter((ci: any) => ci.done).length;
      return { ...t, checklist_items: items, checklist_count: { total: items.length, done: doneCount } };
    }));
    try {
      await api.updateChecklistItem(taskId, itemId, { done: currentDone ? 0 : 1 });
    } catch {
      if (selectedProject) loadProjectTasks(selectedProject);
    }
  };

  const toggleSprintExpand = async (sprintId: string) => {
    if (expandedSprints.has(sprintId)) {
      setExpandedSprints(prev => { const next = new Set(prev); next.delete(sprintId); return next; });
    } else {
      setExpandedSprints(prev => new Set(prev).add(sprintId));
      if (!sprintTasks[sprintId]) {
        setLoadingSprintTasks(prev => new Set(prev).add(sprintId));
        try {
          const tasks = await api.getTasks({ sprint_id: sprintId, include_checklist: '1' });
          setSprintTasks(prev => ({ ...prev, [sprintId]: tasks }));
        } catch { /* ignore */ }
        setLoadingSprintTasks(prev => { const next = new Set(prev); next.delete(sprintId); return next; });
      }
    }
  };

  const handleToggleSprintTask = async (taskId: string, sprintId: string) => {
    try {
      await api.toggleTask(taskId);
      const tasks = await api.getTasks({ sprint_id: sprintId, include_checklist: '1' });
      setSprintTasks(prev => ({ ...prev, [sprintId]: tasks }));
      await loadData();
    } catch { /* ignore */ }
  };

  const handleToggleSprintCheckItem = async (sprintId: string, taskId: string, itemId: string, currentDone: number) => {
    setSprintTasks(prev => {
      const tasks = prev[sprintId];
      if (!tasks) return prev;
      return {
        ...prev,
        [sprintId]: tasks.map(t => {
          if (t.id !== taskId || !t.checklist_items) return t;
          const items = t.checklist_items.map((ci: any) => ci.id === itemId ? { ...ci, done: currentDone ? 0 : 1 } : ci);
          const doneCount = items.filter((ci: any) => ci.done).length;
          return { ...t, checklist_items: items, checklist_count: { total: items.length, done: doneCount } };
        })
      };
    });
    try {
      await api.updateChecklistItem(taskId, itemId, { done: currentDone ? 0 : 1 });
    } catch {
      // Revert on failure
      const tasks = await api.getTasks({ sprint_id: sprintId, include_checklist: '1' });
      setSprintTasks(prev => ({ ...prev, [sprintId]: tasks }));
    }
  };

  // Cmd+Enter submit for modals
  useModKeySubmit(!!sprintModalProjectId, handleSaveSprint, !!sprintForm.title.trim() && !savingSprint);
  useModKeySubmit(showProjectModal, handleSaveProject, !!projectForm.title.trim() && !savingProject);

  // ── Helpers ────────────────────────────────────────────────────

  const sprintDuration = (s: Sprint) => {
    if (!s.start_date || !s.end_date) return null;
    return Math.ceil((new Date(s.end_date).getTime() - new Date(s.start_date).getTime()) / 86400000);
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  // Get smart sprint summary for a project
  const getSmartSprints = (projectId: string) => {
    const allSprints = sprintsByProject[projectId] || [];
    const sprints = showArchived ? allSprints : allSprints.filter(s => !s.archived);
    const active = sprints.find(s => s.status === 'active');
    const completedSorted = sprints.filter(s => s.status === 'completed').sort((a, b) => b.sprint_number - a.sprint_number);
    const plannedSorted = sprints.filter(s => s.status === 'planned').sort((a, b) => a.sprint_number - b.sprint_number);
    const lastCompleted = completedSorted[0] || null;
    const nextPlanned = plannedSorted[0] || null;

    const plannedCount = plannedSorted.length;
    if (active) return { display: [active], total: sprints.length, plannedCount };
    const display: Sprint[] = [];
    if (lastCompleted) display.push(lastCompleted);
    if (nextPlanned) display.push(nextPlanned);
    return { display, total: sprints.length, plannedCount };
  };

  // ── Sprint Row Component ───────────────────────────────────────

  const renderSprintRow = (sprint: Sprint, projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    const isSimple = (project?.project_mode || 'simple') === 'simple';
    const days = sprintDuration(sprint);
    const totalTasks = (sprint.open_tasks || 0) + (sprint.done_tasks || 0);
    const progress = totalTasks > 0 ? Math.round(((sprint.done_tasks || 0) / totalTasks) * 100) : 0;
    const isSprintExpanded = expandedSprints.has(sprint.id);
    const isLoadingTasks = loadingSprintTasks.has(sprint.id);
    const tasks = sprintTasks[sprint.id] || [];

    return (
      <React.Fragment key={sprint.id}>
        <div
          className={`px-4 py-3 border-b border-gray-100 dark:border-gray-700/50 last:border-b-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${
            !isSimple && sprint.status === 'active' ? 'bg-green-50/50 dark:bg-green-900/5' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1 flex items-center gap-2">
              {/* Expand chevron */}
              {totalTasks > 0 ? (
                <button
                  onClick={(e) => { e.stopPropagation(); toggleSprintExpand(sprint.id); }}
                  className={`p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0 transition-transform ${isSprintExpanded ? 'rotate-90' : ''}`}
                >
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M6 4l8 6-8 6V4z" /></svg>
                </button>
              ) : (
                <span className="w-4 flex-shrink-0" />
              )}
              <div className="min-w-0 flex-1" onClick={() => {
                if (activeWsTab.isHome) {
                  openSprintInTab(sprint.id, projectId);
                } else {
                  navigateTab(activeWsTab.id, { projectId: activeWsTab.projectId, sprintId: sprint.id });
                }
              }}>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">{sprint.title}</span>
                  {obsidianVaultName && sprint.obsidian_path && (
                    <a
                      href={buildObsidianUri(obsidianVaultName, sprint.obsidian_path)}
                      onClick={(e) => e.stopPropagation()}
                      title="Open in Obsidian"
                      className="text-purple-400 hover:text-purple-300 transition-colors shrink-0"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
                    </a>
                  )}
                  {!isSimple && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase flex-shrink-0 ${statusColors[sprint.status] || statusColors.planned}`}>
                      {sprint.status}
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                  {!isSimple && sprint.sprint_number && <><span>Sprint {sprint.sprint_number}</span><span>·</span></>}
                  <span>{sprint.open_tasks || 0} open · {sprint.done_tasks || 0} done</span>
                  {!isSimple && days && <><span>·</span><span>{days}d</span></>}
                  {!isSimple && sprint.start_date && (
                    <>
                      <span>·</span>
                      <span>{formatDate(sprint.start_date)}{sprint.end_date && ` – ${formatDate(sprint.end_date)}`}</span>
                    </>
                  )}
                </div>
                {!isSimple && sprint.status === 'active' && totalTasks > 0 && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">{progress}%</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0 ml-3" onClick={e => e.stopPropagation()}>
              <StartPomoButton focusItems={[
                { id: sprint.id, type: 'sprint', title: sprint.title } as FocusItem,
                ...(project ? [{ id: project.id, type: 'project' as const, title: project.title, color: project.hex_color } as FocusItem] : []),
              ]} />
              <button onClick={() => openEditSprint(sprint, projectId)} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1" title={`Edit ${modeLabel(project?.project_mode || 'simple').toLowerCase()}`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                </svg>
              </button>
              {!isSimple && sprint.status === 'planned' && (
                <button onClick={() => handleStatusChange(sprint.id, 'active')} className="text-xs text-green-600 hover:text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded hover:bg-green-50 dark:hover:bg-green-900/20">Start</button>
              )}
              {!isSimple && sprint.status === 'active' && (
                <button onClick={() => handleStatusChange(sprint.id, 'completed')} className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20">Complete</button>
              )}
              {!isSimple && sprint.status === 'completed' && (
                <button onClick={() => handleStatusChange(sprint.id, 'active')} className="text-xs text-green-600 hover:text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded hover:bg-green-50 dark:hover:bg-green-900/20">Reopen</button>
              )}
              <button onClick={() => handleToggleSprintArchive(sprint.id)} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1" title={sprint.archived ? 'Unarchive' : 'Archive'}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                </svg>
              </button>
              <button onClick={() => promptDeleteSprint(sprint.id, projectId)} className="text-xs text-red-400 hover:text-red-600 p-1" title={`Delete ${modeLabel(project?.project_mode || 'simple').toLowerCase()}`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Expanded sprint tasks */}
        {isSprintExpanded && (
          <div className="border-b border-gray-100 dark:border-gray-700/50 bg-gray-50/30 dark:bg-gray-800/30">
            {isLoadingTasks ? (
              <div className="pl-10 pr-4 py-3 text-xs text-gray-400">Loading tasks...</div>
            ) : tasks.length === 0 ? (
              <div className="pl-10 pr-4 py-3 text-xs text-gray-400">No tasks</div>
            ) : (
              tasks.map((task: any) => {
                const hasChecklist = (task.checklist_count?.total || 0) > 0;
                const isTaskExpanded = hasChecklist && !collapsedSprintTasks.has(task.id);
                return (
                  <React.Fragment key={task.id}>
                    <div className="pl-8 pr-4 py-1.5 flex items-center gap-2 hover:bg-gray-100/50 dark:hover:bg-gray-700/20">
                      {/* Checklist expand chevron */}
                      {hasChecklist ? (
                        <button
                          onClick={() => setCollapsedSprintTasks(prev => {
                            const next = new Set(prev);
                            if (next.has(task.id)) next.delete(task.id); else next.add(task.id);
                            return next;
                          })}
                          className={`p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0 transition-transform ${isTaskExpanded ? 'rotate-90' : ''}`}
                        >
                          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path d="M6 4l8 6-8 6V4z" /></svg>
                        </button>
                      ) : (
                        <span className="w-3.5 flex-shrink-0" />
                      )}
                      <button
                        onClick={() => handleToggleSprintTask(task.id, sprint.id)}
                        className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                          task.done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 dark:border-gray-600 hover:border-green-400'
                        }`}
                      >
                        {task.done ? <svg className="w-2 h-2" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> : null}
                      </button>
                      <span
                        className={`text-xs flex-1 cursor-pointer ${task.done ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-200'}`}
                        onClick={() => setEditingProjectTask(task)}
                      >
                        {task.title}
                      </span>
                      {/* Right-aligned pills */}
                      <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
                        {hasChecklist && !isTaskExpanded && (
                          <span className={`text-[10px] ${
                            task.checklist_count.done === task.checklist_count.total ? 'text-green-500' : 'text-gray-400'
                          }`}>☑ {task.checklist_count.done}/{task.checklist_count.total}</span>
                        )}
                        {task.task_type && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            task.task_type === 'bug' ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300' :
                            task.task_type === 'feature' ? 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-300' :
                            task.task_type === 'story' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300' :
                            'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                          }`}>{task.task_type}</span>
                        )}
                        {task.bucket_title && !task.done && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleMoveToBucket(task, sprint.id); }}
                            className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium cursor-pointer hover:opacity-80 transition-opacity ${
                            task.bucket_title.toLowerCase().includes('progress') ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300' :
                            task.bucket_title.toLowerCase().includes('review') ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300' :
                            task.bucket_title.toLowerCase().includes('done') || task.bucket_title.toLowerCase().includes('complete') ? 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-300' :
                            'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                          }`} title={`Stage: ${task.bucket_title} (click to cycle)`}>{task.bucket_emoji ? `${task.bucket_emoji} ` : ''}{task.bucket_title}</button>
                        )}
                        {(task.assignee_name || task.assignee_username) && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">{task.assignee_username || task.assignee_name}</span>
                        )}
                        {task.due_date && !task.done && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                            new Date(task.due_date) < new Date() ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300' :
                            'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                          }`}>{new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        )}
                        {task.priority > 0 && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            task.priority >= 4 ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300' :
                            task.priority >= 3 ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300' :
                            task.priority >= 2 ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/40 dark:text-yellow-300' :
                            'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                          }`}>P{task.priority}</span>
                        )}
                      </div>
                      <StartPomoButton
                        focusItems={[
                          { id: task.id, type: 'task', title: task.title, parentInfo: sprint.title },
                          { id: sprint.id, type: 'sprint', title: sprint.title },
                          ...(project ? [{ id: project.id, type: 'project' as const, title: project.title, color: project.hex_color }] : []),
                        ]}
                        className="opacity-0 group-hover:opacity-100"
                      />
                    </div>
                    {/* Inline checklist items for sprint task */}
                    {isTaskExpanded && task.checklist_items?.length > 0 && (
                      <div className="bg-gray-50/50 dark:bg-gray-800/30">
                        {task.checklist_items.map((item: any) => (
                          <div key={item.id} className="flex items-center gap-2 pl-16 pr-4 py-1 hover:bg-gray-100/50 dark:hover:bg-gray-700/20">
                            <button
                              onClick={() => handleToggleSprintCheckItem(sprint.id, task.id, item.id, item.done)}
                              className={`w-3 h-3 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                                item.done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 dark:border-gray-600 hover:border-green-400'
                              }`}
                            >
                              {item.done ? <svg className="w-2 h-2" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> : null}
                            </button>
                            <span className={`text-[11px] ${item.done ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-600 dark:text-gray-300'}`}>{item.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </div>
        )}
      </React.Fragment>
    );
  };

  // ── Project Card (smart summary view) ──────────────────────────

  // ── Home Card (compact grid card) ────────────────────────────

  const renderHomeCard = (project: Project) => {
    const { display: displaySprints, total: totalSprints, plannedCount } = getSmartSprints(project.id);
    const activeSprint = displaySprints.find(s => s.status === 'active');
    const totalTasks = activeSprint ? (activeSprint.open_tasks || 0) + (activeSprint.done_tasks || 0) : 0;
    const progress = totalTasks > 0 ? Math.round(((activeSprint!.done_tasks || 0) / totalTasks) * 100) : 0;

    return (
      <div
        key={project.id}
        onClick={() => { activeWsTab.isHome ? openProjectInTab(project.id) : setSelectedProject(project.id); }}
        className="bg-white dark:bg-gray-800 rounded-xl shadow-md overflow-hidden cursor-pointer hover:shadow-lg transition-shadow flex flex-col"
      >
        {/* Color banner */}
        <div className="h-2" style={{ backgroundColor: project.hex_color || '#3b82f6' }} />

        <div className="p-4 flex-1 flex flex-col">
          {/* Title + type */}
          <div className="flex items-start justify-between mb-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{project.title}</h3>
              {project.parent_project_id && (() => {
                const parent = projects.find(p => p.id === project.parent_project_id);
                return parent ? <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate block">↳ {parent.title}</span> : null;
              })()}
              {project.archived ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-300 font-medium uppercase inline-block mt-1">Archived</span>
              ) : project.type ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 font-medium uppercase inline-block mt-1">{project.type}</span>
              ) : null}
            </div>
          </div>

          {/* Stats */}
          <div className="text-xs text-gray-400 dark:text-gray-500 mb-3">
            {project.open_tasks} open · {project.done_tasks} done
            {(project.project_mode || 'simple') === 'sprint' && plannedCount > 0 && ` · ${plannedCount} planned`}
            {totalSprints > 0 && ` · ${totalSprints} ${modeLabel(project.project_mode || 'simple', totalSprints !== 1).toLowerCase()}`}
          </div>

          {/* Active sprint progress or next sprint info */}
          <div className="mt-auto">
            {activeSprint ? (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-green-600 dark:text-green-400 truncate">{activeSprint.title}</span>
                  <span className="text-[10px] text-gray-400 ml-1">{progress}%</span>
                </div>
                <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
            ) : displaySprints.length > 0 ? (
              <div className="text-xs text-gray-400 dark:text-gray-500">
                {displaySprints[0].status === 'completed' ? `Last: ${displaySprints[0].title}` : `Next: ${displaySprints[0].title}`}
              </div>
            ) : (
              <div className="text-xs text-gray-400 dark:text-gray-500">No {modeLabel(project.project_mode || 'simple', true).toLowerCase()}</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── Project List Card (full-width with sprint rows) ────────────

  const renderProjectCard = (project: Project) => {
    const { display: displaySprints, total: totalSprints, plannedCount } = getSmartSprints(project.id);
    const allSprints = sprintsByProject[project.id] || [];
    const isProjectExpanded = expandedProjects.has(project.id);

    return (
      <div key={project.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
        {/* Project header — clickable to open detail view */}
        <div
          className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
          onClick={() => { activeWsTab.isHome ? openProjectInTab(project.id) : setSelectedProject(project.id); }}
        >
          <div className="flex items-center gap-2">
            {/* Expand chevron */}
            {totalSprints > 0 ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedProjects(prev => {
                    const next = new Set(prev);
                    if (next.has(project.id)) next.delete(project.id); else next.add(project.id);
                    return next;
                  });
                }}
                className={`p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0 transition-transform ${isProjectExpanded ? 'rotate-90' : ''}`}
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M6 4l8 6-8 6V4z" /></svg>
              </button>
            ) : (
              <span className="w-4 flex-shrink-0" />
            )}
            {project.hex_color && (
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: project.hex_color }} />
            )}
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">{project.title}</h2>
            {project.parent_project_id && (() => {
              const parent = projects.find(p => p.id === project.parent_project_id);
              return parent ? <span className="text-[10px] text-gray-400 dark:text-gray-500">↳ {parent.title}</span> : null;
            })()}
            {project.type && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 font-medium uppercase">{project.type}</span>
            )}
            <span className="text-xs text-gray-400">
              {project.open_tasks} open · {project.done_tasks} done
              {plannedCount > 0 && ` · ${plannedCount} planned`}
            </span>
          </div>
          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            <button onClick={() => openNewSprint(project.id)} className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">+ {modeLabel(project.project_mode || 'simple')}</button>
          </div>
        </div>

        {isProjectExpanded ? (
          /* Expanded: show ALL sprints */
          allSprints.length === 0 ? (
            <div className="py-5 text-center text-gray-400 dark:text-gray-500 text-sm">No {modeLabel(project.project_mode || 'simple', true).toLowerCase()} yet.</div>
          ) : (
            <div>
              {allSprints.map(sprint => renderSprintRow(sprint, project.id))}
            </div>
          )
        ) : (
          /* Collapsed: smart preview */
          <>
            {displaySprints.length === 0 ? (
              <div className="py-5 text-center text-gray-400 dark:text-gray-500 text-sm">No {modeLabel(project.project_mode || 'simple', true).toLowerCase()} yet.</div>
            ) : (
              <div>
                {displaySprints.map(sprint => renderSprintRow(sprint, project.id))}
              </div>
            )}
            {totalSprints > displaySprints.length && (
              <button
                onClick={() => { activeWsTab.isHome ? openProjectInTab(project.id) : setSelectedProject(project.id); }}
                className="w-full px-4 py-2 text-xs text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors border-t border-gray-100 dark:border-gray-700/50"
              >
                View all {totalSprints} {modeLabel(project.project_mode || 'simple', true).toLowerCase()} →
              </button>
            )}
          </>
        )}
      </div>
    );
  };

  // ── Project Detail View ────────────────────────────────────────

  const renderProjectDetail = () => {
    const project = projects.find(p => p.id === selectedProject);
    if (!project) return null;

    const allSprints = sprintsByProject[project.id] || [];
    const filtered = sprintStatusFilter === 'all'
      ? allSprints
      : allSprints.filter(s => s.status === sprintStatusFilter);
    const sorted = [...filtered].sort((a, b) => b.sprint_number - a.sprint_number);

    const counts = {
      all: allSprints.length,
      planned: allSprints.filter(s => s.status === 'planned').length,
      active: allSprints.filter(s => s.status === 'active').length,
      completed: allSprints.filter(s => s.status === 'completed').length,
    };

    return (
      <div>
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button
            onClick={() => setSelectedProject(null)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {project.hex_color && <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: project.hex_color }} />}
            <div className="min-w-0">
              {project.parent_project_id && (() => {
                const parent = projects.find(p => p.id === project.parent_project_id);
                return parent ? (
                  <button onClick={() => { setSelectedProject(parent.id); }} className="text-xs text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 truncate block">
                    {parent.title} ›
                  </button>
                ) : null;
              })()}
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">{project.title}</h1>
              {obsidianVaultName && project.obsidian_path && (
                <a
                  href={buildObsidianUri(obsidianVaultName, project.obsidian_path)}
                  title="Open in Obsidian"
                  className="ml-1 text-purple-400 hover:text-purple-300 transition-colors shrink-0"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
                </a>
              )}
            </div>
            {project.type && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 font-medium uppercase">{project.type}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => openEditProject(project)} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700">Edit</button>
            <button
              onClick={() => handleToggleArchive(project.id)}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              {project.archived ? 'Unarchive' : 'Archive'}
            </button>
            <button onClick={() => promptDeleteProject(project.id)} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20">Delete</button>
            {!project.archived && (
              <>
                <button onClick={() => { setShowProjectTaskInput(true); setTimeout(() => document.getElementById('project-task-input')?.focus(), 50); }} className="text-xs px-2.5 py-1.5 bg-gray-600 text-white rounded hover:bg-gray-700">+ Task</button>
                <button onClick={() => openNewSprint(project.id)} className="text-xs px-2.5 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700">+ {modeLabel(project.project_mode || 'simple')}</button>
              </>
            )}
          </div>
        </div>

        {project.description && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{project.description}</p>
        )}

        {/* Child projects */}
        {(() => {
          const children = projects.filter(p => p.parent_project_id === project.id && !p.archived);
          if (children.length === 0) return null;
          return (
            <div className="mb-4">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Sub-projects</h3>
              <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
                {children.map(child => (
                  <button
                    key={child.id}
                    onClick={() => { setSelectedProject(child.id); }}
                    className="text-left bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      {child.hex_color && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: child.hex_color }} />}
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{child.title}</span>
                    </div>
                    <span className="text-[10px] text-gray-400">{child.open_tasks} open · {child.done_tasks} done</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Sprint status filter pills — only for sprint mode */}
        {(project.project_mode || 'simple') === 'sprint' && (
          <div className="flex gap-1.5 mb-4">
            {(['all', 'active', 'planned', 'completed'] as const).map(status => (
              <button
                key={status}
                onClick={() => setSprintStatusFilter(status)}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  sprintStatusFilter === status
                    ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800 border-gray-800 dark:border-gray-200'
                    : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-gray-400'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
                <span className="ml-1 opacity-60">{counts[status]}</span>
              </button>
            ))}
          </div>
        )}

        {/* Project-level tasks */}
        {(projectTasks.length > 0 || showProjectTaskInput) && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden mb-4">
            <div className="px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Project Tasks</h3>
                <button
                  onClick={() => setShowProjectBucketSettings(v => !v)}
                  className={`p-0.5 rounded transition-colors ${showProjectBucketSettings ? 'text-blue-500' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                  title="Manage stages"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              </div>
              <span className="text-[10px] text-gray-400">{projectTasks.filter(t => !t.done).length} open · {projectTasks.filter(t => t.done).length} done</span>
            </div>
            {showProjectBucketSettings && (
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750 space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Stages</span>
                  <button onClick={handleAddProjectBucket} className="text-[10px] text-blue-500 hover:text-blue-600 font-medium">+ Add</button>
                </div>
                {projectBuckets.map((bucket: any) => (
                  <div key={bucket.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="text"
                      value={bucket.emoji || ''}
                      onChange={(e) => handleUpdateProjectBucket(bucket.id, { emoji: e.target.value.slice(0, 4) || null })}
                      className="w-8 text-center bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-0.5 py-0.5 text-sm"
                      placeholder="🔹"
                      title="Emoji"
                    />
                    <input
                      type="text"
                      defaultValue={bucket.title}
                      onBlur={(e) => {
                        const val = e.target.value.trim();
                        if (val && val !== bucket.title) handleUpdateProjectBucket(bucket.id, { title: val });
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      className="flex-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-1.5 py-0.5 text-gray-800 dark:text-gray-200"
                    />
                    <label className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 cursor-pointer" title="Show inline in task list">
                      <input
                        type="checkbox"
                        checked={!!bucket.show_inline}
                        onChange={() => handleUpdateProjectBucket(bucket.id, { show_inline: !bucket.show_inline })}
                        className="w-3 h-3 rounded"
                      />
                      inline
                    </label>
                    <label className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 cursor-pointer" title="Mark as done column">
                      <input
                        type="checkbox"
                        checked={!!bucket.is_done_column}
                        onChange={() => handleUpdateProjectBucket(bucket.id, { is_done_column: !bucket.is_done_column })}
                        className="w-3 h-3 rounded"
                      />
                      done
                    </label>
                    {!bucket.is_done_column && (
                      <button
                        onClick={() => { if (confirm('Delete this stage? Tasks will be unassigned.')) handleDeleteProjectBucket(bucket.id); }}
                        className="p-0.5 text-gray-400 hover:text-red-500 transition-colors"
                        title="Delete stage"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {projectTasks.map((task: any) => {
              const hasChecklist = (task.checklist_count?.total || 0) > 0;
              const isTaskExpanded = hasChecklist && !collapsedProjectTasks.has(task.id);
              return (
                <React.Fragment key={task.id}>
                  <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700/50 last:border-b-0 flex items-center gap-2 group hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    {/* Expand chevron */}
                    {hasChecklist ? (
                      <button
                        onClick={() => setCollapsedProjectTasks(prev => {
                          const next = new Set(prev);
                          if (next.has(task.id)) next.delete(task.id); else next.add(task.id);
                          return next;
                        })}
                        className={`p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0 transition-transform ${isTaskExpanded ? 'rotate-90' : ''}`}
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M6 4l8 6-8 6V4z" /></svg>
                      </button>
                    ) : (
                      <span className="w-4 flex-shrink-0" />
                    )}
                    <button
                      onClick={() => handleToggleProjectTask(task.id)}
                      className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                        task.done
                          ? 'bg-green-500 border-green-500 text-white'
                          : 'border-gray-300 dark:border-gray-600 hover:border-green-400'
                      }`}
                    >
                      {task.done && (
                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                    <span
                      className={`text-sm flex-1 cursor-pointer ${task.done ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}
                      onClick={() => setEditingProjectTask(task)}
                    >
                      {task.title}
                    </span>
                    {/* Right-aligned pills */}
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
                      {hasChecklist && !isTaskExpanded && (
                        <span className={`text-[10px] px-1 rounded ${
                          task.checklist_count.done === task.checklist_count.total
                            ? 'bg-green-50 dark:bg-green-900/30 text-green-500 dark:text-green-400'
                            : 'text-gray-400 dark:text-gray-500'
                        }`}>☑ {task.checklist_count.done}/{task.checklist_count.total}</span>
                      )}
                      {task.task_type && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          task.task_type === 'bug' ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300' :
                          task.task_type === 'feature' ? 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-300' :
                          task.task_type === 'story' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300' :
                          'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                        }`}>{task.task_type}</span>
                      )}
                      {task.bucket_title && !task.done && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMoveToBucket(task); }}
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium cursor-pointer hover:opacity-80 transition-opacity ${
                          task.bucket_title.toLowerCase().includes('progress') ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300' :
                          task.bucket_title.toLowerCase().includes('review') ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300' :
                          task.bucket_title.toLowerCase().includes('done') || task.bucket_title.toLowerCase().includes('complete') ? 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-300' :
                          'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                        }`} title={`Stage: ${task.bucket_title} (click to cycle)`}>{task.bucket_emoji ? `${task.bucket_emoji} ` : ''}{task.bucket_title}</button>
                      )}
                      {(task.assignee_name || task.assignee_username) && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">{task.assignee_username || task.assignee_name}</span>
                      )}
                      {task.due_date && !task.done && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          new Date(task.due_date) < new Date() ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300' :
                          'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                        }`}>{new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      )}
                      {task.priority > 0 && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          task.priority >= 4 ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300' :
                          task.priority >= 3 ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300' :
                          task.priority >= 2 ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/40 dark:text-yellow-300' :
                          'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                        }`}>P{task.priority}</span>
                      )}
                    </div>
                    <StartPomoButton
                      focusItems={[
                        { id: task.id, type: 'task', title: task.title, parentInfo: project?.title },
                        ...(project ? [{ id: project.id, type: 'project' as const, title: project.title, color: project.hex_color }] : []),
                        ...(task.sprint_id && task.sprint_title ? [{ id: task.sprint_id, type: 'sprint' as const, title: task.sprint_title }] : []),
                      ]}
                      className="opacity-0 group-hover:opacity-100"
                    />
                    <button
                      onClick={() => handleDeleteProjectTask(task.id)}
                      className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  {/* Inline checklist items */}
                  {isTaskExpanded && task.checklist_items?.length > 0 && (
                    <div className="border-b border-gray-100 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/50">
                      {task.checklist_items.map((item: any) => (
                        <div key={item.id} className="flex items-center gap-2 pl-14 pr-4 py-1 hover:bg-gray-100/50 dark:hover:bg-gray-700/30">
                          <button
                            onClick={() => handleToggleProjectCheckItem(task.id, item.id, item.done)}
                            className={`w-3 h-3 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                              item.done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 dark:border-gray-600 hover:border-green-400'
                            }`}
                          >
                            {item.done ? <svg className="w-2 h-2" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> : null}
                          </button>
                          <span className={`text-xs ${item.done ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-600 dark:text-gray-300'}`}>{item.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
            {showProjectTaskInput && (
              <div className="px-4 py-2 flex items-center gap-2">
                <input
                  id="project-task-input"
                  type="text"
                  value={newProjectTaskTitle}
                  onChange={e => setNewProjectTaskTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAddProjectTask();
                    if (e.key === 'Escape') { setShowProjectTaskInput(false); setNewProjectTaskTitle(''); }
                  }}
                  placeholder="Task title..."
                  className="flex-1 border border-gray-300 dark:border-gray-600 rounded px-2.5 py-1.5 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
                <button
                  onClick={handleAddProjectTask}
                  disabled={!newProjectTaskTitle.trim()}
                  className="text-xs px-2.5 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  Add
                </button>
                <button
                  onClick={() => { setShowProjectTaskInput(false); setNewProjectTaskTitle(''); }}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Sprint/section list */}
        {sorted.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md py-12 text-center text-gray-400 dark:text-gray-500 text-sm">
            {sprintStatusFilter === 'all'
              ? `No ${modeLabel(project.project_mode || 'simple', true).toLowerCase()} yet. Create one to get started!`
              : `No ${sprintStatusFilter} ${modeLabel(project.project_mode || 'simple', true).toLowerCase()}.`}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
            {sorted.map(sprint => renderSprintRow(sprint, project.id))}
          </div>
        )}
      </div>
    );
  };

  // ── Loading State ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
        <div className="container mx-auto px-4 sm:px-16 py-8">
          <p className="text-gray-400 text-center py-12">Loading...</p>
        </div>
      </div>
    );
  }

  // ── Main Render ────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* Workspace tab bar */}
      {workspaceTabs.length >= 1 && (
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-16">
          <div className="container mx-auto flex items-center gap-0.5 h-9 overflow-x-auto">
            {workspaceTabs.map(tab => (
              <div
                key={tab.id}
                className={`group flex items-center gap-1.5 px-3 h-full text-xs cursor-pointer border-b-2 transition-colors flex-shrink-0 ${
                  tab.id === activeWorkspaceTabId
                    ? 'border-blue-500 text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-700/50'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/30'
                }`}
                onClick={() => switchWorkspaceTab(tab.id)}
              >
                {tab.projectId && (() => {
                  const p = projects.find(pr => pr.id === tab.projectId);
                  return p?.hex_color ? <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.hex_color }} /> : null;
                })()}
                <span className="truncate max-w-[120px]">{getTabLabel(tab)}</span>
                {workspaceTabs.length > 1 && !tab.isHome && (
                  <button
                    onClick={e => { e.stopPropagation(); closeWorkspaceTab(tab.id); }}
                    className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => addWorkspaceTab()}
              className="h-full px-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0"
              title="New tab"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            </button>
          </div>
        </div>
      )}

      {/* Sprint board renders full-width (has its own header) */}
      {selectedSprint ? (
        <SprintBoardContent
          sprintId={selectedSprint}
          onBack={() => goBackInTab(activeWsTab.id)}
        />
      ) : (
      <div className="container mx-auto px-4 sm:px-16 py-8">
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-2 font-bold">×</button>
          </div>
        )}

        {/* Project detail / project list */}
        {selectedProject ? renderProjectDetail() : (
          <>
            {/* Tab bar + View controls + New Project */}
            <div className="flex items-center justify-between mb-5 gap-3">
              <div className="flex gap-1.5 flex-wrap">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      activeTab === tab.id
                        ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800 border-gray-800 dark:border-gray-200'
                        : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-gray-400'
                    }`}
                  >
                    {tab.label}
                    {tab.id !== 'home' && tab.id !== 'all' && (
                      <span className="ml-1 opacity-60">{projects.filter(p => (p.type || 'personal') === tab.id.slice(5)).length}</span>
                    )}
                    {tab.id === 'all' && <span className="ml-1 opacity-60">{projects.length}</span>}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* View mode toggle */}
                <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <button
                    onClick={() => updateViewMode('card')}
                    className={`p-1.5 transition-colors ${projectViewMode === 'card' ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800' : 'bg-white dark:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                    title="Card view"
                  >
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16"><rect x="1" y="1" width="6" height="6" rx="1" /><rect x="9" y="1" width="6" height="6" rx="1" /><rect x="1" y="9" width="6" height="6" rx="1" /><rect x="9" y="9" width="6" height="6" rx="1" /></svg>
                  </button>
                  <button
                    onClick={() => updateViewMode('list')}
                    className={`p-1.5 transition-colors ${projectViewMode === 'list' ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800' : 'bg-white dark:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                    title="List view"
                  >
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16"><rect x="1" y="1" width="14" height="3" rx="1" /><rect x="1" y="6.5" width="14" height="3" rx="1" /><rect x="1" y="12" width="14" height="3" rx="1" /></svg>
                  </button>
                </div>

                {/* Card size selector — only in card view */}
                {projectViewMode === 'card' && (
                  <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    {CARD_SIZES.map(s => (
                      <button
                        key={s.id}
                        onClick={() => updateCardSize(s.id)}
                        className={`px-1.5 py-1 text-[10px] font-medium transition-colors ${
                          cardSize === s.id
                            ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800'
                            : 'bg-white dark:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                        }`}
                        title={`${s.label} cards`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Sort selector */}
                <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  {([['alpha', 'A→Z'], ['recent', '↻'], ['created', '🕐']] as [ProjectSort, string][]).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => updateProjectSort(id)}
                      className={`px-1.5 py-1 text-[10px] font-medium transition-colors ${
                        projectSort === id
                          ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800'
                          : 'bg-white dark:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                      }`}
                      title={id === 'alpha' ? 'Sort alphabetically' : id === 'recent' ? 'Sort by recently updated' : 'Sort by creation date'}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Card subproject mode — only in card view when subprojects exist */}
                {projectViewMode === 'card' && childrenByProject.size > 0 && (
                  <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <button
                      onClick={() => updateCardSubprojectMode('grouped')}
                      className={`px-1.5 py-1 text-[10px] font-medium transition-colors ${
                        cardSubprojectMode === 'grouped'
                          ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800'
                          : 'bg-white dark:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                      }`}
                      title="Group: parent and subprojects sorted together"
                    >
                      ≡
                    </button>
                    <button
                      onClick={() => updateCardSubprojectMode('nested')}
                      className={`px-1.5 py-1 text-[10px] font-medium transition-colors ${
                        cardSubprojectMode === 'nested'
                          ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800'
                          : 'bg-white dark:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                      }`}
                      title="Nest: subprojects shown inside parent cards"
                    >
                      ⊞
                    </button>
                  </div>
                )}

                {archivedCount > 0 && (
                  <button
                    onClick={() => setShowArchived(!showArchived)}
                    className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
                      showArchived
                        ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                    }`}
                  >
                    Archived ({archivedCount})
                  </button>
                )}
                <button
                  onClick={openNewProject}
                  className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  + New Project
                </button>
              </div>
            </div>

            {filteredProjects.length === 0 ? (
              <div className="text-center py-16">
                <svg className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
                <p className="text-gray-500 dark:text-gray-400 mb-2">
                  {activeTab === 'home' ? 'No projects yet' : 'No projects in this category'}
                </p>
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  Click "+ New Project" to create one.
                </p>
              </div>
            ) : projectViewMode === 'card' ? (
              cardSubprojectMode === 'nested' ? (
                /* Nested mode: larger parent cards with subproject mini-cards inside */
                <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${Math.max(cardWidth, 280)}px, 1fr))` }}>
                  {topLevelProjects.map(project => {
                    const children = childrenByProject.get(project.id) || [];
                    return (
                      <div key={project.id} className="flex flex-col">
                        {renderHomeCard(project)}
                        {children.length > 0 && (
                          <div className="ml-3 mt-1 space-y-1">
                            {children.map(child => (
                              <div
                                key={child.id}
                                onClick={() => { activeWsTab.isHome ? openProjectInTab(child.id) : setSelectedProject(child.id); }}
                                className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow flex items-center gap-2 px-3 py-2 border-l-[3px]"
                                style={{ borderLeftColor: child.hex_color || '#3b82f6' }}
                              >
                                <div className="min-w-0 flex-1">
                                  <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate block">{child.title}</span>
                                  <span className="text-[10px] text-gray-400">{child.open_tasks} open · {child.done_tasks} done</span>
                                </div>
                                {child.type && <span className="text-[9px] px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 font-medium uppercase flex-shrink-0">{child.type}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Grouped mode: parent and subprojects sorted together as separate cards */
                <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))` }}>
                  {filteredProjects.map(project => renderHomeCard(project))}
                </div>
              )
            ) : (
              /* List view: subprojects nested within parent cards */
              <div className="space-y-6">
                {topLevelProjects.map(project => {
                  const children = childrenByProject.get(project.id) || [];
                  return (
                    <div key={project.id}>
                      {renderProjectCard(project)}
                      {children.length > 0 && (
                        <div className="ml-6 mt-2 space-y-3 border-l-2 border-gray-200 dark:border-gray-700 pl-4">
                          {children.map(child => renderProjectCard(child))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
      )}

      {/* ── Sprint/Section Create/Edit Modal ─────────────────────── */}
      {sprintModalProjectId && (() => {
        const modalProject = projects.find(p => p.id === sprintModalProjectId);
        const modalIsSimple = (modalProject?.project_mode || 'simple') === 'simple';
        const label = modeLabel(modalProject?.project_mode || 'simple');
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={closeSprintModal}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{editingSprint ? `Edit ${label}` : `New ${label}`}</h3>
              <button onClick={closeSprintModal} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label} Title <span className="text-red-400">*</span></label>
                <input type="text" value={sprintForm.title} onChange={e => setSprintForm(f => ({ ...f, title: e.target.value }))} placeholder={modalIsSimple ? 'e.g. Backlog, Ideas, v1.0' : 'e.g. Sprint 1 — Auth & Login'} autoFocus className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Description</label>
                <textarea value={sprintForm.description} onChange={e => setSprintForm(f => ({ ...f, description: e.target.value }))} placeholder={modalIsSimple ? 'What is this section for?' : 'Sprint goal or focus area...'} rows={2} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none" />
              </div>
              {!modalIsSimple && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Start Date</label>
                      <input type="date" value={sprintForm.start_date} onChange={e => setSprintForm(f => ({ ...f, start_date: e.target.value }))} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">End Date</label>
                      <input type="date" value={sprintForm.end_date} onChange={e => setSprintForm(f => ({ ...f, end_date: e.target.value }))} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
                    </div>
                  </div>
                  {sprintForm.start_date && sprintForm.end_date && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {Math.ceil((new Date(sprintForm.end_date).getTime() - new Date(sprintForm.start_date).getTime()) / 86400000)} days
                      {' '}({Math.ceil((new Date(sprintForm.end_date).getTime() - new Date(sprintForm.start_date).getTime()) / 86400000 / 7)} weeks)
                    </p>
                  )}
                  {!editingSprint && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">Quick:</span>
                      {[7, 14, 21, 30].map(days => (
                        <button key={days} onClick={() => {
                          const start = sprintForm.start_date || new Date().toISOString().split('T')[0];
                          const end = new Date(new Date(start).getTime() + days * 86400000).toISOString().split('T')[0];
                          setSprintForm(f => ({ ...f, start_date: start, end_date: end }));
                        }} className="text-[11px] px-2 py-0.5 rounded-full border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors">
                          {days === 7 ? '1w' : days === 14 ? '2w' : days === 21 ? '3w' : '1m'}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-2 bg-gray-50 dark:bg-gray-900/50">
              <button onClick={closeSprintModal} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 rounded">Cancel</button>
              <button onClick={handleSaveSprint} disabled={!sprintForm.title.trim() || savingSprint} className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {savingSprint ? 'Saving...' : editingSprint ? `Update ${label}` : `Create ${label}`}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ── Project Create/Edit Modal ────────────────────────────── */}
      {/* Project Task Edit Modal */}
      {editingProjectTask && (
        <TaskEditModal
          task={editingProjectTask}
          columns={editingProjectTask?.sprint_buckets ? editingProjectTask.sprint_buckets.map((b: any) => ({ id: b.id, title: b.title })) : []}
          onSave={(data: any) => { handleSaveProjectTask(data); }}
          onClose={() => setEditingProjectTask(null)}
          showColumnSelector={!!(editingProjectTask?.sprint_buckets?.length)}
          showRelations
          showDates
          showChecklist
        />
      )}

      {showProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={closeProjectModal}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{editingProject ? 'Edit Project' : 'New Project'}</h3>
              <button onClick={closeProjectModal} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Project Name <span className="text-red-400">*</span></label>
                <input type="text" value={projectForm.title} onChange={e => setProjectForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. My App" autoFocus className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
              </div>

              {/* Type */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Type</label>
                <div className="flex flex-wrap gap-1.5">
                  {PROJECT_TYPES.map(t => (
                    <button key={t} onClick={() => setProjectForm(f => ({ ...f, type: t, customType: '' }))} className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${projectForm.type === t ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-400'}`}>
                      {t}
                    </button>
                  ))}
                  <button onClick={() => setProjectForm(f => ({ ...f, type: 'custom' }))} className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${projectForm.type === 'custom' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-400'}`}>
                    Custom
                  </button>
                </div>
                {projectForm.type === 'custom' && (
                  <input type="text" value={projectForm.customType} onChange={e => setProjectForm(f => ({ ...f, customType: e.target.value }))} placeholder="Custom type name..." className="mt-2 w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-xs bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
                )}
              </div>

              {/* Mode */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Mode</label>
                <div className="flex gap-2">
                  <button onClick={() => setProjectForm(f => ({ ...f, project_mode: 'simple' }))} className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${projectForm.project_mode === 'simple' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-400'}`}>
                    Simple
                  </button>
                  <button onClick={() => setProjectForm(f => ({ ...f, project_mode: 'sprint' }))} className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${projectForm.project_mode === 'sprint' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-400'}`}>
                    Sprint
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                  {projectForm.project_mode === 'simple'
                    ? 'Organize tasks into named sections'
                    : 'Time-boxed sprints with kanban boards & lifecycle'}
                </p>
              </div>

              {/* Parent Project */}
              {projects.filter(p => p.id !== editingProject?.id).length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Parent Project</label>
                  <select
                    value={projectForm.parent_project_id}
                    onChange={e => setProjectForm(f => ({ ...f, parent_project_id: e.target.value }))}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  >
                    <option value="">None (top-level)</option>
                    {projects.filter(p => p.id !== editingProject?.id).map(p => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">Nest this project under another project</p>
                </div>
              )}

              {/* Color */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Color</label>
                <div className="flex items-center gap-2">
                  {PRESET_COLORS.map(c => (
                    <button key={c} onClick={() => setProjectForm(f => ({ ...f, hex_color: c }))} className={`w-7 h-7 rounded-full border-2 transition-all ${projectForm.hex_color === c ? 'border-blue-500 scale-110' : 'border-transparent hover:scale-105'}`} style={{ backgroundColor: c }} />
                  ))}
                  <input type="color" value={projectForm.hex_color} onChange={e => setProjectForm(f => ({ ...f, hex_color: e.target.value }))} className="w-7 h-7 rounded-full cursor-pointer border-0 p-0" />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Description</label>
                <textarea value={projectForm.description} onChange={e => setProjectForm(f => ({ ...f, description: e.target.value }))} placeholder="What is this project about?" rows={2} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none" />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-2 bg-gray-50 dark:bg-gray-900/50">
              <button onClick={closeProjectModal} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 rounded">Cancel</button>
              <button onClick={handleSaveProject} disabled={!projectForm.title.trim() || savingProject} className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {savingProject ? 'Saving...' : editingProject ? 'Update Project' : 'Create Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (project or sprint) */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Delete {deleteTarget.type === 'project' ? 'Project' : modeLabel(projects.find(p => p.id === deleteTarget.projectId)?.project_mode || 'simple')}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Are you sure you want to delete &ldquo;{deleteTarget.title}&rdquo;?
            </p>
            {deleteTarget.taskCount > 0 && (
              <label className="flex items-center gap-2 mb-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteWithTasks}
                  onChange={(e) => setDeleteWithTasks(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Also delete all tasks ({deleteTarget.taskCount})
                </span>
              </label>
            )}
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">
              {deleteWithTasks
                ? deleteTarget.type === 'project'
                  ? 'All tasks, sprints, and related data will be permanently deleted.'
                  : 'All tasks and related data will be permanently deleted.'
                : deleteTarget.type === 'project'
                  ? 'Tasks will be kept in your backlog without a project.'
                  : 'Tasks will be moved back to the backlog.'}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
