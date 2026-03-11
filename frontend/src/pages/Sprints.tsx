import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

interface Project {
  id: string;
  title: string;
  hex_color: string;
  type: string;
  open_tasks: number;
  done_tasks: number;
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

const statusColors: Record<string, string> = {
  planned: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
  active: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300',
  completed: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300',
};

export default function Sprints() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [sprintsByProject, setSprintsByProject] = useState<Record<string, Sprint[]>>({});
  const [loading, setLoading] = useState(true);
  const [newSprintProject, setNewSprintProject] = useState<string | null>(null);
  const [newSprintTitle, setNewSprintTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const allProjects = await api.getProjects();
      // Show all non-personal projects (dev, design, etc.)
      const sprintProjects = allProjects.filter((p: any) => p.type && p.type !== 'personal');
      setProjects(sprintProjects);

      // Load sprints for each project
      const sprintsMap: Record<string, Sprint[]> = {};
      await Promise.all(
        sprintProjects.map(async (p: any) => {
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
  };

  useEffect(() => { loadData(); }, []);

  const handleCreateSprint = async (projectId: string) => {
    if (!newSprintTitle.trim()) return;
    try {
      await api.createSprint(projectId, { title: newSprintTitle.trim() });
      setNewSprintTitle('');
      setNewSprintProject(null);
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleStatusChange = async (sprintId: string, status: string) => {
    try {
      await api.updateSprintStatus(sprintId, status);
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDeleteSprint = async (sprintId: string) => {
    try {
      await api.deleteSprint(sprintId);
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <p className="text-gray-400 text-center py-12">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 font-bold">×</button>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="text-center py-16">
          <svg className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
          <p className="text-gray-500 dark:text-gray-400 mb-2">No sprint projects yet</p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Create a project with a non-personal type (e.g. "dev") in the Projects tab to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {projects.map(project => {
            const sprints = sprintsByProject[project.id] || [];
            const activeSprints = sprints.filter(s => s.status === 'active');
            const plannedSprints = sprints.filter(s => s.status === 'planned');
            const completedSprints = sprints.filter(s => s.status === 'completed');
            const ordered = [...activeSprints, ...plannedSprints, ...completedSprints];

            return (
              <div key={project.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
                {/* Project header */}
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {project.hex_color && (
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: project.hex_color }} />
                    )}
                    <h2 className="font-semibold text-gray-900 dark:text-gray-100">{project.title}</h2>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 font-medium uppercase">
                      {project.type}
                    </span>
                  </div>
                  <button
                    onClick={() => { setNewSprintProject(newSprintProject === project.id ? null : project.id); setNewSprintTitle(''); }}
                    className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    + Sprint
                  </button>
                </div>

                {/* New sprint input */}
                {newSprintProject === project.id && (
                  <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newSprintTitle}
                        onChange={e => setNewSprintTitle(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleCreateSprint(project.id)}
                        placeholder="Sprint name..."
                        autoFocus
                        className="flex-1 text-sm border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400"
                      />
                      <button
                        onClick={() => handleCreateSprint(project.id)}
                        disabled={!newSprintTitle.trim()}
                        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        Create
                      </button>
                      <button
                        onClick={() => { setNewSprintProject(null); setNewSprintTitle(''); }}
                        className="px-2 py-1.5 text-sm text-gray-400 hover:text-gray-600"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Sprint list */}
                {ordered.length === 0 ? (
                  <div className="py-8 text-center text-gray-400 dark:text-gray-500 text-sm">
                    No sprints yet.
                  </div>
                ) : (
                  <div>
                    {ordered.map(sprint => (
                      <div
                        key={sprint.id}
                        onClick={() => navigate(`/sprints/${sprint.id}`)}
                        className={`px-4 py-3 border-b border-gray-100 dark:border-gray-700/50 last:border-b-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors flex items-center justify-between ${
                          sprint.status === 'active' ? 'bg-green-50/50 dark:bg-green-900/5' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                                {sprint.title}
                              </span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase flex-shrink-0 ${statusColors[sprint.status] || statusColors.planned}`}>
                                {sprint.status}
                              </span>
                            </div>
                            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                              Sprint {sprint.sprint_number}
                              {' · '}{sprint.open_tasks || 0} open{' · '}{sprint.done_tasks || 0} done
                              {sprint.start_date && ` · ${new Date(sprint.start_date).toLocaleDateString()}`}
                              {sprint.end_date && ` – ${new Date(sprint.end_date).toLocaleDateString()}`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                          {sprint.status === 'planned' && (
                            <button onClick={() => handleStatusChange(sprint.id, 'active')} className="text-xs text-green-600 hover:text-green-700 dark:text-green-400">
                              Start
                            </button>
                          )}
                          {sprint.status === 'active' && (
                            <button onClick={() => handleStatusChange(sprint.id, 'completed')} className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400">
                              Complete
                            </button>
                          )}
                          {sprint.status === 'completed' && (
                            <button onClick={() => handleStatusChange(sprint.id, 'active')} className="text-xs text-green-600 hover:text-green-700 dark:text-green-400">
                              Reopen
                            </button>
                          )}
                          <button onClick={() => handleDeleteSprint(sprint.id)} className="text-xs text-red-400 hover:text-red-600">
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
