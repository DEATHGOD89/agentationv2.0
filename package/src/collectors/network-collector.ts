import type { NetworkRequest, Collector, CollectorSnapshot } from "./types";

const MAX_ENTRIES = 50;

const entries: NetworkRequest[] = [];
let nextId = 1;
let active = false;
let originalFetch: typeof window.fetch | null = null;
let originalXHROpen: typeof XMLHttpRequest.prototype.open | null = null;
let originalXHRSend: typeof XMLHttpRequest.prototype.send | null = null;
let originalXHRSetRequestHeader: typeof XMLHttpRequest.prototype.setRequestHeader | null = null;

function captureFetch(): void {
  if (!window.fetch) return;
  originalFetch = window.fetch.bind(window);

  window.fetch = function interceptedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const startTime = performance.now();
    const requestId = `net-${nextId++}`;
    const method = (init?.method || "GET").toUpperCase();
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    const requestHeaders: Record<string, string> = {};
    if (init?.headers) {
      const h = init.headers as Record<string, string>;
      for (const key of Object.keys(h)) {
        requestHeaders[key] = String(h[key]);
      }
    }

    let requestBody: string | undefined;
    if (init?.body) {
      requestBody = typeof init.body === "string" ? init.body : "[non-text body]";
    }

    return originalFetch!(input, init)
      .then(async (response) => {
        const duration = performance.now() - startTime;
        let responseBody: string | undefined;
        let responseType = "unknown";

        try {
          const cloned = response.clone();
          responseType = cloned.headers.get("content-type") || "unknown";
          if (responseType.includes("json") || responseType.includes("text") || responseType.includes("html")) {
            responseBody = await cloned.text();
            if (responseBody.length > 5000) {
              responseBody = responseBody.slice(0, 5000) + "... [truncated]";
            }
          }
        } catch {
          responseBody = "[unreadable body]";
        }

        const entry: NetworkRequest = {
          id: requestId,
          method,
          url,
          status: response.status,
          statusText: response.statusText,
          requestHeaders: Object.keys(requestHeaders).length > 0 ? requestHeaders : undefined,
          responseBody,
          responseType,
          duration: Math.round(duration),
          timestamp: Date.now(),
        };

        if (response.status >= 400) {
          entry.responseHeaders = {};
          response.headers.forEach((v, k) => {
            if (entry.responseHeaders) entry.responseHeaders[k] = v;
          });
          entry.error = `HTTP ${response.status} ${response.statusText}`;
        }

        addEntry(entry);
        return response;
      })
      .catch((err: Error) => {
        const duration = performance.now() - startTime;
        addEntry({
          id: requestId,
          method,
          url,
          status: 0,
          statusText: "Network Error",
          duration: Math.round(duration),
          timestamp: Date.now(),
          error: err.message,
        });
        throw err;
      });
  };
}

function captureXHR(): void {
  if (!XMLHttpRequest.prototype.open) return;

  const xhrRecords = new WeakMap<XMLHttpRequest, {
    method: string;
    url: string;
    requestHeaders: Record<string, string>;
    requestBody?: string;
    startTime: number;
  }>();

  originalXHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function interceptedOpen(
    method: string,
    url: string | URL,
    async?: boolean,
    user?: string | null,
    password?: string | null,
  ): void {
    xhrRecords.set(this, {
      method: method.toUpperCase(),
      url: typeof url === "string" ? url : url.href,
      requestHeaders: {},
      startTime: performance.now(),
    });
    return originalXHROpen!.apply(this, arguments as unknown as [string, string, boolean?, string?, string?]);
  };

  originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function interceptedSetHeader(
    name: string,
    value: string,
  ): void {
    const record = xhrRecords.get(this);
    if (record) {
      record.requestHeaders[name] = value;
    }
    return originalXHRSetRequestHeader!.apply(this, arguments as unknown as [string, string]);
  };

  originalXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function interceptedSend(body?: Document | XMLHttpRequestBodyInit | null): void {
    const record = xhrRecords.get(this);

    if (record) {
      if (body && typeof body === "string") {
        record.requestBody = body;
      }

      this.addEventListener("loadend", () => {
        if (!record) return;
        const duration = performance.now() - record.startTime;
        let responseBody: string | undefined;

        try {
          if (this.responseType === "" || this.responseType === "text") {
            responseBody = this.responseText;
            if (responseBody && responseBody.length > 5000) {
              responseBody = responseBody.slice(0, 5000) + "... [truncated]";
            }
          }
        } catch {
          responseBody = "[unreadable body]";
        }

        const entry: NetworkRequest = {
          id: `net-${nextId++}`,
          method: record.method,
          url: record.url,
          status: this.status,
          statusText: this.statusText,
          requestHeaders: Object.keys(record.requestHeaders).length > 0 ? record.requestHeaders : undefined,
          requestBody: record.requestBody,
          responseBody,
          responseType: this.responseType || "unknown",
          duration: Math.round(duration),
          timestamp: Date.now(),
        };

        if (this.status >= 400) {
          entry.error = `HTTP ${this.status} ${this.statusText}`;
        }

        addEntry(entry);
      });
    }

    return originalXHRSend!.apply(this, arguments as unknown as [Document | XMLHttpRequestBodyInit | null]);
  };
}

function addEntry(entry: NetworkRequest): void {
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.shift();
  }
}

export const networkCollector: Collector = {
  name: "network",

  start(): void {
    if (active) return;
    active = true;
    if (typeof window === "undefined") return;
    try {
      captureFetch();
      captureXHR();
    } catch {
      // Some environments may not support patching
    }
  },

  stop(): void {
    if (!active) return;
    active = false;
    if (typeof window === "undefined") return;
    try {
      if (originalFetch) {
        window.fetch = originalFetch;
        originalFetch = null;
      }
      if (originalXHROpen) {
        XMLHttpRequest.prototype.open = originalXHROpen;
        originalXHROpen = null;
      }
      if (originalXHRSend) {
        XMLHttpRequest.prototype.send = originalXHRSend;
        originalXHRSend = null;
      }
      if (originalXHRSetRequestHeader) {
        XMLHttpRequest.prototype.setRequestHeader = originalXHRSetRequestHeader;
        originalXHRSetRequestHeader = null;
      }
    } catch {
      // ignore
    }
  },

  snapshot(): Pick<CollectorSnapshot, "network"> {
    return { network: [...entries] };
  },

  clear(): void {
    entries.length = 0;
  },
};
