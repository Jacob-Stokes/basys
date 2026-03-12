import { useEffect } from 'react';

/**
 * Adds Cmd+Enter (Mac) / Ctrl+Enter (Win/Linux) submit behavior to modal overlays.
 *
 * @param active  Whether the modal is currently open
 * @param onSubmit  The submit handler to call
 * @param canSubmit  Optional guard — only fires if true (defaults to true)
 */
export function useModKeySubmit(active: boolean, onSubmit: () => void, canSubmit = true) {
  useEffect(() => {
    if (!active) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSubmit) {
        e.preventDefault();
        onSubmit();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active, onSubmit, canSubmit]);
}
