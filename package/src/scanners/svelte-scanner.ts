import type { FrameworkScanner, FrameworkInfo } from "./types";

let _sveltePresent: boolean | null = null;

interface SvelteComponentInfo {
  $$: {
    fragment: unknown;
    ctx: unknown[];
    callbacks: Record<string, unknown>;
    on_destroy: unknown[];
    on_mount: unknown[];
    before_update: unknown[];
    after_update: unknown[];
    context: Map<unknown, unknown>;
    root: SvelteComponentInfo | null;
  };
  $set?: (props: Record<string, unknown>) => void;
  $destroy?: () => void;
  $on?: (event: string, handler: unknown) => unknown;
  constructor?: { name?: string };
}

function hasSvelteMarker(element: HTMLElement): boolean {
  const keys = Object.keys(element);
  if (keys.some((k) => k.startsWith("__svelte"))) return true;

  if (element.className && typeof element.className === "string") {
    if (element.className.includes("svelte-")) return true;
  }

  return false;
}

function findSvelteRoot(
  element: HTMLElement,
): SvelteComponentInfo | null {
  let current: HTMLElement | null = element;
  let depth = 0;

  while (current && depth < 20) {
    depth++;
    const keys = Object.keys(current);
    const svelteKey = keys.find(
      (k) => k.startsWith("__svelte") && !k.includes(""),
    );

    if (svelteKey) {
      const val = (current as unknown as Record<string, unknown>)[svelteKey];
      if (val && typeof val === "object") {
        const obj = val as Record<string, unknown>;
        if (obj.$$ && typeof obj.$$ === "object") {
          return obj as unknown as SvelteComponentInfo;
        }
      }
    }

    const $$key = keys.find((k) => k === "$$");
    if ($$key) {
      const val = (current as unknown as Record<string, unknown>)[$$key];
      if (val && typeof val === "object") {
        return { $$: val } as unknown as SvelteComponentInfo;
      }
    }

    current = current.parentElement;
  }
  return null;
}

function walkSvelteComponents(
  root: SvelteComponentInfo,
): FrameworkInfo | null {
  const components: string[] = [];

  if (root.constructor?.name && root.constructor.name !== "Object") {
    components.push(root.constructor.name);
  }

  let current = root.$$.root;
  const depth = 0;

  while (current && components.length < 6 && depth < 20) {
    const name = current.constructor?.name;
    if (name && name !== "Object" && !components.includes(name)) {
      components.push(name);
    }
    current = current.$$.root;
    if (current === root) break;
  }

  if (components.length === 0) return null;

  return {
    framework: "svelte",
    components: components.slice().reverse(),
    path: components
      .slice()
      .reverse()
      .map((c) => `<${c}>`)
      .join(" "),
    confidence: 0.7,
  };
}

function detectSveltePresence(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const body = document.body;
    if (!body) return false;

    const candidates = [body, ...Array.from(body.querySelectorAll("*")).slice(0, 200)];

    for (const el of candidates) {
      if (el instanceof HTMLElement) {
        if (hasSvelteMarker(el)) return true;
      }
    }

    const styles = document.querySelectorAll("style");
    for (const style of styles) {
      if (style.textContent?.includes("svelte-")) return true;
    }

    return false;
  } catch {
    return false;
  }
}

export const svelteScanner: FrameworkScanner = {
  id: "svelte",
  priority: 70,

  isPresent(): boolean {
    if (_sveltePresent !== null) return _sveltePresent;
    _sveltePresent = detectSveltePresence();
    return _sveltePresent;
  },

  scan(element: HTMLElement): FrameworkInfo | null {
    try {
      if (!this.isPresent()) return null;

      const root = findSvelteRoot(element);
      if (!root) return null;

      const result = walkSvelteComponents(root);
      if (result) return result;

      if (element.className && typeof element.className === "string") {
        const match = element.className.match(/svelte-([a-z0-9]+)/);
        if (match) {
          return {
            framework: "svelte",
            components: [],
            path: null,
            confidence: 0.5,
          };
        }
      }

      return null;
    } catch {
      return null;
    }
  },
};
