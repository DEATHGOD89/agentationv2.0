export type NetworkRequest = {
  id: string;
  method: string;
  url: string;
  status: number;
  statusText: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
  responseType?: string;
  duration: number;
  timestamp: number;
  error?: string;
};

export type ConsoleEntry = {
  id: string;
  level: "log" | "info" | "warn" | "error" | "debug";
  message: string;
  args?: string[];
  timestamp: number;
  stack?: string;
};

export type StateSnapshot = {
  storeType: "redux" | "zustand" | "vuex" | "pinia" | "unknown";
  storeName?: string;
  state: Record<string, unknown>;
  timestamp: number;
};

export type CollectorSnapshot = {
  network: NetworkRequest[];
  console: ConsoleEntry[];
  state: StateSnapshot[];
};

export interface Collector {
  name: string;
  start(): void;
  stop(): void;
  snapshot(): CollectorSnapshot;
  clear(): void;
}
