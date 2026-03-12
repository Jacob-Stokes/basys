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
  updateProfile: (data: {
    display_name?: string | null;
    weather_latitude?: number | null;
    weather_longitude?: number | null;
    weather_location_name?: string | null;
    timezone?: string | null;
    use_browser_time?: boolean;
    temperature_unit?: string;
    todo_hidden_project_types?: string;
  }) => apiRequest<any>('/api/auth/me', { method: 'PATCH', body: JSON.stringify(data) }),
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

  // Terminal
  getTerminalToken: () => apiRequest<{ token: string }>('/api/auth/terminal-token'),

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
  getTasks: (params?: { project_id?: string; sprint_id?: string; done?: string; priority?: string; label?: string; due_before?: string; due_after?: string; search?: string; favorite?: string; exclude_types?: string; include_checklist?: string }) => {
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
  getProjects: (params?: { exclude_types?: string }) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => { if (v !== undefined) query.append(k, v); });
    }
    const qs = query.toString() ? `?${query.toString()}` : '';
    return apiRequest<any[]>(`/api/projects${qs}`);
  },
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

  // Sprints
  getSprints: (projectId: string) =>
    apiRequest<any[]>(`/api/projects/${projectId}/sprints`),
  createSprint: (projectId: string, data: any) =>
    apiRequest<any>(`/api/projects/${projectId}/sprints`, { method: 'POST', body: JSON.stringify(data) }),
  getSprint: (id: string) =>
    apiRequest<any>(`/api/sprints/${id}`),
  updateSprint: (id: string, data: any) =>
    apiRequest<any>(`/api/sprints/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSprint: (id: string) =>
    apiRequest<any>(`/api/sprints/${id}`, { method: 'DELETE' }),
  updateSprintStatus: (id: string, status: string) =>
    apiRequest<any>(`/api/sprints/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  getSprintColumns: (sprintId: string) =>
    apiRequest<any[]>(`/api/sprints/${sprintId}/columns`),
  createSprintColumn: (sprintId: string, data: any) =>
    apiRequest<any>(`/api/sprints/${sprintId}/columns`, { method: 'POST', body: JSON.stringify(data) }),
  updateSprintColumn: (sprintId: string, columnId: string, data: any) =>
    apiRequest<any>(`/api/sprints/${sprintId}/columns/${columnId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSprintColumn: (sprintId: string, columnId: string) =>
    apiRequest<any>(`/api/sprints/${sprintId}/columns/${columnId}`, { method: 'DELETE' }),

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

  // Task Relations
  getTaskRelations: (taskId: string) =>
    apiRequest<any[]>(`/api/tasks/${taskId}/relations`),
  addTaskRelation: (taskId: string, related_task_id: string, relation_kind: string) =>
    apiRequest<any[]>(`/api/tasks/${taskId}/relations`, { method: 'POST', body: JSON.stringify({ related_task_id, relation_kind }) }),
  deleteTaskRelation: (taskId: string, relationId: string) =>
    apiRequest<any>(`/api/tasks/${taskId}/relations/${relationId}`, { method: 'DELETE' }),

  // Task Checklist
  getTaskChecklist: (taskId: string) =>
    apiRequest<any[]>(`/api/tasks/${taskId}/checklist`),
  addChecklistItem: (taskId: string, title: string) =>
    apiRequest<any>(`/api/tasks/${taskId}/checklist`, { method: 'POST', body: JSON.stringify({ title }) }),
  updateChecklistItem: (taskId: string, itemId: string, data: { title?: string; done?: number; position?: number }) =>
    apiRequest<any>(`/api/tasks/${taskId}/checklist/${itemId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteChecklistItem: (taskId: string, itemId: string) =>
    apiRequest<any>(`/api/tasks/${taskId}/checklist/${itemId}`, { method: 'DELETE' }),

  // Pomodoros
  getPomodoros: (params?: { status?: string; limit?: string }) => {
    const query = new URLSearchParams();
    if (params?.status) query.append('status', params.status);
    if (params?.limit) query.append('limit', params.limit);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return apiRequest<any[]>(`/api/pomodoros${qs}`);
  },
  createPomodoro: (data: { duration_minutes?: number; note?: string; task_id?: string; links?: { target_type: string; target_id: string }[] }) =>
    apiRequest<any>('/api/pomodoros', { method: 'POST', body: JSON.stringify(data) }),
  getPomodoro: (id: string) => apiRequest<any>(`/api/pomodoros/${id}`),
  updatePomodoro: (id: string, data: any) =>
    apiRequest<any>(`/api/pomodoros/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  completePomodoro: (id: string) =>
    apiRequest<any>(`/api/pomodoros/${id}/complete`, { method: 'PATCH' }),
  deletePomodoro: (id: string) =>
    apiRequest<any>(`/api/pomodoros/${id}`, { method: 'DELETE' }),
  getPomoStats: (targetType: string, targetId: string) =>
    apiRequest<{ pomo_count: number; total_minutes: number }>(`/api/pomodoros/stats?target_type=${targetType}&target_id=${targetId}`),

  // Universal search
  universalSearch: (q: string) =>
    apiRequest<any>(`/api/search?q=${encodeURIComponent(q)}`),
  searchChildren: (type: string, id: string) =>
    apiRequest<any[]>(`/api/search/children?type=${type}&id=${id}`),

  // Sub-goal search (for typeahead)
  searchSubGoals: (q: string) =>
    apiRequest<any[]>(`/api/subgoals/search?q=${encodeURIComponent(q)}`),

  // Chat
  listConversations: () => apiRequest<any[]>('/api/chat/conversations'),
  createConversation: () => apiRequest<any>('/api/chat/conversations', { method: 'POST' }),
  getConversation: (id: string) => apiRequest<any>(`/api/chat/conversations/${id}`),
  deleteConversation: (id: string) => apiRequest<any>(`/api/chat/conversations/${id}`, { method: 'DELETE' }),

  // Events
  getEvents: (params?: { start?: string; end?: string }) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => { if (v !== undefined) query.append(k, v); });
    }
    const qs = query.toString() ? `?${query.toString()}` : '';
    return apiRequest<any[]>(`/api/events${qs}`);
  },
  createEvent: (data: any) =>
    apiRequest<any>('/api/events', { method: 'POST', body: JSON.stringify(data) }),
  updateEvent: (id: string, data: any) =>
    apiRequest<any>(`/api/events/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEvent: (id: string) =>
    apiRequest<any>(`/api/events/${id}`, { method: 'DELETE' }),

  // Google Calendar
  getGoogleCalendarStatus: () =>
    apiRequest<any>('/api/google-calendar/status'),
  getGoogleCalendarAuthUrl: () =>
    apiRequest<{ url: string }>('/api/google-calendar/auth-url'),
  disconnectGoogleCalendar: () =>
    apiRequest<any>('/api/google-calendar/disconnect', { method: 'DELETE' }),
  getGoogleCalendars: () =>
    apiRequest<any[]>('/api/google-calendar/calendars'),
  updateGoogleCalendarSelection: (selectedCalendars: string[]) =>
    apiRequest<any>('/api/google-calendar/calendars', {
      method: 'PUT',
      body: JSON.stringify({ selected_calendars: selectedCalendars }),
    }),
  syncGoogleCalendar: () =>
    apiRequest<{ synced: number }>('/api/google-calendar/sync', { method: 'POST' }),
  getGoogleCalendarEvents: (params?: { start?: string; end?: string }) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => { if (v !== undefined) query.append(k, v); });
    }
    const qs = query.toString() ? `?${query.toString()}` : '';
    return apiRequest<any[]>(`/api/google-calendar/events${qs}`);
  },
  pushEventToGoogle: (data: any) =>
    apiRequest<any>('/api/google-calendar/push-event', { method: 'POST', body: JSON.stringify(data) }),
  updateGoogleCalendarEvent: (googleEventId: string, data: any) =>
    apiRequest<any>(`/api/google-calendar/events/${encodeURIComponent(googleEventId)}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteGoogleCalendarEvent: (googleEventId: string, calendarId: string) =>
    apiRequest<any>(`/api/google-calendar/events/${encodeURIComponent(googleEventId)}?calendar_id=${encodeURIComponent(calendarId)}`, { method: 'DELETE' }),

  // Gmail
  getGmailStatus: () =>
    apiRequest<any>('/api/gmail/status'),
  getGmailMessages: (params?: { limit?: number; offset?: number }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.offset) query.append('offset', String(params.offset));
    const qs = query.toString() ? `?${query.toString()}` : '';
    return apiRequest<{ messages: any[]; unread_count: number }>(`/api/gmail/messages${qs}`);
  },
  getGmailMessage: (gmailMessageId: string) =>
    apiRequest<any>(`/api/gmail/messages/${encodeURIComponent(gmailMessageId)}`),
  markGmailRead: (gmailMessageId: string) =>
    apiRequest<any>(`/api/gmail/messages/${encodeURIComponent(gmailMessageId)}/read`, { method: 'POST' }),
  markGmailUnread: (gmailMessageId: string) =>
    apiRequest<any>(`/api/gmail/messages/${encodeURIComponent(gmailMessageId)}/unread`, { method: 'POST' }),
  syncGmail: () =>
    apiRequest<{ synced: number }>('/api/gmail/sync', { method: 'POST' }),

  // Quick notes
  getNotes: () => apiRequest<any[]>('/api/notes'),
  createNote: (content: string) =>
    apiRequest<any>('/api/notes', { method: 'POST', body: JSON.stringify({ content }) }),
  updateNote: (id: string, content: string) =>
    apiRequest<any>(`/api/notes/${id}`, { method: 'PUT', body: JSON.stringify({ content }) }),
  deleteNote: (id: string) =>
    apiRequest<any>(`/api/notes/${id}`, { method: 'DELETE' }),

  // Contacts (Personal CRM)
  getContacts: (params?: { q?: string; tag?: string; type?: string; archived?: string }) => {
    const query = new URLSearchParams();
    if (params) Object.entries(params).forEach(([k, v]) => { if (v !== undefined) query.append(k, v); });
    const qs = query.toString() ? `?${query.toString()}` : '';
    return apiRequest<any[]>(`/api/contacts${qs}`);
  },
  getContact: (id: string) => apiRequest<any>(`/api/contacts/${id}`),
  createContact: (data: any) =>
    apiRequest<any>('/api/contacts', { method: 'POST', body: JSON.stringify(data) }),
  updateContact: (id: string, data: any) =>
    apiRequest<any>(`/api/contacts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteContact: (id: string) =>
    apiRequest<any>(`/api/contacts/${id}`, { method: 'DELETE' }),
  toggleContactFavorite: (id: string) =>
    apiRequest<any>(`/api/contacts/${id}/favorite`, { method: 'PUT' }),
  updateContactTags: (id: string, tags: string[]) =>
    apiRequest<any>(`/api/contacts/${id}/tags`, { method: 'PUT', body: JSON.stringify({ tags }) }),
  updateContactFields: (id: string, fields: any[]) =>
    apiRequest<any>(`/api/contacts/${id}/fields`, { method: 'PUT', body: JSON.stringify({ fields }) }),
  getContactInteractions: (contactId: string) =>
    apiRequest<any[]>(`/api/contacts/${contactId}/interactions`),
  createInteraction: (contactId: string, data: any) =>
    apiRequest<any>(`/api/contacts/${contactId}/interactions`, { method: 'POST', body: JSON.stringify(data) }),
  updateInteraction: (id: string, data: any) =>
    apiRequest<any>(`/api/contacts/interactions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteInteraction: (id: string) =>
    apiRequest<any>(`/api/contacts/interactions/${id}`, { method: 'DELETE' }),
  getDueReminders: () => apiRequest<any[]>('/api/contacts/reminders/due'),

  getSharedGoal: async (token: string) => {
    const response = await fetch(`${API_URL}/api/shared/${token}/goal`);
    const parsed = await response.json();
    if (!parsed.success) throw new Error(parsed.error || 'Failed to load shared goal');
    return parsed.data;
  },
};
