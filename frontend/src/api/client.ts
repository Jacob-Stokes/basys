export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

async function apiRequest<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const rawText = await response.text();
  let parsed: ApiResponse<T>;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    throw new Error(rawText || 'API response could not be parsed');
  }

  if (!parsed.success) {
    throw new Error(parsed.error || 'API request failed');
  }

  return parsed.data as T;
}

export const api = {
  // Auth
  getMe: () => apiRequest<any>('/api/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiRequest<any>('/api/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  // Goals
  getGoals: (q?: string) => {
    const query = q ? `?q=${encodeURIComponent(q)}` : '';
    return apiRequest<any[]>(`/api/goals${query}`);
  },
  getGoal: (id: string) => apiRequest<any>(`/api/goals/${id}`),
  getGoalTree: (id: string) => apiRequest<any>(`/api/goals/${id}/tree`),
  createGoal: (data: any) => apiRequest<any>('/api/goals', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  updateGoal: (id: string, data: any) => apiRequest<any>(`/api/goals/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  deleteGoal: (id: string) => apiRequest<any>(`/api/goals/${id}`, {
    method: 'DELETE',
  }),

  // Sub-goals
  getSubGoals: (goalId: string) => apiRequest<any[]>(`/api/goals/${goalId}/subgoals`),
  createSubGoal: (goalId: string, data: any) => apiRequest<any>(`/api/goals/${goalId}/subgoals`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  updateSubGoal: (id: string, data: any) => apiRequest<any>(`/api/subgoals/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  reorderSubGoal: (id: string, targetPosition: number) => apiRequest<any>(`/api/subgoals/${id}/reorder`, {
    method: 'POST',
    body: JSON.stringify({ targetPosition }),
  }),
  deleteSubGoal: (id: string) => apiRequest<any>(`/api/subgoals/${id}`, {
    method: 'DELETE',
  }),

  // Actions
  getActions: (subGoalId: string) => apiRequest<any[]>(`/api/subgoals/${subGoalId}/actions`),
  createAction: (subGoalId: string, data: any) => apiRequest<any>(`/api/subgoals/${subGoalId}/actions`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  updateAction: (id: string, data: any) => apiRequest<any>(`/api/actions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  reorderAction: (id: string, targetPosition: number) => apiRequest<any>(`/api/actions/${id}/reorder`, {
    method: 'POST',
    body: JSON.stringify({ targetPosition }),
  }),
  toggleAction: (id: string) => apiRequest<any>(`/api/actions/${id}/complete`, {
    method: 'PATCH',
  }),
  deleteAction: (id: string) => apiRequest<any>(`/api/actions/${id}`, {
    method: 'DELETE',
  }),

  // User
  getUserSummary: () => apiRequest<any>('/api/user/summary'),

  // API Keys
  getApiKeys: () => apiRequest<any[]>('/api/auth/api-keys'),

  // Activity Logs
  getActionLogs: (actionId: string, params?: { startDate?: string; endDate?: string; type?: string }) => {
    const query = new URLSearchParams();
    if (params?.startDate) query.append('startDate', params.startDate);
    if (params?.endDate) query.append('endDate', params.endDate);
    if (params?.type) query.append('type', params.type);
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return apiRequest<any[]>(`/api/logs/action/${actionId}${queryString}`);
  },
  getLog: (logId: string) => apiRequest<any>(`/api/logs/${logId}`),
  createLog: (actionId: string, data: any) => apiRequest<any>(`/api/logs/action/${actionId}`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  updateLog: (logId: string, data: any) => apiRequest<any>(`/api/logs/${logId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  deleteLog: (logId: string) => apiRequest<any>(`/api/logs/${logId}`, {
    method: 'DELETE',
  }),
  getActionStats: (actionId: string) => apiRequest<any>(`/api/logs/action/${actionId}/stats`),

  // Share links
  createShareLink: (data: { goal_id: string; show_logs: boolean; show_guestbook: boolean }) =>
    apiRequest<any>('/api/share', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getShareLinks: (goalId?: string) => {
    const query = goalId ? `?goal_id=${goalId}` : '';
    return apiRequest<any[]>(`/api/share${query}`);
  },
  deleteShareLink: (shareId: string) =>
    apiRequest<any>(`/api/share/${shareId}`, { method: 'DELETE' }),
  // Etiquette
  getEtiquette: () => apiRequest<any[]>('/api/etiquette'),
  createEtiquette: (content: string) => apiRequest<any>('/api/etiquette', {
    method: 'POST',
    body: JSON.stringify({ content }),
  }),
  updateEtiquette: (id: string, content: string) => apiRequest<any>(`/api/etiquette/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  }),
  deleteEtiquette: (id: string) => apiRequest<any>(`/api/etiquette/${id}`, {
    method: 'DELETE',
  }),
  resetEtiquette: () => apiRequest<any[]>('/api/etiquette/reset', {
    method: 'POST',
  }),

  // Habits
  getHabits: (params?: { type?: string; archived?: string }) => {
    const query = new URLSearchParams();
    if (params?.type) query.append('type', params.type);
    if (params?.archived) query.append('archived', params.archived);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return apiRequest<any[]>(`/api/habits${qs}`);
  },
  createHabit: (data: { title: string; emoji?: string; type: string; frequency?: string; quit_date?: string; subgoal_id?: string | null }) =>
    apiRequest<any>('/api/habits', { method: 'POST', body: JSON.stringify(data) }),
  updateHabit: (id: string, data: any) =>
    apiRequest<any>(`/api/habits/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteHabit: (id: string) =>
    apiRequest<any>(`/api/habits/${id}`, { method: 'DELETE' }),
  createHabitLog: (habitId: string, data: { log_date: string; note?: string }) =>
    apiRequest<any>(`/api/habits/${habitId}/logs`, { method: 'POST', body: JSON.stringify(data) }),
  deleteHabitLog: (habitId: string, logId: string) =>
    apiRequest<any>(`/api/habits/${habitId}/logs/${logId}`, { method: 'DELETE' }),
  getHabitsBySubGoal: (subgoalId: string) =>
    apiRequest<any[]>(`/api/habits/by-subgoal/${subgoalId}`),
  getHabitCalendar: (habitId: string, year: number, month: number) =>
    apiRequest<{ loggedDates: string[]; stats: any }>(`/api/habits/${habitId}/calendar?year=${year}&month=${month}`),

  // Tasks
  getTasks: (params?: { project_id?: string; done?: string; priority?: string; label?: string; due_before?: string; due_after?: string; search?: string; favorite?: string }) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => { if (v !== undefined) query.append(k, v); });
    }
    const qs = query.toString() ? `?${query.toString()}` : '';
    return apiRequest<any[]>(`/api/tasks${qs}`);
  },
  createTask: (data: any) =>
    apiRequest<any>('/api/tasks', { method: 'POST', body: JSON.stringify(data) }),
  getTask: (id: string) => apiRequest<any>(`/api/tasks/${id}`),
  updateTask: (id: string, data: any) =>
    apiRequest<any>(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTask: (id: string) =>
    apiRequest<any>(`/api/tasks/${id}`, { method: 'DELETE' }),
  toggleTask: (id: string) =>
    apiRequest<any>(`/api/tasks/${id}/done`, { method: 'PATCH' }),
  toggleTaskFavorite: (id: string) =>
    apiRequest<any>(`/api/tasks/${id}/favorite`, { method: 'PATCH' }),
  addTaskLabel: (taskId: string, labelId: string) =>
    apiRequest<any>(`/api/tasks/${taskId}/labels/${labelId}`, { method: 'POST' }),
  removeTaskLabel: (taskId: string, labelId: string) =>
    apiRequest<any>(`/api/tasks/${taskId}/labels/${labelId}`, { method: 'DELETE' }),
  getTaskComments: (taskId: string) =>
    apiRequest<any[]>(`/api/tasks/${taskId}/comments`),
  createTaskComment: (taskId: string, content: string) =>
    apiRequest<any>(`/api/tasks/${taskId}/comments`, { method: 'POST', body: JSON.stringify({ content }) }),
  deleteTaskComment: (taskId: string, commentId: string) =>
    apiRequest<any>(`/api/tasks/${taskId}/comments/${commentId}`, { method: 'DELETE' }),

  // Projects
  getProjects: () => apiRequest<any[]>('/api/projects'),
  createProject: (data: any) =>
    apiRequest<any>('/api/projects', { method: 'POST', body: JSON.stringify(data) }),
  getProject: (id: string) => apiRequest<any>(`/api/projects/${id}`),
  updateProject: (id: string, data: any) =>
    apiRequest<any>(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProject: (id: string) =>
    apiRequest<any>(`/api/projects/${id}`, { method: 'DELETE' }),
  toggleProjectFavorite: (id: string) =>
    apiRequest<any>(`/api/projects/${id}/favorite`, { method: 'PATCH' }),
  toggleProjectArchive: (id: string) =>
    apiRequest<any>(`/api/projects/${id}/archive`, { method: 'PATCH' }),

  // Labels
  getLabels: () => apiRequest<any[]>('/api/labels'),
  createLabel: (data: any) =>
    apiRequest<any>('/api/labels', { method: 'POST', body: JSON.stringify(data) }),
  updateLabel: (id: string, data: any) =>
    apiRequest<any>(`/api/labels/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteLabel: (id: string) =>
    apiRequest<any>(`/api/labels/${id}`, { method: 'DELETE' }),

  // Task Links
  getTaskLinks: (taskId: string) =>
    apiRequest<any[]>(`/api/tasks/${taskId}/links`),
  addTaskLink: (taskId: string, target_type: string, target_id: string) =>
    apiRequest<any[]>(`/api/tasks/${taskId}/links`, { method: 'POST', body: JSON.stringify({ target_type, target_id }) }),
  removeTaskLink: (taskId: string, targetType: string, targetId: string) =>
    apiRequest<any>(`/api/tasks/${taskId}/links/${targetType}/${targetId}`, { method: 'DELETE' }),

  // Pomodoros
  getPomodoros: (params?: { status?: string; limit?: string }) => {
    const query = new URLSearchParams();
    if (params?.status) query.append('status', params.status);
    if (params?.limit) query.append('limit', params.limit);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return apiRequest<any[]>(`/api/pomodoros${qs}`);
  },
  createPomodoro: (data: { duration_minutes?: number; note?: string; task_id?: string }) =>
    apiRequest<any>('/api/pomodoros', { method: 'POST', body: JSON.stringify(data) }),
  getPomodoro: (id: string) => apiRequest<any>(`/api/pomodoros/${id}`),
  updatePomodoro: (id: string, data: any) =>
    apiRequest<any>(`/api/pomodoros/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  completePomodoro: (id: string) =>
    apiRequest<any>(`/api/pomodoros/${id}/complete`, { method: 'PATCH' }),
  deletePomodoro: (id: string) =>
    apiRequest<any>(`/api/pomodoros/${id}`, { method: 'DELETE' }),

  // Sub-goal search (for typeahead)
  searchSubGoals: (q: string) =>
    apiRequest<any[]>(`/api/subgoals/search?q=${encodeURIComponent(q)}`),

  getSharedGoal: async (token: string) => {
    const response = await fetch(`${API_URL}/api/shared/${token}/goal`);
    const parsed = await response.json();
    if (!parsed.success) throw new Error(parsed.error || 'Failed to load shared goal');
    return parsed.data;
  },
};
