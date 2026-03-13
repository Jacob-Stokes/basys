import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { api } from '../api/client';

type Status = 'connecting' | 'connected' | 'error' | 'disconnected';

function getWsUrl(): string {
  if (import.meta.env.VITE_TERMINAL_WS_URL) {
    return import.meta.env.VITE_TERMINAL_WS_URL;
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.hostname}:4001`;
}

export default function Terminal() {
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const resizeHandlerRef = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<Status>('connecting');

  const connect = () => {
    // Clean up previous connection
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      wsRef.current.close();
    }
    if (xtermRef.current) {
      xtermRef.current.dispose();
      xtermRef.current = null;
    }

    setStatus('connecting');
    init();
  };

  async function init() {
    let token: string;
    try {
      const data = await api.getTerminalToken();
      token = data.token;
    } catch {
      setStatus('error');
      return;
    }

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#c9d1d9',
        selectionBackground: '#264f78',
        black: '#0d1117',
        red: '#ff7b72',
        green: '#7ee787',
        yellow: '#d29922',
        blue: '#79c0ff',
        magenta: '#d2a8ff',
        cyan: '#a5d6ff',
        white: '#c9d1d9',
      },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);

    xtermRef.current = term;
    fitRef.current = fit;

    if (termRef.current) {
      term.open(termRef.current);
      // Small delay to ensure DOM is ready before fitting
      requestAnimationFrame(() => fit.fit());
    }

    const ws = new WebSocket(`${getWsUrl()}?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      const dims = fit.proposeDimensions();
      if (dims) {
        ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
      }
    };

    ws.onmessage = (event) => {
      term.write(event.data);
    };

    ws.onclose = () => {
      setStatus('disconnected');
    };

    ws.onerror = () => {
      setStatus('error');
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    const handleResize = () => {
      fit.fit();
      const dims = fit.proposeDimensions();
      if (dims && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
      }
    };

    window.addEventListener('resize', handleResize);
    resizeHandlerRef.current = handleResize;
  }

  useEffect(() => {
    init();

    return () => {
      if (resizeHandlerRef.current) {
        window.removeEventListener('resize', resizeHandlerRef.current);
      }
      xtermRef.current?.dispose();
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        wsRef.current.close();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const statusColor = {
    connecting: 'text-yellow-600 dark:text-yellow-400',
    connected: 'text-green-600 dark:text-green-400',
    error: 'text-red-600 dark:text-red-400',
    disconnected: 'text-gray-500 dark:text-gray-400',
  }[status];

  const statusDot = {
    connecting: 'bg-yellow-500',
    connected: 'bg-green-500',
    error: 'bg-red-500',
    disconnected: 'bg-gray-400',
  }[status];

  const statusText = {
    connecting: 'Connecting...',
    connected: 'Connected',
    error: 'Connection failed',
    disconnected: 'Disconnected',
  }[status];

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <div className="container mx-auto px-4 sm:px-16 py-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Terminal
          </h1>
          <div className="flex items-center gap-3">
            {(status === 'disconnected' || status === 'error') && (
              <button
                onClick={connect}
                className="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                Reconnect
              </button>
            )}
            <span className={`flex items-center gap-1.5 text-xs ${statusColor}`}>
              <span className={`w-2 h-2 rounded-full ${statusDot}`} />
              {statusText}
            </span>
          </div>
        </div>

        <div
          ref={termRef}
          className="rounded-lg overflow-hidden"
          style={{
            height: 'calc(100vh - 160px)',
            backgroundColor: '#0d1117',
            padding: '8px',
          }}
        />
      </div>
    </div>
  );
}
