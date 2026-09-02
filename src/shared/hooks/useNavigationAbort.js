"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const NavigationAbortContext = createContext(null);

/**
 * Aborts in-flight fetches when the dashboard route changes so menu navigation
 * is not blocked by the previous page's API work.
 */
export function NavigationAbortProvider({ children }) {
  const pathname = usePathname();
  const controllerRef = useRef(null);

  if (!controllerRef.current) {
    controllerRef.current = new AbortController();
  }

  useEffect(() => {
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();
  }, [pathname]);

  return (
    <NavigationAbortContext.Provider value={controllerRef}>
      {children}
    </NavigationAbortContext.Provider>
  );
}

/** Signal aborted when the dashboard route changes. */
export function useNavigationAbortSignal() {
  const controllerRef = useContext(NavigationAbortContext);
  // Tie to pathname so callers re-read the current controller after navigation.
  usePathname();
  return controllerRef?.current?.signal;
}

export function isAbortError(error) {
  return error?.name === "AbortError";
}
