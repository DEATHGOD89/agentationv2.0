const AGENTATION_ATTR = "data-agentation-shadow-host";
const TOOLBAR_BUNDLE = "dist/toolbar-bundle.js";

let toolbarInjected = false;

function injectToolbar() {
  if (toolbarInjected) return;
  if (document.querySelector(`[${AGENTATION_ATTR}]`)) return;

  toolbarInjected = true;

  const host = document.createElement("div");
  host.setAttribute(AGENTATION_ATTR, "");
  const shadowRoot = host.attachShadow({ mode: "open" });

  const rootContainer = document.createElement("div");
  rootContainer.id = "agentation-root";
  shadowRoot.appendChild(rootContainer);

  document.documentElement.appendChild(host);

  const script = document.createElement("script");
  script.src = chrome.runtime.getURL(TOOLBAR_BUNDLE);
  script.onload = () => {
    script.remove();

    chrome.storage.sync.get(["endpoint"], (result) => {
      window.postMessage(
        {
          type: "AGENTATION_INIT",
          config: {
            endpoint: result.endpoint || "http://localhost:4747",
          },
        },
        "*"
      );
    });
  };
  document.documentElement.appendChild(script);
}

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (typeof data.type !== "string") return;
  if (!data.type.startsWith("AGENTATION_")) return;

  if (data.type === "AGENTATION_ACTION" || data.type === "AGENTATION_ANNOTATION") {
    chrome.runtime.sendMessage({
      type: data.type,
      action: data.action,
      annotation: data.annotation,
    }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => {
    const msg = message as Record<string, unknown>;
    if (!msg || typeof msg !== "object") return;

    switch (msg.type) {
      case "AGENTATION_TOGGLE":
        window.postMessage(
          { type: "AGENTATION_TOGGLE", enabled: msg.enabled },
          "*",
        );
        sendResponse({ success: true });
        break;

      case "AGENTATION_ACTION":
        window.postMessage(
          { type: "AGENTATION_ACTION", action: msg.action },
          "*",
        );
        sendResponse({ success: true });
        break;
    }
  },
);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectToolbar, { once: true });
} else {
  injectToolbar();
}
