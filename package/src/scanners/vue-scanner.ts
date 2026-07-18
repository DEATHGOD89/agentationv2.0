import type { FrameworkScanner, FrameworkInfo } from "./types";

interface VueVNode {
  type?: { name?: string; __name?: string; displayName?: string };
  component?: VueComponent;
  parent?: VueVNode | null;
}

interface VueComponent {
  type?: { name?: string; __name?: string; displayName?: string };
  parent?: VueComponent | null;
  $options?: { name?: string; __name?: string; _componentTag?: string };
  $parent?: VueComponent | null;
}

let _vuePresent: boolean | null = null;

function detectVueVersion(): string | undefined {
  if (typeof document === "undefined") return undefined;
  try {
    const appEl = document.querySelector("[data-v-app]");
    if (appEl) return "3";
    const root = document.getElementById("app") || document.getElementById("root");
    if (root && "__vue_app__" in root) return "3";
    if (root && "__vue__" in root) return "2";
    return undefined;
  } catch {
    return undefined;
  }
}

function hasVue3InElement(element: HTMLElement): boolean {
  const keys = Object.keys(element);
  return keys.some(
    (k) =>
      k.startsWith("__vueParentComponent") ||
      k.startsWith("__vue_app__"),
  );
}

function hasVue2InElement(element: HTMLElement): boolean {
  const keys = Object.keys(element);
  return keys.some(
    (k) => k.startsWith("__vue__") || k === "_uid",
  );
}

function getComponentNameVue3(vnode: VueVNode): string | null {
  if (!vnode.type) return null;
  const t = vnode.type;
  if (t.displayName) return t.displayName;
  if (t.name) return t.name;
  if (t.__name) return t.__name;
  return null;
}

function getComponentNameVue2(vm: VueComponent): string | null {
  if (!vm) return null;
  if (vm.$options?.name) return vm.$options.name;
  if (vm.$options?._componentTag) return vm.$options._componentTag;
  if (vm.type?.name) return vm.type.name;
  if (vm.type?.__name) return vm.type.__name;
  return null;
}

function getComponentNameVue3FromComponent(comp: VueComponent): string | null {
  if (!comp.type) return null;
  const t = comp.type;
  if (t.displayName) return t.displayName;
  if (t.name) return t.name;
  if (t.__name) return t.__name;
  return null;
}

function walkVue3Hierarchy(element: HTMLElement): FrameworkInfo | null {
  const vueKey = Object.keys(element).find((k) =>
    k.startsWith("__vueParentComponent"),
  );
  if (!vueKey) return null;

  const initialVNode = (element as unknown as Record<string, unknown>)[
    vueKey
  ] as VueVNode | null;
  if (!initialVNode) return null;

  const components: string[] = [];
  let current: VueVNode | null | undefined = initialVNode;

  const seen = new Set<unknown>();
  let maxDepth = 30;

  while (current && components.length < 6 && maxDepth > 0) {
    maxDepth--;

    if (current.component) {
      const name = getComponentNameVue3FromComponent(current.component);
      if (name && !seen.has(name)) {
        seen.add(name);
        components.push(name);
      }
      current = current.component?.parent ? { component: current.component.parent } : null;
      continue;
    }

    const name = getComponentNameVue3(current);
    if (name && !seen.has(name)) {
      seen.add(name);
      components.push(name);
    }

    current = current.parent;
  }

  if (components.length === 0) return null;

  return {
    framework: "vue",
    components: components.slice().reverse(),
    path: components
      .slice()
      .reverse()
      .map((c) => `<${c}>`)
      .join(" "),
    version: "3",
    confidence: 0.9,
  };
}

function walkVue2Hierarchy(element: HTMLElement): FrameworkInfo | null {
  const vueKey = Object.keys(element).find((k) => k.startsWith("__vue__"));
  if (!vueKey) return null;

  const vm = (element as unknown as Record<string, unknown>)[
    vueKey
  ] as VueComponent | null;
  if (!vm) return null;

  const components: string[] = [];
  let current: VueComponent | null = vm;
  const seen = new Set<unknown>();
  let maxDepth = 30;

  while (current && components.length < 6 && maxDepth > 0) {
    maxDepth--;
    const name = getComponentNameVue2(current);
    if (name && !seen.has(name)) {
      seen.add(name);
      components.push(name);
    }
    current = current.$parent || null;
  }

  if (components.length === 0) return null;

  return {
    framework: "vue",
    components: components.slice().reverse(),
    path: components
      .slice()
      .reverse()
      .map((c) => `<${c}>`)
      .join(" "),
    version: "2",
    confidence: 0.85,
  };
}

export const vueScanner: FrameworkScanner = {
  id: "vue",
  priority: 90,

  isPresent(): boolean {
    if (_vuePresent !== null) return _vuePresent;
    if (typeof document === "undefined") {
      _vuePresent = false;
      return false;
    }
    try {
      const version = detectVueVersion();
      if (version) {
        _vuePresent = true;
        return true;
      }

      const body = document.body;
      if (body) {
        const checkEls = [body, ...Array.from(body.children).slice(0, 20)];
        for (const el of checkEls) {
          if (el instanceof HTMLElement) {
            if (hasVue3InElement(el) || hasVue2InElement(el)) {
              _vuePresent = true;
              return true;
            }
          }
        }
      }

      _vuePresent = false;
      return false;
    } catch {
      _vuePresent = false;
      return false;
    }
  },

  scan(element: HTMLElement): FrameworkInfo | null {
    try {
      if (!this.isPresent()) return null;

      if (hasVue3InElement(element)) {
        const result = walkVue3Hierarchy(element);
        if (result) return result;
      }

      if (hasVue2InElement(element)) {
        const result = walkVue2Hierarchy(element);
        if (result) return result;
      }

      return null;
    } catch {
      return null;
    }
  },
};
