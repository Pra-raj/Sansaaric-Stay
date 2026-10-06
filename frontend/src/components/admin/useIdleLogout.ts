"use client";

import { useEffect } from "react";

export const IDLE_NOTICE_KEY = "sansaaric-admin-idle";
const IDLE_MS = 30 * 60 * 1000; // 30 minutes
const EVENTS = ["mousemove", "keydown", "click", "touchstart", "scroll"] as const;

/** Signs the admin out after 30 minutes without any activity. */
export function useIdleLogout(active: boolean, logOut: () => void) {
  useEffect(() => {
    if (!active) return;
    let timer = window.setTimeout(expire, IDLE_MS);

    function expire() {
      try {
        sessionStorage.setItem(IDLE_NOTICE_KEY, "1");
      } catch {
        // storage unavailable: just sign out
      }
      logOut();
    }
    function reset() {
      window.clearTimeout(timer);
      timer = window.setTimeout(expire, IDLE_MS);
    }

    EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      EVENTS.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [active, logOut]);
}
