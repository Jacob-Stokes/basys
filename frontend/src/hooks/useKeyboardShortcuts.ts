import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useChatSidebarSafe } from '../context/ChatSidebarContext';
import { useLeftPanelSafe } from '../context/LeftPanelContext';
import { useTimer } from '../context/TimerContext';
import { swapPanels } from './usePanelSwap';

/**
 * Global keyboard shortcuts using Option (Alt) as modifier.
 * All combos are suppressed when focus is inside an input/textarea/contenteditable.
 *
 * Navigation:    ⌥1–8 = tabs, ⌥, = settings
 * Panels:        ⌥[ = left panel, ⌥] = chat sidebar, ⌥\ = swap panel sides
 * Quick actions:  ⌥N = quick create, ⌥/ = show shortcuts help
 * Timer (on /timer only): ⌥S = start/stop, ⌥R = reset
 */
export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const location = useLocation();
  const chatSidebar = useChatSidebarSafe();
  const leftPanel = useLeftPanelSafe();
  const timer = useTimer();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only fire on Option/Alt
      if (!e.altKey) return;
      // Ignore if Cmd/Ctrl/Shift is also held (those are different combos)
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;

      // Ignore when focus is in a text input
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      // On macOS, Alt+key produces special characters, so e.key may be
      // something like "ß" instead of "s". Use e.code to get the physical key.
      const code = e.code;

      let handled = true;

      switch (code) {
        // ── Navigation: ⌥1–8 ────────────────────────────
        case 'Digit1': navigate('/');          break;
        case 'Digit2': navigate('/sprints');   break;
        case 'Digit3': navigate('/timer');     break;
        case 'Digit4': navigate('/life');       break;
        case 'Digit5': navigate('/journal');   break;
        case 'Digit6': navigate('/phonebook'); break;
        case 'Digit7': navigate('/terminal');  break;
        case 'Comma':  navigate('/settings');  break;

        // ── Panels: ⌥[ / ⌥] / ⌥\ ────────────────────────
        case 'BracketLeft':  leftPanel?.toggle();    break;
        case 'BracketRight': chatSidebar?.toggle();  break;
        case 'Backslash':    swapPanels();           break;

        // ── Quick actions ────────────────────────────────
        case 'KeyN':
          window.dispatchEvent(new CustomEvent('basys:quick-create'));
          break;
        case 'Slash':
          window.dispatchEvent(new CustomEvent('basys:show-shortcuts'));
          break;

        // ── Timer (only on /timer) ───────────────────────
        case 'KeyS':
          if (location.pathname === '/timer') {
            if (timer.running) timer.stop();
            else timer.start();
          } else {
            handled = false;
          }
          break;
        case 'KeyR':
          if (location.pathname === '/timer') {
            timer.reset();
          } else {
            handled = false;
          }
          break;

        default:
          handled = false;
      }

      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, location.pathname, chatSidebar, leftPanel, timer]);
}
