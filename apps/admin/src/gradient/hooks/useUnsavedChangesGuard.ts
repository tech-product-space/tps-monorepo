"use client";

import { useCallback, useEffect, useRef } from "react";

interface UnsavedChangesGuardOptions {
  /** Turn the guard on only while there is something worth losing. */
  enabled: boolean;
  /**
   * Called with the destination when an in-app link click is intercepted.
   * Must be referentially stable.
   */
  onNavigate: (href: string) => void;
  /**
   * Called when a browser back/forward press is intercepted.
   * Must be referentially stable.
   */
  onBack: () => void;
}

interface UnsavedChangesGuard {
  /**
   * Disarms the guard for a deliberate programmatic navigation.
   *
   * Returns true when a sentinel history entry is currently standing in for the
   * page — in that case navigate with `router.replace` rather than `push`, so
   * the sentinel is consumed instead of leaving a duplicate back step behind.
   */
  allowNavigation: () => boolean;
  /** Completes an intercepted back press, stepping past the sentinel. */
  confirmBack: () => void;
}

const SENTINEL_STATE = { __unsavedChangesGuard: true };

/**
 * Warns before the page is discarded while edits are pending.
 *
 * Covers the three ways out of an editor: closing/reloading the tab (native
 * browser prompt), clicking an in-app link, and the browser back button. The
 * last two are intercepted so the caller can show its own dialog.
 *
 * Back presses can only be intercepted by keeping a throwaway history entry on
 * top of the real one: the press pops the sentinel instead of leaving the page,
 * and the guard immediately pushes a fresh one so the next press is caught too.
 */
export function useUnsavedChangesGuard({
  enabled,
  onNavigate,
  onBack,
}: UnsavedChangesGuardOptions): UnsavedChangesGuard {
  const bypassRef = useRef(false);
  const sentinelRef = useRef(false);

  // Tab close / reload / external navigation.
  useEffect(() => {
    if (!enabled) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () =>
      window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [enabled]);

  // In-app navigation via <a> / next/link.
  useEffect(() => {
    if (!enabled) return;

    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || bypassRef.current) return;
      // Let the browser handle new-tab / middle-click / modified clicks.
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      let destination: URL;
      try {
        destination = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }

      if (destination.origin !== window.location.origin) return;

      const current = window.location.pathname + window.location.search;
      const next = destination.pathname + destination.search;
      if (next === current) return;

      event.preventDefault();
      event.stopPropagation();
      onNavigate(next + destination.hash);
    };

    // Capture phase so this runs before next/link's own handler.
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [enabled, onNavigate]);

  // Browser back / forward.
  useEffect(() => {
    if (!enabled) return;

    bypassRef.current = false;
    window.history.pushState(SENTINEL_STATE, "", window.location.href);
    sentinelRef.current = true;

    const handlePopState = () => {
      if (bypassRef.current) return;

      // The press consumed the sentinel; restore it, then ask.
      window.history.pushState(SENTINEL_STATE, "", window.location.href);
      sentinelRef.current = true;
      onBack();
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);

      // Guard switched off while staying on the page (e.g. everything saved):
      // drop the sentinel so it doesn't cost the user a dead back press.
      if (sentinelRef.current && !bypassRef.current) {
        sentinelRef.current = false;
        window.history.back();
      }
    };
  }, [enabled, onBack]);

  const allowNavigation = useCallback(() => {
    bypassRef.current = true;
    const hadSentinel = sentinelRef.current;
    sentinelRef.current = false;
    return hadSentinel;
  }, []);

  const confirmBack = useCallback(() => {
    const hadSentinel = sentinelRef.current;
    bypassRef.current = true;
    sentinelRef.current = false;
    // Step over the sentinel as well as the page the user is leaving.
    window.history.go(hadSentinel ? -2 : -1);
  }, []);

  return { allowNavigation, confirmBack };
}
