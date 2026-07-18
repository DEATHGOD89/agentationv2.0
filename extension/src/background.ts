const MCP_SERVER_URL = "http://localhost:4747";
const STORAGE_KEY = "agentation-state";

interface ExtensionState {
  enabled: boolean;
  mcpServerUrl: string;
}

const defaultState: ExtensionState = {
  enabled: true,
  mcpServerUrl: MCP_SERVER_URL,
};

function getState(): Promise<ExtensionState> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(STORAGE_KEY, (result) => {
      resolve((result[STORAGE_KEY] as ExtensionState) || defaultState);
    });
  });
}

function setState(state: ExtensionState): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [STORAGE_KEY]: state }, resolve);
  });
}

chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ) => {
    const msg = message as Record<string, unknown>;

    switch (msg.type) {
      case "GET_STATE": {
        getState().then(sendResponse);
        return true;
      }

      case "SET_STATE": {
        setState(msg.state as ExtensionState).then(() =>
          sendResponse({ success: true }),
        );
        return true;
      }

      case "CHECK_SERVER": {
        fetch(`${MCP_SERVER_URL}/health`, { signal: AbortSignal.timeout(5000) })
          .then((res) => {
            if (res.ok) return { connected: true };
            throw new Error("Server not reachable");
          })
          .then((data) => sendResponse(data))
          .catch(() => sendResponse({ connected: false }));
        return true;
      }

      case "AGENTATION_ACTION":
      case "AGENTATION_ANNOTATION": {
        chrome.tabs.query({}, (tabs) => {
          for (const tab of tabs) {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
            }
          }
        });
        sendResponse({ success: true });
        return true;
      }

      default:
        sendResponse({ error: "Unknown message type" });
        return true;
    }
  },
);

chrome.runtime.onInstalled.addListener(async () => {
  const state = await getState();
  if (!state) {
    await setState(defaultState);
  }
});

setInterval(async () => {
  try {
    await fetch(`${MCP_SERVER_URL}/health`, { signal: AbortSignal.timeout(3000) });
  } catch {
    // Server not available
  }
}, 30000);
