import type { FrameworkScanner, FrameworkInfo } from "./types";

let _angularPresent: boolean | null = null;

const LVIEW_COMPONENT_INDEX = 490;
const LVIEW_HOST_INDEX = 491;
const LVIEW_TVIEW_INDEX = 488;

interface LViewDebug {
  [index: number]: unknown;
  component?: { name?: string };
  host?: unknown;
}

interface TViewDebug {
  type?: { name?: string };
  component?: unknown;
}

function hasAngularMarker(element: HTMLElement): boolean {
  const keys = Object.keys(element);
  if (keys.some((k) => k.startsWith("__ng"))) return true;
  if (keys.some((k) => k.startsWith("ng-"))) return true;
  if (element.hasAttribute?.("ng-version")) return true;
  if (element.tagName?.startsWith("APP-") || element.tagName?.startsWith("NG-")) {
    return true;
  }
  return false;
}

function findLView(element: HTMLElement): object | null {
  const keys = Object.keys(element);
  const lviewKey = keys.find(
    (k) => k.startsWith("__ngContext__") && !k.includes(""),
  );
  if (lviewKey) {
    try {
      return (element as unknown as Record<string, object>)[lviewKey];
    } catch {
      return null;
    }
  }
  return null;
}

function extractAngularComponentInfo(lview: object): {
  name: string;
  parents: string[];
} {
  const components: string[] = [];
  let current: object | null = lview;
  const seen = new Set<object>();
  let maxDepth = 20;

  while (current && components.length < 6 && maxDepth > 0 && !seen.has(current)) {
    maxDepth--;
    seen.add(current);

    try {
      const lviewArr = current as unknown as LViewDebug;
      const tview = lviewArr[LVIEW_TVIEW_INDEX] as TViewDebug | undefined;

      if (tview?.type && typeof tview.type === "object") {
        const name =
          (tview.type as { name?: string }).name ||
          (tview.type as { __class?: string }).__class;
        if (name && !name.startsWith("_") && !components.includes(name)) {
          components.push(name);
        }
      }

      const host = lviewArr[LVIEW_HOST_INDEX] as
        | { element?: HTMLElement; parent?: object }
        | undefined;
      if (host?.element) {
        const lview2 = findLView(host.element);
        if (lview2 && !seen.has(lview2)) {
          current = lview2;
          continue;
        }
      }

      if (host?.parent && !seen.has(host.parent)) {
        current = host.parent;
        continue;
      }

      break;
    } catch {
      break;
    }
  }

  return {
    name: components[0] || "Component",
    parents: components.slice(1),
  };
}

function detectAngularPresence(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const rootEl = document.querySelector("[ng-version]");
    if (rootEl) {
      const version = rootEl.getAttribute("ng-version");
      return true;
    }

    const body = document.body;
    if (!body) return false;

    const candidates = [body, ...Array.from(body.children).slice(0, 30)];

    for (const el of candidates) {
      if (el instanceof HTMLElement && hasAngularMarker(el)) {
        return true;
      }
    }

    for (const el of candidates) {
      if (el instanceof HTMLElement) {
        const lview = findLView(el);
        if (lview) return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

export const angularScanner: FrameworkScanner = {
  id: "angular",
  priority: 80,

  isPresent(): boolean {
    if (_angularPresent !== null) return _angularPresent;
    _angularPresent = detectAngularPresence();
    return _angularPresent;
  },

  scan(element: HTMLElement): FrameworkInfo | null {
    try {
      if (!this.isPresent()) return null;

      let current: HTMLElement | null = element;
      let depth = 0;

      while (current && depth < 15) {
        depth++;
        const lview = findLView(current);
        if (lview) {
          const info = extractAngularComponentInfo(lview);
          const allComponents = [info.name, ...info.parents];

          return {
            framework: "angular",
            components: allComponents,
            path: allComponents
              .map((c) => `<${c}>`)
              .join(" "),
            version: document.querySelector("[ng-version]")?.getAttribute("ng-version") || undefined,
            confidence: 0.85,
          };
        }

        if (hasAngularMarker(current)) {
          return {
            framework: "angular",
            components: [],
            path: null,
            confidence: 0.5,
          };
        }

        current = current.parentElement;
      }

      return null;
    } catch {
      return null;
    }
  },
};
