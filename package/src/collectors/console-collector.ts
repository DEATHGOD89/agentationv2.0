import type { ConsoleEntry, Collector } from "./types";

const MAX_ENTRIES = 100;

const entries: ConsoleEntry[] = [];
let nextId = 1;
let active = false;
const originals: Partial<Record<"log" | "info" | "warn" | "error" | "debug", typeof console.log>> = {};

function interceptMethod(level: ConsoleEntry["level"]): void {
  const original = console[level].bind(console);
  originals[level] = original;

  (console as Record<string, unknown>)[level] = function intercepted(...args: unknown[]): void {
    const id = `console-${nextId++}`;
    const message = args.map((a) => {
      try {
        if (a instanceof Error) return `${a.message}\n${a.stack || ""}`;
        if (typeof a === "object") return JSON.stringify(a, null, 2);
        return String(a);
      } catch {
        return String(a);
      }
    }).join(" ");

    let stack: string | undefined;
    if (level === "error") {
      const err = args.find((a) => a instanceof Error) as Error | undefined;
      if (err?.stack) {
        stack = err.stack;
      } else {
        stack = new Error().stack || undefined;
      }
    }

    entries.push({
      id,
      level,
      message: message.slice(0, 2000),
      args: args.map((a) => {
        try { return typeof a === "string" ? a : JSON.stringify(a).slice(0, 500); }
        catch { return String(a).slice(0, 500); }
      }),
      timestamp: Date.now(),
      stack,
    });

    if (entries.length > MAX_ENTRIES) {
      entries.shift();
    }

    original(...args);
  };
}

export const consoleCollector: Collector = {
  name: "console",

  start(): void {
    if (active) return;
    active = true;
    if (typeof window === "undefined") return;
    try {
      interceptMethod("error");
      interceptMethod("warn");
      interceptMethod("info");
      interceptMethod("log");
      interceptMethod("debug");
    } catch {
      // ignore
    }
  },

  stop(): void {
    if (!active) return;
    active = false;
    if (typeof window === "undefined") return;
    try {
      for (const [level, original] of Object.entries(originals)) {
        if (original) {
          (console as Record<string, unknown>)[level] = original;
        }
      }
    } catch {
      // ignore
    }
  },

  snapshot() {
    return { console: [...entries] };
  },

  clear(): void {
    entries.length = 0;
  },
};
