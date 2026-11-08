import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/** A value only the browser knows (feature support). Server renders `server`. */
export function useClientValue<T extends string | number | boolean | null>(read: () => T, server: T): T {
  return useSyncExternalStore(noopSubscribe, read, () => server);
}

/** A localStorage string that re-renders when `event` fires on window. */
export function useStoredString(key: string, event: string): string | null {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener(event, notify);
      return () => window.removeEventListener(event, notify);
    },
    () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );
}
