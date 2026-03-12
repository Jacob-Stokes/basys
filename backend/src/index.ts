import express from 'express';
import cors from 'cors';
import session from 'express-session';
import path from 'path';
import { initDatabase } from './db/database';
import goalsRouter from './routes/goals';
import subgoalsRouter from './routes/subgoals';
import actionsRouter from './routes/actions';
import userRouter from './routes/user';
import logsRouter from './routes/logs';
import authRouter from './routes/auth';
import guestbookRouter from './routes/guestbook';
import { requireAuth, optionalAuth, requireAdmin } from './middleware/auth';
import agentsRouter from './routes/agents';
import { shareManagementRouter, sharePublicRouter } from './routes/share';
import etiquetteRouter from './routes/etiquette';
import habitsRouter from './routes/habits';
import tasksRouter from './routes/tasks';
import projectsRouter from './routes/projects';
import labelsRouter from './routes/labels';
import pomodorosRouter from './routes/pomodoros';
import searchRouter from './routes/search';
import adminRouter from './routes/admin';
import chatRouter from './routes/chat';
import eventsRouter from './routes/events';
import googleCalendarRouter, { googleCalendarCallbackRouter } from './routes/googleCalendar';
import gmailRouter from './routes/gmail';
import sprintsRouter from './routes/sprints';
import notesRouter from './routes/notes';
import contactsRouter from './routes/contacts';
import { setupMcpRoutes } from './mcp/server';

const app = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', 1);

// Middleware — CORS only needed when frontend runs on a different origin (dev mode)
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session middleware
if (!process.env.SESSION_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.warn('WARNING: SESSION_SECRET is not set. This is unsafe in production. Set the SESSION_SECRET environment variable.');
  } else {
    console.warn('WARNING: SESSION_SECRET is not set. Using insecure default for development.');
  }
}

app.use(session({
  secret: process.env.SESSION_SECRET || 'harada-method-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.COOKIE_SECURE === 'true',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
  }
}));

// Initialize database
initDatabase();

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Basys API is running' });
});

// Auth routes (no auth required)
app.use('/api/auth', authRouter);

// Root API documentation endpoint for AI agents (optional auth to show user-specific info)
app.get('/api', optionalAuth, (req, res) => {
  const username = req.user?.username || 'the authenticated user';
  res.json({
    name: 'Basys API',
    description: `API for ${username}'s Harada Method goal tracking system. The Harada Method is a Japanese goal-setting framework using nested 64-square grids.`,
    owner: username,
    structure: {
      overview: 'Each user can have multiple primary goals. Each primary goal has 8 sub-goals. Each sub-goal has 8 action items. Progress is tracked via activity logs against action items.',
      data_model: {
        primary_goal: 'Main objective (e.g., "Become World-Class Developer")',
        sub_goals: '8 supporting goals that contribute to the primary goal',
        action_items: '8 specific actions for each sub-goal (64 total actions per primary goal)',
        activity_logs: 'Continuous logging of activity, progress, notes against each action item'
      }
    },
    endpoints: {
      user_summary: {
        method: 'GET',
        path: '/api/user/summary',
        description: 'Get complete overview of all goals, sub-goals, actions, and recent activity',
        use_case: 'Best starting point for AI to understand current goals and progress'
      },
      goals: {
        list: 'GET /api/goals - List all primary goals',
        get: 'GET /api/goals/:id - Get specific goal with all sub-goals and actions',
        create: 'POST /api/goals - Create new primary goal (body: {title, description?, target_date?})',
        update: 'PUT /api/goals/:id - Update goal',
        delete: 'DELETE /api/goals/:id - Delete goal'
      },
      subgoals: {
        list: 'GET /api/subgoals/goal/:goalId - List sub-goals for a goal',
        create: 'POST /api/subgoals/goal/:goalId - Create sub-goal (body: {position: 1-8, title})',
        update: 'PUT /api/subgoals/:id - Update sub-goal',
        delete: 'DELETE /api/subgoals/:id - Delete sub-goal'
      },
      actions: {
        list: 'GET /api/actions/subgoal/:subgoalId - List actions for a sub-goal',
        create: 'POST /api/actions/subgoal/:subgoalId - Create action (body: {position: 1-8, title})',
        update: 'PUT /api/actions/:id - Update action',
        delete: 'DELETE /api/actions/:id - Delete action'
      },
      logs: {
        list: 'GET /api/logs/action/:actionId - Get activity logs for an action',
        stats: 'GET /api/logs/action/:actionId/stats - Get statistics for an action',
        create: 'POST /api/logs/action/:actionId - Log activity (body: {log_type, content, log_date, metric_value?, metric_unit?, mood?})',
        update: 'PUT /api/logs/:id - Update log entry',
        delete: 'DELETE /api/logs/:id - Delete log entry',
        log_types: ['note', 'progress', 'completion', 'media', 'link'],
        moods: ['motivated', 'challenged', 'accomplished', 'frustrated', 'neutral']
      }
    },
    recommended_flow: [
      '1. Start with GET /api/user/summary to see all goals and recent activity',
      '2. Use GET /api/goals/:id to dive into a specific goal structure',
      '3. Use GET /api/logs/action/:actionId to see detailed activity for specific actions',
      '4. Create logs via POST /api/logs/action/:actionId to track new activity'
    ],
    notes: [
      'All responses follow format: {success: boolean, data?: any, error?: string}',
      'No authentication required currently',
      'Activity logs are the primary way to track progress - there are no completion checkboxes',
      'The Harada Method emphasizes continuous improvement through regular logging'
    ]
  });
});

// Protected routes - require authentication
app.use('/api/goals', requireAuth, goalsRouter);
app.use('/api/subgoals', requireAuth, subgoalsRouter);
app.use('/api/actions', requireAuth, actionsRouter);
app.use('/api/user', requireAuth, userRouter);
app.use('/api/logs', requireAuth, logsRouter);
app.use('/api/guestbook', requireAuth, guestbookRouter);
app.use('/api/agents', optionalAuth, agentsRouter);
app.use('/api/share', requireAuth, shareManagementRouter);
app.use('/api/shared', sharePublicRouter);
app.use('/api/etiquette', requireAuth, etiquetteRouter);
app.use('/api/habits', requireAuth, habitsRouter);
app.use('/api/tasks', requireAuth, tasksRouter);
app.use('/api/projects', requireAuth, projectsRouter);
app.use('/api/labels', requireAuth, labelsRouter);
app.use('/api/pomodoros', requireAuth, pomodorosRouter);
app.use('/api/search', requireAuth, searchRouter);
app.use('/api/contacts', requireAuth, contactsRouter);
app.use('/api/admin', requireAuth, requireAdmin, adminRouter);
app.use('/api/chat', requireAuth, chatRouter);
app.use('/api/events', requireAuth, eventsRouter);
app.use('/api/google-calendar/callback', googleCalendarCallbackRouter);
app.use('/api/google-calendar', requireAuth, googleCalendarRouter);
app.use('/api/gmail', requireAuth, gmailRouter);
app.use('/api', requireAuth, sprintsRouter);
app.use('/api', requireAuth, notesRouter);

// Remote MCP endpoint with OAuth (must be before static files/SPA fallback)
setupMcpRoutes(app);

// Serve frontend static files in production (single-container mode)
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// SPA fallback — any non-API route serves index.html for client-side routing
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
