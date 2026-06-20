import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Preserves the scroll position of a scroll container per route + per tab.
 * Stores in sessionStorage so it survives soft re-renders, status edits,
 * react-query refetches, and tab switches — but resets on a hard reload.
 *
 * Usage: const ref = useScrollRestoration(); <main ref={ref} className="overflow-auto">
 */
export function useScrollRestoration<T extends HTMLElement = HTMLElement>(extraKey = '') {
  const ref = useRef<T | null>(null);
  const location = useLocation();
  const storageKey = `scroll:${location.pathname}${extraKey ? `:${extraKey}` : ''}`;

  // Restore on mount / route change — before paint to avoid flicker.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const saved = sessionStorage.getItem(storageKey);
    if (saved !== null) {
      const top = parseInt(saved, 10);
      if (!Number.isNaN(top)) {
        // Defer to next frame so child content has actually rendered.
        requestAnimationFrame(() => {
          el.scrollTop = top;
        });
      }
    } else {
      el.scrollTop = 0;
    }
  }, [storageKey]);

  // Save on scroll (throttled via rAF).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        sessionStorage.setItem(storageKey, String(el.scrollTop));
        frame = 0;
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [storageKey]);

  return ref;
}
