import { networkCollector } from "./network-collector";
import { consoleCollector } from "./console-collector";
import { stateCollector } from "./state-collector";
import type { Collector, CollectorSnapshot, NetworkRequest, ConsoleEntry, StateSnapshot } from "./types";

const collectors: Collector[] = [
  networkCollector,
  consoleCollector,
  stateCollector,
];

export function startCollectors(): void {
  for (const c of collectors) {
    try {
      c.start();
    } catch {
      // individual collector failure shouldn't block others
    }
  }
}

export function stopCollectors(): void {
  for (const c of collectors) {
    try {
      c.stop();
    } catch {
      // ignore
    }
  }
}

export function snapshotCollectors(): CollectorSnapshot {
  const result: CollectorSnapshot = {
    network: [],
    console: [],
    state: [],
  };

  for (const c of collectors) {
    try {
      const snap = c.snapshot();
      if (snap.network) result.network.push(...snap.network);
      if (snap.console) result.console.push(...snap.console);
      if (snap.state) result.state.push(...snap.state);
    } catch {
      // ignore
    }
  }

  return result;
}

export function clearCollectors(): void {
  for (const c of collectors) {
    try {
      c.clear();
    } catch {
      // ignore
    }
  }
}

export type { Collector, CollectorSnapshot, NetworkRequest, ConsoleEntry, StateSnapshot } from "./types";
