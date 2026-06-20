import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Preserves the scroll position of a scroll container per route.
 *
 * Survives:
 *  - soft re-renders / react-query refetches
 *  - status edits, dialog open/close (which momentarily collapse the table)
 *  - tab switches
 *
 * Resets on a hard reload (sessionStorage is per-tab and cleared on close).
 */
export function useScrollRestoration<T extends HTMLElement = HTMLElement>(extraKey = '') {
  const ref = useRef<T | null>(null);
  const location = useLocation();
  const storageKey = `scroll:${location.pathname}${extraKey ? `:${extraKey}` : ''}`;
  const lastSavedRef = useRef<number>(0);
  const userScrolledRef = useRef<boolean>(false);

  const getSaved = () => {
    const raw = sessionStorage.getItem(storageKey);
    if (raw === null) return null;
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? null : n;
  };

  // Restore on mount / route change — before paint to avoid flicker.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    userScrolledRef.current = false;
    const saved = getSaved();
    const top = saved ?? 0;
    lastSavedRef.current = top;
    // Defer to next frame so child content has actually rendered.
    requestAnimationFrame(() => {
      el.scrollTop = top;
    });
  }, [storageKey]);

  // Save on scroll + watch for content size changes that wipe scrollTop.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        const top = el.scrollTop;
        // Only persist a meaningful change (avoid persisting an accidental 0
        // jump caused by a transient content collapse).
        if (top > 0 || userScrolledRef.current) {
          lastSavedRef.current = top;
          sessionStorage.setItem(storageKey, String(top));
        }
        frame = 0;
      });
    };

    const markUserScroll = () => {
      userScrolledRef.current = true;
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('wheel', markUserScroll, { passive: true });
    el.addEventListener('touchmove', markUserScroll, { passive: true });
    el.addEventListener('keydown', markUserScroll);

    // When child content resizes (e.g. dialog close → react-query refetch
    // collapses then re-renders the table), the browser resets scrollTop to 0.
    // Re-apply the last saved position once the content is tall enough again.
    const ro = new ResizeObserver(() => {
      const target = lastSavedRef.current;
      if (target <= 0) return;
      if (el.scrollTop === target) return;
      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll >= target) {
        // Two-step restore guards against layout still settling.
        el.scrollTop = target;
        requestAnimationFrame(() => {
          if (el.scrollTop !== target && el.scrollHeight - el.clientHeight >= target) {
            el.scrollTop = target;
          }
        });
      }
    });
    // Observe the scroll container AND its first child (the page content)
    // so we react to inner content shrink/grow, not just the container.
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);

    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('wheel', markUserScroll);
      el.removeEventListener('touchmove', markUserScroll);
      el.removeEventListener('keydown', markUserScroll);
      ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [storageKey]);

  return ref;
}
