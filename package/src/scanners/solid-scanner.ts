import type { FrameworkScanner, FrameworkInfo } from "./types";

let _solidPresent: boolean | null = null;

function hasSolidMarker(element: HTMLElement): boolean {
  const keys = Object.keys(element);

  if (keys.some((k) => k.startsWith("_$"))) return true;

  if (keys.some((k) => k.startsWith("__solid"))) return true;

  if (element.hasAttribute?.("data-hk")) return true;

  return false;
}

function getSolidComponentName(component: Record<string, unknown>): string | null {
  if (component.name && typeof component.name === "string" && component.name !== "undefined") {
    return component.name;
  }
  if (
    component.render &&
    typeof component.render === "function"
  ) {
    return component.render.name || null;
  }
  if (
    component.component &&
    typeof component.component === "object"
  ) {
    return getSolidComponentName(component.component as Record<string, unknown>);
  }
  return null;
}

function walkSolidHierarchy(element: HTMLElement): FrameworkInfo | null {
  const keys = Object.keys(element);
  const solidKey = keys.find(
    (k) =>
      k.startsWith("_$") &&
      !k.includes("_$") === false,
  );

  if (!solidKey) return null;

  const val = (element as unknown as Record<string, unknown>)[solidKey];
  if (!val || typeof val !== "object") return null;

  const components: string[] = [];
  let current: Record<string, unknown> | null = val as Record<string, unknown>;
  const seen = new Set<string>();
  let maxDepth = 20;

  while (current && components.length < 6 && maxDepth > 0) {
    maxDepth--;

    const name = getSolidComponentName(current);
    if (name && !seen.has(name)) {
      seen.add(name);
      components.push(name);
    }

    if (current.owner && typeof current.owner === "object" && current.owner !== current) {
      current = current.owner as Record<string, unknown>;
    } else if (current.parent && typeof current.parent === "object" && current.parent !== current) {
      current = current.parent as Record<string, unknown>;
    } else {
      break;
    }
  }

  if (components.length > 0) {
    return {
      framework: "solid",
      components: components.slice().reverse(),
      path: components
        .slice()
        .reverse()
        .map((c) => `<${c}>`)
        .join(" "),
      confidence: 0.75,
    };
  }

  return null;
}

function detectSolidPresence(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const body = document.body;
    if (!body) return false;

    const candidates = [body, ...Array.from(body.querySelectorAll("*")).slice(0, 200)];

    for (const el of candidates) {
      if (el instanceof HTMLElement && hasSolidMarker(el)) {
        const keys = Object.keys(el);
        const solidKey = keys.find((k) => k.startsWith("_$"));
        if (solidKey) return true;
      }
    }

    const scripts = document.querySelectorAll("script");
    for (const script of scripts) {
      if (
        script.textContent?.includes("solid-js") ||
        script.textContent?.includes("_$createComponent")
      ) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

export const solidScanner: FrameworkScanner = {
  id: "solid",
  priority: 60,

  isPresent(): boolean {
    if (_solidPresent !== null) return _solidPresent;
    _solidPresent = detectSolidPresence();
    return _solidPresent;
  },

  scan(element: HTMLElement): FrameworkInfo | null {
    try {
      if (!this.isPresent()) return null;

      const result = walkSolidHierarchy(element);
      if (result) return result;

      if (hasSolidMarker(element)) {
        return {
          framework: "solid",
          components: [],
          path: null,
          confidence: 0.5,
        };
      }

      return null;
    } catch {
      return null;
    }
  },
};
