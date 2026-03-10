import * as pty from 'node-pty';

export function spawnTerminal(): pty.IPty {
  const shell = process.env.SHELL || '/bin/sh';
  return pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.env.TERMINAL_CWD || '/workspace',
    env: {
      ...process.env,
      TERM: 'xterm-256color',
    } as Record<string, string>,
  });
}

export function resizeTerminal(terminal: pty.IPty, cols: number, rows: number): void {
  try {
    terminal.resize(Math.max(1, cols), Math.max(1, rows));
  } catch {
    // ignore resize errors on dead pty
  }
}

export function killTerminal(terminal: pty.IPty): void {
  try {
    terminal.kill();
  } catch {
    // already dead
  }
}
