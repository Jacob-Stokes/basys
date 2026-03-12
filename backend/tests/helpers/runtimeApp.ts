import { type Router } from 'express';
import { db, initDatabase } from '../../src/db/database';
import { createTestUser } from './fixtures';

type MountedRouter = {
  basePath: string;
  router: Router;
};

type RuntimeUser = {
  id: string;
  username: string;
};

export type RuntimeAuthedApp = {
  user: RuntimeUser;
  routers: MountedRouter[];
};

type RouteRequestOptions = {
  method: string;
  path: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
};

type RouteLayer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (req: any, res: any, next: (error?: unknown) => void) => unknown }>;
  };
};

type MockResponse = {
  statusCode: number;
  body: unknown;
  status(code: number): MockResponse;
  json(payload: unknown): MockResponse;
};

export function resetRuntimeDb() {
  initDatabase();
  db.pragma('foreign_keys = OFF');

  const tables = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  `).all() as Array<{ name: string }>;

  for (const { name } of tables) {
    const escaped = name.replace(/"/g, '""');
    db.exec(`DELETE FROM "${escaped}"`);
  }

  db.pragma('foreign_keys = ON');
}

export function insertRuntimeUser(overrides: Record<string, unknown> = {}) {
  const user = createTestUser(overrides);
  db.prepare(`
    INSERT INTO users (id, username, password_hash, email, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    user.id,
    user.username,
    user.password_hash,
    user.email,
    user.created_at,
    user.updated_at
  );
  return user;
}

export function createAuthedApp(
  user: RuntimeUser,
  routers: MountedRouter[]
) {
  return { user, routers };
}

function normalizePath(path: string) {
  if (!path || path === '/') return '/';
  return path.startsWith('/') ? path : `/${path}`;
}

function splitPath(path: string) {
  const normalized = normalizePath(path);
  if (normalized === '/') return [];
  return normalized.slice(1).split('/').map(decodeURIComponent);
}

function matchRoutePath(routePath: string, requestPath: string) {
  const routeSegments = splitPath(routePath);
  const requestSegments = splitPath(requestPath);
  if (routeSegments.length !== requestSegments.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < routeSegments.length; i += 1) {
    const routeSegment = routeSegments[i];
    const requestSegment = requestSegments[i];

    if (routeSegment.startsWith(':')) {
      params[routeSegment.slice(1)] = requestSegment;
      continue;
    }

    if (routeSegment !== requestSegment) {
      return null;
    }
  }

  return params;
}

function createMockResponse(): MockResponse {
  return {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

async function executeRouteHandlers(
  handlers: RouteLayer['route']['stack'],
  req: Record<string, unknown>,
  res: MockResponse
) {
  await new Promise<void>((resolve, reject) => {
    const run = (index: number) => {
      const handler = handlers[index];
      if (!handler) {
        resolve();
        return;
      }

      let nextCalled = false;
      const next = (error?: unknown) => {
        nextCalled = true;
        if (error) {
          reject(error);
          return;
        }
        run(index + 1);
      };

      try {
        const result = handler.handle(req, res, next);
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          (result as Promise<unknown>).then(() => {
            if (!nextCalled) resolve();
          }).catch(reject);
          return;
        }

        if (!nextCalled) {
          resolve();
        }
      } catch (error) {
        reject(error);
      }
    };

    run(0);
  });
}

async function invokeRouter(
  router: Router,
  user: RuntimeUser,
  options: RouteRequestOptions
) {
  const method = options.method.toLowerCase();
  const path = normalizePath(options.path);
  const layers = ((router as any).stack ?? []) as RouteLayer[];

  for (const layer of layers) {
    const route = layer.route;
    if (!route || !route.methods[method]) {
      continue;
    }

    const params = matchRoutePath(route.path, path);
    if (!params) {
      continue;
    }

    const req = {
      method: options.method.toUpperCase(),
      path,
      params,
      query: options.query ?? {},
      body: options.body ?? {},
      user: {
        id: user.id,
        username: user.username,
        display_name: null,
        is_admin: false,
      },
    };
    const res = createMockResponse();

    await executeRouteHandlers(route.stack, req, res);
    return {
      status: res.statusCode,
      body: res.body,
    };
  }

  throw new Error(`No ${options.method.toUpperCase()} route matched ${path}`);
}

export async function requestAuthedApp(
  app: RuntimeAuthedApp,
  options: RouteRequestOptions
) {
  const url = new URL(options.path, 'http://localhost');
  const mergedQuery = Object.fromEntries(url.searchParams.entries()) as Record<string, string>;

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null) {
      mergedQuery[key] = String(value);
    }
  }

  for (const { basePath, router } of app.routers) {
    if (url.pathname === basePath || url.pathname.startsWith(`${basePath}/`)) {
      const relativePath = url.pathname.slice(basePath.length) || '/';
      return invokeRouter(router, app.user, {
        ...options,
        path: relativePath,
        query: mergedQuery,
      });
    }
  }

  throw new Error(`No mounted router matched ${url.pathname}`);
}
