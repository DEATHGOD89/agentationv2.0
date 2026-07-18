import type { StateSnapshot, Collector } from "./types";

let _snapshot: StateSnapshot[] = [];
let active = false;

function detectReduxState(): StateSnapshot | null {
  try {
    if (typeof window === "undefined") return null;

    const reduxHook = (window as unknown as Record<string, unknown>).__REDUX_DEVTOOLS_EXTENSION__;
    if (!reduxHook) {
      const store = (window as unknown as Record<string, unknown>).__store__;
      if (store) {
        const s = store as Record<string, unknown>;
        if (typeof s.getState === "function") {
          const state = s.getState() as Record<string, unknown>;
          return {
            storeType: "redux",
            storeName: "default",
            state: sanitizeState(state),
            timestamp: Date.now(),
          };
        }
      }
      return null;
    }

    const stores = (window as unknown as Record<string, unknown>).__REDUX_STORE__;
    if (stores) {
      const s = stores as Record<string, unknown>;
      if (typeof s.getState === "function") {
        const state = s.getState() as Record<string, unknown>;
        return {
          storeType: "redux",
          storeName: "default",
          state: sanitizeState(state),
          timestamp: Date.now(),
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

function detectZustandState(): StateSnapshot | null {
  try {
    if (typeof window === "undefined") return null;

    const zustandStores: StateSnapshot[] = [];

    const win = window as unknown as Record<string, unknown>;
    for (const key of Object.keys(win)) {
      const val = win[key];
      if (val && typeof val === "object") {
        const obj = val as Record<string, unknown>;

        if (typeof obj.getState === "function" && typeof obj.subscribe === "function") {
          const state = obj.getState() as Record<string, unknown>;
          if (state && typeof state === "object") {
            zustandStores.push({
              storeType: "zustand",
              storeName: key,
              state: sanitizeState(state),
              timestamp: Date.now(),
            });
          }
        }
      }
    }

    if (zustandStores.length > 0) return zustandStores[0];
    return null;
  } catch {
    return null;
  }
}

function detectVuexState(): StateSnapshot | null {
  try {
    if (typeof document === "undefined") return null;

    const rootEl = document.querySelector("[data-v-app]") || document.getElementById("app");
    if (!rootEl) return null;

    const appKey = Object.keys(rootEl).find((k) => k.startsWith("__vue_app__"));
    if (!appKey) return null;

    const app = (rootEl as unknown as Record<string, unknown>)[appKey];
    if (!app || typeof app !== "object") return null;

    const appObj = app as Record<string, unknown>;
    const config = appObj.config as Record<string, unknown> | undefined;
    const globalProperties = config?.globalProperties as Record<string, unknown> | undefined;

    if (globalProperties && typeof globalProperties.$store === "object") {
      const store = globalProperties.$store as Record<string, unknown>;
      if (typeof store.state === "object" && store.state) {
        return {
          storeType: "vuex",
          storeName: "vuex",
          state: sanitizeState(store.state as Record<string, unknown>),
          timestamp: Date.now(),
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

function sanitizeState(state: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  try {
    for (const [key, value] of Object.entries(state)) {
      if (typeof value === "function") continue;
      if (key.startsWith("_")) continue;
      try {
        JSON.stringify(value);
        result[key] = value;
      } catch {
        result[key] = `[non-serializable: ${typeof value}]`;
      }
    }
  } catch {
    // ignore
  }
  return result;
}

export const stateCollector: Collector = {
  name: "state",

  start(): void {
    if (active) return;
    active = true;
  },

  stop(): void {
    active = false;
  },

  snapshot() {
    const snapshots: StateSnapshot[] = [];

    try {
      const redux = detectReduxState();
      if (redux) snapshots.push(redux);
    } catch {
      // ignore
    }

    try {
      const zustand = detectZustandState();
      if (zustand) snapshots.push(zustand);
    } catch {
      // ignore
    }

    try {
      const vuex = detectVuexState();
      if (vuex) snapshots.push(vuex);
    } catch {
      // ignore
    }

    _snapshot = snapshots;
    return { state: snapshots };
  },

  clear(): void {
    _snapshot = [];
  },
};
