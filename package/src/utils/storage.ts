import type { Annotation } from "../types";

export function createStorageStore<T>(prefix: string, retentionDays = 0, useSession = false) {
  return {
    load(pathname: string): T | null {
      if (typeof window === "undefined") return null;
      try {
        const key = `${prefix}${pathname}`;
        const storage = useSession ? sessionStorage : localStorage;
        const stored = storage.getItem(key);
        if (!stored) return null;
        
        let data: any;
        try {
          data = JSON.parse(stored);
        } catch {
          // If it's not valid JSON, it must have been saved as a raw string
          return stored as unknown as T;
        }
        
        if (retentionDays > 0 && Array.isArray(data)) {
          const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
          return data.filter((a: any) => !a.timestamp || a.timestamp > cutoff) as T;
        }
        return data as T;
      } catch {
        return null;
      }
    },
    save(pathname: string, data: T): void {
      if (typeof window === "undefined") return;
      try {
        const key = `${prefix}${pathname}`;
        const storage = useSession ? sessionStorage : localStorage;
        if (typeof data === "string") {
          storage.setItem(key, data);
        } else {
          storage.setItem(key, JSON.stringify(data));
        }
      } catch {
        // ignore
      }
    },
    clear(pathname: string): void {
      if (typeof window === "undefined") return;
      try {
        const storage = useSession ? sessionStorage : localStorage;
        storage.removeItem(`${prefix}${pathname}`);
      } catch {
        // ignore
      }
    }
  };
}

// =============================================================================
// Annotations Storage
// =============================================================================
const STORAGE_PREFIX = "feedback-annotations-";
const annotationStore = createStorageStore<Annotation[]>(STORAGE_PREFIX, 7);

export function getStorageKey(pathname: string): string {
  return `${STORAGE_PREFIX}${pathname}`;
}
export const loadAnnotations = <T = Annotation>(pathname: string): T[] => 
  (annotationStore.load(pathname) as unknown as T[]) || [];
export const saveAnnotations = <T = Annotation>(pathname: string, annotations: T[]): void => 
  annotationStore.save(pathname, annotations as unknown as Annotation[]);
export const clearAnnotations = (pathname: string): void => annotationStore.clear(pathname);

export function loadAllAnnotations<T = Annotation>(): Map<string, T[]> {
  const result = new Map<string, T[]>();
  if (typeof window === "undefined") return result;

  try {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) {
        const pathname = key.slice(STORAGE_PREFIX.length);
        const stored = localStorage.getItem(key);
        if (stored) {
          const data = JSON.parse(stored);
          const filtered = data.filter((a: any) => !a.timestamp || a.timestamp > cutoff);
          if (filtered.length > 0) result.set(pathname, filtered as unknown as T[]);
        }
      }
    }
  } catch {}
  return result;
}

// Sync Markers
type AnnotationWithSyncMarker = Annotation & { _syncedTo?: string };
export function saveAnnotationsWithSyncMarker(pathname: string, annotations: Annotation[], sessionId: string): void {
  const marked = annotations.map(a => ({ ...a, _syncedTo: sessionId }));
  saveAnnotations(pathname, marked);
}
export function getUnsyncedAnnotations(pathname: string, sessionId?: string): Annotation[] {
  const annotations = loadAnnotations<AnnotationWithSyncMarker>(pathname);
  return annotations.filter(a => !a._syncedTo || (sessionId && a._syncedTo !== sessionId));
}
export function clearSyncMarkers(pathname: string): void {
  const annotations = loadAnnotations<AnnotationWithSyncMarker>(pathname);
  const cleaned = annotations.map(({ _syncedTo, ...rest }) => rest as Annotation);
  saveAnnotations(pathname, cleaned);
}

// =============================================================================
// Mode Storage (Design, Rearrange, Wireframe)
// =============================================================================
const designStore = createStorageStore<unknown[]>("agentation-design-");
export const loadDesignPlacements = <T = unknown>(pathname: string): T[] => (designStore.load(pathname) as T[]) || [];
export const saveDesignPlacements = <T = unknown>(pathname: string, data: T[]): void => designStore.save(pathname, data as unknown[]);
export const clearDesignPlacements = (pathname: string): void => designStore.clear(pathname);

const rearrangeStore = createStorageStore<unknown>("agentation-rearrange-");
export const loadRearrangeState = <T = unknown>(pathname: string): T | null => rearrangeStore.load(pathname) as T | null;
export const saveRearrangeState = <T = unknown>(pathname: string, state: T): void => rearrangeStore.save(pathname, state);
export const clearRearrangeState = (pathname: string): void => rearrangeStore.clear(pathname);

type WireframeState = { rearrange: unknown | null; placements: unknown[]; purpose: string };
const wireframeStore = createStorageStore<WireframeState>("agentation-wireframe-");
export const loadWireframeState = <T = unknown>(pathname: string): WireframeState | null => wireframeStore.load(pathname);
export const saveWireframeState = (pathname: string, state: WireframeState): void => wireframeStore.save(pathname, state);
export const clearWireframeState = (pathname: string): void => wireframeStore.clear(pathname);

// =============================================================================
// Session / Toolbar
// =============================================================================
const SESSION_PREFIX = "agentation-session-";
const sessionStore = createStorageStore<string>(SESSION_PREFIX);
export const getSessionStorageKey = (pathname: string): string => `${SESSION_PREFIX}${pathname}`;
export const loadSessionId = (pathname: string): string | null => sessionStore.load(pathname);
export const saveSessionId = (pathname: string, id: string): void => sessionStore.save(pathname, id);
export const clearSessionId = (pathname: string): void => sessionStore.clear(pathname);

const TOOLBAR_HIDDEN_KEY = "toolbar-hidden";
const toolbarStore = createStorageStore<string>(SESSION_PREFIX, 0, true);
export const loadToolbarHidden = (): boolean => toolbarStore.load(TOOLBAR_HIDDEN_KEY) === "1";
export const saveToolbarHidden = (hidden: boolean): void => {
  if (hidden) toolbarStore.save(TOOLBAR_HIDDEN_KEY, "1");
  else toolbarStore.clear(TOOLBAR_HIDDEN_KEY);
};
