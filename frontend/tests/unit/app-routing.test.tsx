import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../../src/App';
import { api } from '../../src/api/client';

vi.mock('../../src/api/client', () => ({
  api: {
    getMe: vi.fn(),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../../src/pages/Timer', () => ({ default: () => <div>timer-page</div> }));
vi.mock('../../src/pages/Home', () => ({ default: () => <div>goals-page</div> }));
vi.mock('../../src/pages/Habits', () => ({ default: () => <div>habits-page</div> }));
vi.mock('../../src/pages/Tasks', () => ({ default: () => <div>tasks-page</div> }));
vi.mock('../../src/pages/Phonebook', () => ({ default: () => <div>phonebook-page</div> }));
vi.mock('../../src/pages/Journal', () => ({ default: () => <div>journal-page</div> }));
vi.mock('../../src/pages/Terminal', () => ({ default: () => <div>terminal-page</div> }));
vi.mock('../../src/pages/GoalGrid', () => ({ default: () => <div>goal-grid-page</div> }));
vi.mock('../../src/pages/Login', () => ({ default: () => <div>login-page</div> }));
vi.mock('../../src/pages/Settings', () => ({ default: () => <div>settings-page</div> }));
vi.mock('../../src/pages/Agents', () => ({ default: () => <div>agents-page</div> }));
vi.mock('../../src/pages/SharedGoalView', () => ({ default: () => <div>shared-goal-page</div> }));
vi.mock('../../src/pages/SprintBoard', () => ({ default: () => <div>sprint-board-page</div> }));
vi.mock('../../src/pages/Sprints', () => ({ default: () => <div>sprints-page</div> }));

vi.mock('../../src/components/NavBar', () => ({ default: () => <div>nav-bar</div> }));
vi.mock('../../src/components/TimerFooter', () => ({ default: () => <div>timer-footer</div> }));
vi.mock('../../src/components/chat/ChatSidebar', () => ({ default: () => <div>chat-sidebar</div> }));
vi.mock('../../src/components/chat/PixelMan', () => ({ default: () => <div>pixel-man</div> }));
vi.mock('../../src/components/LeftPanel', () => ({ default: () => <div>left-panel</div> }));
vi.mock('../../src/components/KeyboardShortcutsModal', () => ({ default: () => <div>shortcuts-modal</div> }));

vi.mock('../../src/context/ChatSidebarContext', () => ({
  ChatSidebarProvider: ({ children }: { children: any }) => <>{children}</>,
  useChatSidebarSafe: () => ({ isOpen: false, agentState: 'idle' }),
}));

vi.mock('../../src/context/LeftPanelContext', () => ({
  LeftPanelProvider: ({ children }: { children: any }) => <>{children}</>,
  useLeftPanelSafe: () => ({ isOpen: false }),
}));

vi.mock('../../src/hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: () => {},
}));

describe('App routing', () => {
  beforeEach(() => {
    vi.mocked(api.getMe).mockReset();
  });

  it('redirects unauthenticated users from protected routes to login', async () => {
    window.history.pushState({}, '', '/');
    vi.mocked(api.getMe).mockRejectedValue(new Error('unauthenticated'));

    render(<App />);

    expect(await screen.findByText('login-page')).toBeInTheDocument();
  });

  it('renders protected routes when auth succeeds', async () => {
    window.history.pushState({}, '', '/');
    vi.mocked(api.getMe).mockResolvedValue({ id: 'user-1', username: 'testuser' } as any);

    render(<App />);

    expect(await screen.findByText('tasks-page')).toBeInTheDocument();
    expect(api.getMe).toHaveBeenCalledTimes(1);
  });

  it('renders the public shared goal route without triggering auth', async () => {
    window.history.pushState({}, '', '/share/public-token');

    render(<App />);

    expect(await screen.findByText('shared-goal-page')).toBeInTheDocument();
    expect(api.getMe).not.toHaveBeenCalled();
  });
});
