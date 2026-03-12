import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SharedGoalView from '../../src/pages/SharedGoalView';
import { api } from '../../src/api/client';

vi.mock('../../src/api/client', () => ({
  api: {
    getSharedGoal: vi.fn(),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../../src/components/FullGridView', () => ({
  default: ({ goalTitle }: { goalTitle: string }) => <div>full-grid:{goalTitle}</div>,
}));

vi.mock('../../src/components/Guestbook', () => ({
  default: ({ preloadedEntries }: { preloadedEntries: unknown[] }) => <div>guestbook:{preloadedEntries.length}</div>,
}));

describe('SharedGoalView', () => {
  beforeEach(() => {
    vi.mocked(api.getSharedGoal).mockReset();
  });

  it('loads and renders a shared goal with guestbook entries', async () => {
    vi.mocked(api.getSharedGoal).mockResolvedValue({
      goal: {
        id: 'goal-1',
        title: 'Shared Goal',
        description: 'Public description',
        status: 'active',
        theme_json: null,
        subGoals: [],
      },
      guestbook: [
        {
          id: 'guest-1',
          agent_name: 'Codex',
          comment: 'Keep going',
          target_type: 'goal',
          target_id: 'goal-1',
          created_at: '2026-03-12T10:00:00Z',
        },
      ],
      shareSettings: {
        show_logs: false,
        show_guestbook: true,
      },
    } as any);

    render(
      <MemoryRouter initialEntries={['/share/token-123']}>
        <Routes>
          <Route path="/share/:token" element={<SharedGoalView />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('sharedGoal.loadingSharedGoal')).toBeInTheDocument();
    expect(await screen.findByText('Shared Goal')).toBeInTheDocument();
    expect(screen.getByText('full-grid:Shared Goal')).toBeInTheDocument();
    expect(screen.getByText('guestbook:1')).toBeInTheDocument();
  });

  it('omits the guestbook section when sharing disables it', async () => {
    vi.mocked(api.getSharedGoal).mockResolvedValue({
      goal: {
        id: 'goal-2',
        title: 'No Guestbook Goal',
        description: null,
        status: 'active',
        theme_json: null,
        subGoals: [],
      },
      guestbook: [
        {
          id: 'guest-2',
          agent_name: 'Codex',
          comment: 'Hidden',
          target_type: 'goal',
          target_id: 'goal-2',
          created_at: '2026-03-12T10:00:00Z',
        },
      ],
      shareSettings: {
        show_logs: false,
        show_guestbook: false,
      },
    } as any);

    render(
      <MemoryRouter initialEntries={['/share/token-456']}>
        <Routes>
          <Route path="/share/:token" element={<SharedGoalView />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('No Guestbook Goal')).toBeInTheDocument();
    expect(screen.queryByText('guestbook:1')).not.toBeInTheDocument();
  });

  it('shows the error state when the shared goal cannot be loaded', async () => {
    vi.mocked(api.getSharedGoal).mockRejectedValue(new Error('Link expired'));

    render(
      <MemoryRouter initialEntries={['/share/bad-token']}>
        <Routes>
          <Route path="/share/:token" element={<SharedGoalView />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('sharedGoal.unableToLoad')).toBeInTheDocument();
    expect(screen.getByText('Link expired')).toBeInTheDocument();
  });
});
