import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import FullGridView from '../components/FullGridView';
import Guestbook from '../components/Guestbook';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { GoalTheme, computeColorsFromTheme } from '../context/DisplaySettingsContext';
import { lightenColor, getReadableTextColor } from '../utils/color';

interface ActivityLog {
  id: string;
  log_type: string;
  content: string;
  log_date: string;
  metric_value?: number;
  metric_unit?: string;
  mood?: string;
  created_at: string;
}

interface ActionItem {
  id: string;
  position: number;
  title: string;
  description?: string | null;
  logs?: ActivityLog[];
}

interface SubGoal {
  id: string;
  position: number;
  title: string;
  description?: string | null;
  actions: ActionItem[];
}

interface Goal {
  id: string;
  title: string;
  description: string | null;
  status: string;
  theme_json?: string | null;
  subGoals: SubGoal[];
}

interface GuestbookEntry {
  id: string;
  agent_name: string;
  comment: string;
  target_type: 'user' | 'goal' | 'subgoal' | 'action';
  target_id: string | null;
  created_at: string;
}

interface ShareSettings {
  show_logs: boolean;
  show_guestbook: boolean;
}

// Default classic palette for shared views
const DEFAULT_COLORS: Record<number, string> = {
  1: '#22c55e', 2: '#86efac', 3: '#15803d', 4: '#bbf7d0',
  5: '#4ade80', 6: '#166534', 7: '#86efac', 8: '#22c55e',
};

export default function SharedGoalView() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [guestbook, setGuestbook] = useState<GuestbookEntry[]>([]);
  const [shareSettings, setShareSettings] = useState<ShareSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'compact' | 'full'>('full');
  const [gridAspect, setGridAspect] = useState<'square' | 'rectangle'>('square');
  const [selectedAction, setSelectedAction] = useState<ActionItem | null>(null);

  const parsedTheme: GoalTheme | null = useMemo(() => {
    if (goal?.theme_json) {
      try { return JSON.parse(goal.theme_json) as GoalTheme; } catch { return null; }
    }
    return null;
  }, [goal?.theme_json]);

  const themeColors = useMemo(
    () => parsedTheme ? computeColorsFromTheme(parsedTheme) : DEFAULT_COLORS,
    [parsedTheme]
  );

  const themeActionSettings = useMemo(() => ({
    inherit: parsedTheme?.inheritActionColors ?? true,
    shadePercent: parsedTheme?.actionShadePercent ?? 85,
  }), [parsedTheme]);

  const themeCenterLayout = parsedTheme?.centerLayout ?? 'single';
  const themeCenterBackdrop = parsedTheme?.centerBackdrop ?? 'page';

  useEffect(() => {
    if (token) loadSharedGoal();
  }, [token]);

  const loadSharedGoal = async () => {
    try {
      setLoading(true);
      const data = await api.getSharedGoal(token!);
      setGoal(data.goal);
      setGuestbook(data.guestbook || []);
      setShareSettings(data.shareSettings);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const getMoodEmoji = (mood?: string) => {
    switch (mood) {
      case 'motivated': return '\ud83d\udd25';
      case 'challenged': return '\ud83d\udcaa';
      case 'accomplished': return '\ud83c\udfc6';
      case 'frustrated': return '\ud83d\ude24';
      case 'neutral': return '\ud83d\ude10';
      default: return '';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">{t('sharedGoal.loadingSharedGoal')}</p>
      </div>
    );
  }

  if (error || !goal) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 max-w-md text-center">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">{t('sharedGoal.unableToLoad')}</h2>
          <p className="text-gray-600 dark:text-gray-400">{error || t('sharedGoal.linkExpiredFallback')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 py-6">
      {/* Header */}
      <div className="container mx-auto px-4 md:px-6 max-w-6xl mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{goal.title}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('sharedGoal.readOnlyView')}</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-white dark:bg-gray-800 rounded shadow border border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setViewMode('compact')}
                className={`px-4 py-2 rounded-l text-sm transition-colors ${
                  viewMode === 'compact'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {t('sharedGoal.compact')}
              </button>
              <button
                onClick={() => setViewMode('full')}
                className={`px-4 py-2 rounded-r text-sm transition-colors ${
                  viewMode === 'full'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {t('sharedGoal.fullGrid')}
              </button>
            </div>

            {viewMode === 'full' && (
              <div className="flex bg-white dark:bg-gray-800 rounded shadow border border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setGridAspect('square')}
                  className={`px-4 py-2 rounded-l text-sm transition-colors ${
                    gridAspect === 'square'
                      ? 'bg-green-600 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {t('sharedGoal.square')}
                </button>
                <button
                  onClick={() => setGridAspect('rectangle')}
                  className={`px-4 py-2 rounded-r text-sm transition-colors ${
                    gridAspect === 'rectangle'
                      ? 'bg-green-600 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {t('sharedGoal.rectangle')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className={`container mx-auto px-4 md:px-6 ${viewMode === 'full' && gridAspect === 'rectangle' ? 'max-w-6xl lg:max-w-[85%]' : 'max-w-6xl'}`}>
        {viewMode === 'full' ? (
          <>
            <FullGridView
              goalTitle={goal.title}
              subGoals={goal.subGoals}
              onActionClick={(action) => setSelectedAction(action)}
              onSubGoalClick={() => {}}
              onAddSubGoal={() => {}}
              onAddAction={() => {}}
              gridAspect={gridAspect}
              subGoalColors={themeColors}
              actionColorSettings={themeActionSettings}
              centerLayout={themeCenterLayout}
              centerBackdrop={themeCenterBackdrop}
              readOnly
            />

            {shareSettings?.show_guestbook && guestbook.length > 0 && (
              <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
                <Guestbook preloadedEntries={guestbook} readOnly />
              </div>
            )}
          </>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 md:p-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 8, 0, 4, 7, 6, 5].map((pos) => {
                if (pos === 0) {
                  return (
                    <div
                      key="center"
                      className="bg-blue-600 text-white p-6 rounded-lg flex items-center justify-center text-center font-bold text-xl min-h-[120px]"
                    >
                      {goal.title}
                    </div>
                  );
                }

                const subGoal = goal.subGoals.find((sg) => sg.position === pos);
                if (!subGoal) {
                  return (
                    <div
                      key={`empty-${pos}`}
                      className="bg-gray-100 dark:bg-gray-900 p-6 rounded-lg flex items-center justify-center min-h-[120px] border-2 border-dashed border-gray-300 dark:border-gray-600"
                    >
                      <span className="text-gray-400 text-sm">{t('sharedGoal.position', { pos })}</span>
                    </div>
                  );
                }

                const baseColor = themeColors[pos] || '#22c55e';
                const cardBg = lightenColor(baseColor, 70);
                const textColor = getReadableTextColor(cardBg);

                return (
                  <div
                    key={subGoal.id}
                    className="p-6 rounded-lg min-h-[120px] border"
                    style={{ backgroundColor: cardBg, borderColor: baseColor }}
                  >
                    <h3 className="font-semibold mb-2" style={{ color: textColor }}>{subGoal.title}</h3>
                    <div className="space-y-1">
                      {subGoal.actions.map((action) => (
                        <div
                          key={action.id}
                          onClick={() => setSelectedAction(action)}
                          className="text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 rounded px-2 py-1 cursor-pointer hover:opacity-80 transition-colors"
                        >
                          {action.title}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {shareSettings?.show_guestbook && guestbook.length > 0 && (
              <div className="mt-8 pt-8 border-t">
                <Guestbook preloadedEntries={guestbook} readOnly />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action detail modal */}
      {selectedAction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{selectedAction.title}</h2>
                <button
                  onClick={() => setSelectedAction(null)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none"
                >
                  &times;
                </button>
              </div>

              {selectedAction.description && (
                <div className="prose prose-sm max-w-none text-gray-700 dark:text-gray-300 mb-4">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {selectedAction.description}
                  </ReactMarkdown>
                </div>
              )}

              {shareSettings?.show_logs && selectedAction.logs && selectedAction.logs.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-3">{t('sharedGoal.activityLogs')}</h3>
                  <div className="space-y-3">
                    {selectedAction.logs.map((log) => (
                      <div key={log.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                            {log.log_type} {log.mood && getMoodEmoji(log.mood)}
                          </span>
                          <span className="text-xs text-gray-400">
                            {new Date(log.log_date).toLocaleDateString()}
                          </span>
                        </div>
                        {log.content && (
                          <div className="prose prose-sm max-w-none text-gray-700 dark:text-gray-300">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {log.content}
                            </ReactMarkdown>
                          </div>
                        )}
                        {log.metric_value != null && (
                          <p className="text-sm text-blue-600 mt-1">
                            {log.metric_value} {log.metric_unit || ''}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {shareSettings?.show_logs && (!selectedAction.logs || selectedAction.logs.length === 0) && (
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('sharedGoal.noActivityLogs')}</p>
              )}

              {!shareSettings?.show_logs && (
                <p className="text-sm text-gray-400 italic">{t('sharedGoal.logsNotIncluded')}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="container mx-auto px-4 md:px-6 max-w-6xl mt-8">
        <p className="text-center text-xs text-gray-400">
          {t('sharedGoal.poweredByHarada')}
        </p>
      </div>
    </div>
  );
}
