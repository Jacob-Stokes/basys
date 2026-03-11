import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

interface Project {
  id: string;
  title: string;
  description: string | null;
  hex_color: string;
  type: string;
  open_tasks: number;
  done_tasks: number;
  is_favorite: number;
  archived: number;
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
}

const statusColors: Record<string, string> = {
  planned: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
  active: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300',
  completed: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300',
};

const PRESET_COLORS = ['#e2e8f0', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280'];
const PROJECT_TYPES = ['personal', 'dev', 'design', 'work', 'research', 'learning'];

const emptySprintForm: SprintForm = { title: '', description: '', start_date: '', end_date: '' };
const emptyProjectForm: ProjectForm = { title: '', type: 'personal', customType: '', hex_color: '#3b82f6', description: '' };

export default function Sprints() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [sprintsByProject, setSprintsByProject] = useState<Record<string, Sprint[]>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('home');
  const [error, setError] = useState<string | null>(null);

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

  // Project detail view
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [sprintStatusFilter, setSprintStatusFilter] = useState<string>('all');

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

  const filteredProjects = useMemo(() => {
    if (activeTab === 'all') return projects;
    if (activeTab === 'home') {
      return projects.filter(p => {
        const sprints = sprintsByProject[p.id] || [];
        return sprints.some(s => s.status === 'active' || s.status === 'planned') || p.open_tasks > 0;
      });
    }
    if (activeTab.startsWith('type:')) {
      const type = activeTab.slice(5);
      return projects.filter(p => (p.type || 'personal') === type);
    }
    return projects;
  }, [activeTab, projects, sprintsByProject]);

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

  // ── Sprint Modal ───────────────────────────────────────────────

  const openNewSprint = (projectId: string) => {
    setSprintModalProjectId(projectId);
    setEditingSprint(null);
    const today = new Date().toISOString().split('T')[0];
    const twoWeeks = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
    setSprintForm({ title: '', description: '', start_date: today, end_date: twoWeeks });
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

  const handleDeleteSprint = async (sprintId: string) => {
    if (!confirm('Delete this sprint? Tasks will be moved back to the backlog.')) return;
    try {
      await api.deleteSprint(sprintId);
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm('Delete this project? Tasks will be unlinked but not deleted.')) return;
    try {
      await api.deleteProject(projectId);
      if (selectedProject === projectId) setSelectedProject(null);
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // ── Helpers ────────────────────────────────────────────────────

  const sprintDuration = (s: Sprint) => {
    if (!s.start_date || !s.end_date) return null;
    return Math.ceil((new Date(s.end_date).getTime() - new Date(s.start_date).getTime()) / 86400000);
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  // Get smart sprint summary for a project
  const getSmartSprints = (projectId: string) => {
    const sprints = sprintsByProject[projectId] || [];
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
    const days = sprintDuration(sprint);
    const totalTasks = (sprint.open_tasks || 0) + (sprint.done_tasks || 0);
    const progress = totalTasks > 0 ? Math.round(((sprint.done_tasks || 0) / totalTasks) * 100) : 0;

    return (
      <div
        key={sprint.id}
        onClick={() => navigate(`/sprints/${sprint.id}`)}
        className={`px-4 py-3 border-b border-gray-100 dark:border-gray-700/50 last:border-b-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${
          sprint.status === 'active' ? 'bg-green-50/50 dark:bg-green-900/5' : ''
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">{sprint.title}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase flex-shrink-0 ${statusColors[sprint.status] || statusColors.planned}`}>
                {sprint.status}
              </span>
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span>Sprint {sprint.sprint_number}</span>
              <span>·</span>
              <span>{sprint.open_tasks || 0} open · {sprint.done_tasks || 0} done</span>
              {days && <><span>·</span><span>{days}d</span></>}
              {sprint.start_date && (
                <>
                  <span>·</span>
                  <span>{formatDate(sprint.start_date)}{sprint.end_date && ` – ${formatDate(sprint.end_date)}`}</span>
                </>
              )}
            </div>
            {sprint.status === 'active' && totalTasks > 0 && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">{progress}%</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-3" onClick={e => e.stopPropagation()}>
            <button onClick={() => openEditSprint(sprint, projectId)} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1" title="Edit sprint">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
              </svg>
            </button>
            {sprint.status === 'planned' && (
              <button onClick={() => handleStatusChange(sprint.id, 'active')} className="text-xs text-green-600 hover:text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded hover:bg-green-50 dark:hover:bg-green-900/20">Start</button>
            )}
            {sprint.status === 'active' && (
              <button onClick={() => handleStatusChange(sprint.id, 'completed')} className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20">Complete</button>
            )}
            {sprint.status === 'completed' && (
              <button onClick={() => handleStatusChange(sprint.id, 'active')} className="text-xs text-green-600 hover:text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded hover:bg-green-50 dark:hover:bg-green-900/20">Reopen</button>
            )}
            <button onClick={() => handleDeleteSprint(sprint.id)} className="text-xs text-red-400 hover:text-red-600 p-1" title="Delete sprint">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            </button>
          </div>
        </div>
      </div>
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
        onClick={() => { setSelectedProject(project.id); setSprintStatusFilter('all'); }}
        className="bg-white dark:bg-gray-800 rounded-xl shadow-md overflow-hidden cursor-pointer hover:shadow-lg transition-shadow flex flex-col"
      >
        {/* Color banner */}
        <div className="h-2" style={{ backgroundColor: project.hex_color || '#3b82f6' }} />

        <div className="p-4 flex-1 flex flex-col">
          {/* Title + type */}
          <div className="flex items-start justify-between mb-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{project.title}</h3>
              {project.type && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 font-medium uppercase inline-block mt-1">{project.type}</span>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="text-xs text-gray-400 dark:text-gray-500 mb-3">
            {project.open_tasks} open · {project.done_tasks} done
            {plannedCount > 0 && ` · ${plannedCount} planned`}
            {totalSprints > 0 && ` · ${totalSprints} sprint${totalSprints !== 1 ? 's' : ''}`}
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
              <div className="text-xs text-gray-400 dark:text-gray-500">No sprints</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── Project List Card (full-width with sprint rows) ────────────

  const renderProjectCard = (project: Project) => {
    const { display: displaySprints, total: totalSprints, plannedCount } = getSmartSprints(project.id);

    return (
      <div key={project.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
        {/* Project header — clickable to open detail view */}
        <div
          className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
          onClick={() => { setSelectedProject(project.id); setSprintStatusFilter('all'); }}
        >
          <div className="flex items-center gap-2">
            {project.hex_color && (
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: project.hex_color }} />
            )}
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">{project.title}</h2>
            {project.type && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 font-medium uppercase">{project.type}</span>
            )}
            <span className="text-xs text-gray-400">
              {project.open_tasks} open · {project.done_tasks} done
              {plannedCount > 0 && ` · ${plannedCount} planned`}
            </span>
          </div>
          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            <button onClick={() => openNewSprint(project.id)} className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">+ Sprint</button>
          </div>
        </div>

        {/* Smart sprint display */}
        {displaySprints.length === 0 ? (
          <div className="py-5 text-center text-gray-400 dark:text-gray-500 text-sm">No sprints yet.</div>
        ) : (
          <div>
            {displaySprints.map(sprint => renderSprintRow(sprint, project.id))}
          </div>
        )}

        {/* View all link if there are more sprints */}
        {totalSprints > displaySprints.length && (
          <button
            onClick={() => { setSelectedProject(project.id); setSprintStatusFilter('all'); }}
            className="w-full px-4 py-2 text-xs text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors border-t border-gray-100 dark:border-gray-700/50"
          >
            View all {totalSprints} sprints →
          </button>
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
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">{project.title}</h1>
            {project.type && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 font-medium uppercase">{project.type}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => openEditProject(project)} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700">Edit</button>
            <button onClick={() => handleDeleteProject(project.id)} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20">Delete</button>
            <button onClick={() => openNewSprint(project.id)} className="text-xs px-2.5 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700">+ Sprint</button>
          </div>
        </div>

        {project.description && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{project.description}</p>
        )}

        {/* Sprint status filter pills */}
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

        {/* Sprint list */}
        {sorted.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md py-12 text-center text-gray-400 dark:text-gray-500 text-sm">
            {sprintStatusFilter === 'all' ? 'No sprints yet. Create one to get started!' : `No ${sprintStatusFilter} sprints.`}
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
        <div className="max-w-4xl mx-auto p-6">
          <p className="text-gray-400 text-center py-12">Loading...</p>
        </div>
      </div>
    );
  }

  // ── Main Render ────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto p-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-2 font-bold">×</button>
          </div>
        )}

        {/* If a project is selected, show detail view */}
        {selectedProject ? renderProjectDetail() : (
          <>
            {/* Tab bar + New Project button */}
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
              <button
                onClick={openNewProject}
                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex-shrink-0"
              >
                + New Project
              </button>
            </div>

            {filteredProjects.length === 0 ? (
              <div className="text-center py-16">
                <svg className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
                <p className="text-gray-500 dark:text-gray-400 mb-2">
                  {activeTab === 'home' ? 'No active projects' : 'No projects in this category'}
                </p>
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  {activeTab === 'home' ? 'Projects with active/planned sprints or open tasks will appear here.' : 'Click "+ New Project" to create one.'}
                </p>
              </div>
            ) : activeTab === 'home' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {filteredProjects.map(project => renderHomeCard(project))}
              </div>
            ) : (
              <div className="space-y-6">
                {filteredProjects.map(project => renderProjectCard(project))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Sprint Create/Edit Modal ─────────────────────────────── */}
      {sprintModalProjectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={closeSprintModal}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{editingSprint ? 'Edit Sprint' : 'New Sprint'}</h3>
              <button onClick={closeSprintModal} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Sprint Title <span className="text-red-400">*</span></label>
                <input type="text" value={sprintForm.title} onChange={e => setSprintForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Sprint 1 — Auth & Login" autoFocus className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Description</label>
                <textarea value={sprintForm.description} onChange={e => setSprintForm(f => ({ ...f, description: e.target.value }))} placeholder="Sprint goal or focus area..." rows={2} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none" />
              </div>
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
            </div>
            <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-2 bg-gray-50 dark:bg-gray-900/50">
              <button onClick={closeSprintModal} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 rounded">Cancel</button>
              <button onClick={handleSaveSprint} disabled={!sprintForm.title.trim() || savingSprint} className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {savingSprint ? 'Saving...' : editingSprint ? 'Update Sprint' : 'Create Sprint'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Project Create/Edit Modal ────────────────────────────── */}
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
    </div>
  );
}
