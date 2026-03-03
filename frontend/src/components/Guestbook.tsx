import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { API_URL } from '../api/client';
import ReactMarkdown from 'react-markdown';
import { useDisplaySettings } from '../context/DisplaySettingsContext';

interface GuestbookEntry {
  id: string;
  agent_name: string;
  comment: string;
  target_type: 'user' | 'goal' | 'subgoal' | 'action';
  target_id: string | null;
  created_at: string;
}

interface GuestbookProps {
  targetType?: 'user' | 'goal' | 'subgoal' | 'action';
  targetId?: string;
  preloadedEntries?: GuestbookEntry[];
  readOnly?: boolean;
}

export default function Guestbook({ targetType, targetId, preloadedEntries, readOnly }: GuestbookProps) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<GuestbookEntry[]>(preloadedEntries || []);
  const [loading, setLoading] = useState(!preloadedEntries);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const { settings: displaySettings } = useDisplaySettings();

  useEffect(() => {
    if (!preloadedEntries) {
      loadEntries();
    }
  }, [targetType, targetId]);

  const loadEntries = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (targetType) params.append('target_type', targetType);
      if (targetId) params.append('target_id', targetId);

      const response = await fetch(`${API_URL}/api/guestbook?${params.toString()}`, {
        credentials: 'include',
        headers: {
          'x-api-key': localStorage.getItem('apiKey') || ''
        }
      });

      const data = await response.json();
      if (data.success) {
        setEntries(data.data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const perPage = displaySettings.guestbookPerPage;
  const totalPages = Math.max(1, Math.ceil(entries.length / perPage));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedEntries = useMemo(
    () => entries.slice((safePage - 1) * perPage, safePage * perPage),
    [entries, safePage, perPage]
  );

  const getTargetIcon = (type: string) => {
    switch (type) {
      case 'user': return '\ud83d\udc64';
      case 'goal': return '\ud83c\udfaf';
      case 'subgoal': return '\ud83d\udcca';
      case 'action': return '\u2705';
      default: return '\ud83d\udcac';
    }
  };

  const getTargetLabel = (type: string) => {
    switch (type) {
      case 'user': return t('guestbook.general');
      case 'goal': return t('guestbook.goal');
      case 'subgoal': return t('guestbook.subGoal');
      case 'action': return t('guestbook.action');
      default: return t('guestbook.comment');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-gray-500">{t('guestbook.loadingGuestbook')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          {t('guestbook.title', { count: entries.length })}
        </h3>
        {!readOnly && (
          <button
            onClick={loadEntries}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            {t('common.refresh')}
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <p className="text-gray-500 mb-2">{t('guestbook.noComments')}</p>
          <p className="text-sm text-gray-400">
            {t('guestbook.noCommentsDesc')}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {paginatedEntries.map((entry) => (
              <div
                key={entry.id}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{getTargetIcon(entry.target_type)}</span>
                    <div>
                      <div className="font-semibold text-gray-900">{entry.agent_name}</div>
                      <div className="text-xs text-gray-500">
                        {getTargetLabel(entry.target_type)}
                        {entry.target_id && (
                          <span className="ml-1">&middot; {t('guestbook.idPrefix')}{entry.target_id.substring(0, 8)}...</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-400">
                    {new Date(entry.created_at).toLocaleDateString()}
                  </div>
                </div>

                <div className="prose prose-sm max-w-none text-gray-700">
                  <ReactMarkdown>{entry.comment}</ReactMarkdown>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <p className="text-sm text-gray-500">
                {t('guestbook.showingRange', {
                  start: (safePage - 1) * perPage + 1,
                  end: Math.min(safePage * perPage, entries.length),
                  total: entries.length,
                })}
              </p>
              <div className="flex gap-1">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t('home.prev')}
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-3 py-1 text-sm border rounded ${
                      page === safePage ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-50'
                    }`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t('home.next')}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {!readOnly && (
        <div className="text-xs text-gray-500 text-center pt-4 border-t">
          {t('guestbook.apiHint')}
        </div>
      )}
    </div>
  );
}
