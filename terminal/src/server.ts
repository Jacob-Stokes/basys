import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { spawnTerminal, resizeTerminal, killTerminal } from './pty-manager';
import type { IPty } from 'node-pty';

const PORT = parseInt(process.env.PORT || '4001', 10);
const SHARED_SECRET = process.env.TERMINAL_SHARED_SECRET || '';
const SCROLLBACK_LIMIT = 50_000; // chars to buffer for replay on reconnect

if (!SHARED_SECRET) {
  console.warn('WARNING: TERMINAL_SHARED_SECRET is not set. All connections will be rejected.');
}

// Persistent terminal session — survives WebSocket disconnects
let persistentPty: IPty | null = null;
let scrollbackBuffer = '';
let activeWs: WebSocket | null = null;

function ensurePty(): IPty {
  if (persistentPty) return persistentPty;

  console.log('Spawning new persistent terminal session');
  const pty = spawnTerminal();

  pty.onData((data: string) => {
    // Always buffer output
    scrollbackBuffer += data;
    if (scrollbackBuffer.length > SCROLLBACK_LIMIT) {
      scrollbackBuffer = scrollbackBuffer.slice(-SCROLLBACK_LIMIT);
    }

    // Forward to active WebSocket if connected
    if (activeWs && activeWs.readyState === WebSocket.OPEN) {
      activeWs.send(data);
    }
  });

  pty.onExit(({ exitCode }) => {
    console.log(`Persistent terminal exited with code ${exitCode}`);
    persistentPty = null;
    scrollbackBuffer = '';

    // Notify client so it can show disconnected state
    if (activeWs && activeWs.readyState === WebSocket.OPEN) {
      activeWs.send('\r\n\x1b[31m[Process exited]\x1b[0m\r\n');
      activeWs.close(1000, 'Process exited');
    }
    activeWs = null;
  });

  persistentPty = pty;
  return pty;
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'basys-terminal',
      session: persistentPty ? 'active' : 'none',
    }));
    return;
  }

  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

function validateToken(token: string): boolean {
  if (!SHARED_SECRET) return false;
  return token === SHARED_SECRET;
}

wss.on('connection', (ws: WebSocket, req) => {
  const url = new URL(req.url || '', `http://localhost:${PORT}`);
  const token = url.searchParams.get('token');

  if (!token || !validateToken(token)) {
    console.log('Rejected unauthorized WebSocket connection');
    ws.close(4001, 'Unauthorized');
    return;
  }

  // Disconnect previous WebSocket if any (only one client at a time)
  if (activeWs && activeWs.readyState === WebSocket.OPEN) {
    console.log('Replacing existing WebSocket connection');
    activeWs.close(4002, 'Replaced by new connection');
  }

  activeWs = ws;
  const terminal = ensurePty();

  console.log(`WebSocket connected (session ${persistentPty ? 'resumed' : 'new'}, buffer: ${scrollbackBuffer.length} chars)`);

  // Replay buffered output so the client sees previous terminal state
  if (scrollbackBuffer.length > 0) {
    ws.send(scrollbackBuffer);
  }

  ws.on('message', (msg: Buffer | string) => {
    const str = msg.toString();

    if (str.startsWith('{"type":')) {
      try {
        const parsed = JSON.parse(str);
        if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
          resizeTerminal(terminal, parsed.cols, parsed.rows);
          return;
        }
      } catch {
        // not valid JSON, treat as terminal input
      }
    }

    terminal.write(str);
  });

  ws.on('close', () => {
    console.log('WebSocket disconnected (terminal session preserved)');
    if (activeWs === ws) {
      activeWs = null;
    }
    // NOTE: we do NOT kill the pty — it persists for reconnection
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
    if (activeWs === ws) {
      activeWs = null;
    }
  });
});

server.listen(PORT, () => {
  console.log(`Terminal sidecar listening on port ${PORT}`);
});
