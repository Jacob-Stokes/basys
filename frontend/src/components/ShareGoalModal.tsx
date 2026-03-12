import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useModKeySubmit } from '../hooks/useModKeySubmit';

interface ShareLink {
  id: string;
  token: string;
  show_logs: number;
  show_guestbook: number;
  created_at: string;
}

interface ShareGoalModalProps {
  goalId: string;
  goalTitle: string;
  onClose: () => void;
}

export default function ShareGoalModal({ goalId, goalTitle, onClose }: ShareGoalModalProps) {
  const { t } = useTranslation();
  const [showLogs, setShowLogs] = useState(false);
  const [showGuestbook, setShowGuestbook] = useState(false);
  const [existingLinks, setExistingLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLinks();
  }, [goalId]);

  const loadLinks = async () => {
    try {
      setLoading(true);
      const links = await api.getShareLinks(goalId);
      setExistingLinks(links);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      setCreating(true);
      setError(null);
      await api.createShareLink({
        goal_id: goalId,
        show_logs: showLogs,
        show_guestbook: showGuestbook,
      });
      await loadLinks();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  useModKeySubmit(true, handleCreate, !creating);

  const handleRevoke = async (shareId: string) => {
    try {
      setError(null);
      await api.deleteShareLink(shareId);
      setExistingLinks((prev) => prev.filter((l) => l.id !== shareId));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const getShareUrl = (token: string) => {
    return `${window.location.origin}/share/${token}`;
  };

  const handleCopy = async (token: string, id: string) => {
    try {
      await navigator.clipboard.writeText(getShareUrl(token));
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = getShareUrl(token);
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('share.shareGoal')}</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            >
              &times;
            </button>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4" dangerouslySetInnerHTML={{
            __html: t('share.createLinkDescription', { title: goalTitle })
          }} />

          {/* Create new link */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-gray-800 mb-3">{t('share.newShareLink')}</h3>
            <div className="space-y-2 mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showLogs}
                  onChange={(e) => setShowLogs(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">{t('share.includeActivityLogs')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showGuestbook}
                  onChange={(e) => setShowGuestbook(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">{t('share.includeAiGuestbook')}</span>
              </label>
            </div>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm font-medium"
            >
              {creating ? t('share.creating') : t('share.generateLink')}
            </button>
          </div>

          {error && (
            <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-400 px-3 py-2 rounded text-sm mb-4">
              {error}
            </div>
          )}

          {/* Existing links */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-3">
              {t('share.activeLinks')} {!loading && `(${existingLinks.length})`}
            </h3>

            {loading ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
            ) : existingLinks.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('share.noActiveLinks')}</p>
            ) : (
              <div className="space-y-3">
                {existingLinks.map((link) => (
                  <div
                    key={link.id}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-3"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="text"
                        readOnly
                        value={getShareUrl(link.token)}
                        className="flex-1 text-xs bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-gray-600 dark:text-gray-400 font-mono"
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                      />
                      <button
                        onClick={() => handleCopy(link.token, link.id)}
                        className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors whitespace-nowrap"
                      >
                        {copiedId === link.id ? t('common.copied') : t('common.copy')}
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                        <span>{new Date(link.created_at).toLocaleDateString()}</span>
                        <span>{link.show_logs ? t('share.logs') : t('share.noLogs')}</span>
                        <span>{link.show_guestbook ? t('share.guestbook') : t('share.noGuestbook')}</span>
                      </div>
                      <button
                        onClick={() => handleRevoke(link.id)}
                        className="text-xs text-red-600 hover:text-red-800 transition-colors"
                      >
                        {t('common.revoke')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
