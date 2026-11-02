import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Scrolls the window to the very top whenever the route pathname changes.
 * Uses two rAF ticks to win the race against TanStack's internal restore
 * and any layout-shift that happens after the new route mounts.
 */
export function ScrollToTop() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const scroll = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    scroll();
    const r1 = requestAnimationFrame(() => {
      scroll();
      const r2 = requestAnimationFrame(scroll);
      (scroll as any)._r2 = r2;
    });
    return () => cancelAnimationFrame(r1);
  }, [pathname]);

  return null;
}
