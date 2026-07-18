import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";

interface ExtensionState {
  enabled: boolean;
  mcpServerUrl: string;
}

function Popup() {
  const [state, setState] = useState<ExtensionState | null>(null);
  const [serverConnected, setServerConnected] = useState<boolean | null>(null);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_STATE" }, (response) => {
      if (response) setState(response as ExtensionState);
    });
  }, []);

  useEffect(() => {
    const check = () => {
      chrome.runtime.sendMessage(
        { type: "CHECK_SERVER" },
        (response) => {
          const r = response as { connected: boolean } | undefined;
          setServerConnected(r?.connected ?? false);
        },
      );
    };
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, []);

  const getCurrentTab = (): Promise<chrome.tabs.Tab | undefined> => {
    return new Promise((resolve) => {
      chrome.tabs.query(
        { active: true, currentWindow: true },
        (tabs) => resolve(tabs[0]),
      );
    });
  };

  const toggleEnabled = async () => {
    if (!state) return;
    const newState = { ...state, enabled: !state.enabled };
    chrome.runtime.sendMessage(
      { type: "SET_STATE", state: newState },
      () => {
        setState(newState);
        getCurrentTab().then((tab) => {
          if (tab?.id) {
            chrome.tabs
              .sendMessage(tab.id, {
                type: "AGENTATION_TOGGLE",
                enabled: newState.enabled,
              })
              .catch(() => {});
          }
        });
      },
    );
  };

  const sendAction = (action: string) => {
    getCurrentTab().then((tab) => {
      if (tab?.id) {
        chrome.tabs
          .sendMessage(tab.id, { type: "AGENTATION_ACTION", action })
          .catch(() => {});
      }
    });
  };

  const statusColor =
    serverConnected === null
      ? "#FFCC00"
      : serverConnected
        ? "#34C759"
        : "#FF383C";

  const statusText =
    serverConnected === null
      ? "Checking..."
      : serverConnected
        ? "Connected"
        : "Disconnected";

  return (
    <div
      style={{
        width: 280,
        padding: 16,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: "#e0e0e0",
        background: "#1a1a2e",
      }}
    >
      <h1
        style={{
          fontSize: 16,
          margin: "0 0 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: state?.enabled ? "#34C759" : "#666",
            display: "inline-block",
          }}
        />
        Agentation
      </h1>

      <div
        style={{
          background: "#16213e",
          borderRadius: 8,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: 13 }}>Toolbar</span>
          <button
            onClick={toggleEnabled}
            style={{
              padding: "4px 12px",
              borderRadius: 4,
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              background: state?.enabled ? "#FF383C" : "#34C759",
              color: "#fff",
            }}
          >
            {state?.enabled ? "Disable" : "Enable"}
          </button>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "#999",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: statusColor,
              display: "inline-block",
            }}
          />
          MCP Server: {statusText}
        </div>
      </div>

      <div
        style={{
          background: "#16213e",
          borderRadius: 8,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
          Quick Actions
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <button
            onClick={() => sendAction("clearAnnotations")}
            style={{
              padding: "6px 12px",
              borderRadius: 4,
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              background: "#0f3460",
              color: "#e0e0e0",
              textAlign: "left",
            }}
          >
            Clear Annotations
          </button>
          <button
            onClick={() => sendAction("exportMarkdown")}
            style={{
              padding: "6px 12px",
              borderRadius: 4,
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              background: "#0f3460",
              color: "#e0e0e0",
              textAlign: "left",
            }}
          >
            Export to Markdown
          </button>
        </div>
      </div>

      <a
        href="https://agentation.dev"
        target="_blank"
        style={{
          fontSize: 11,
          color: "#0088FF",
          textDecoration: "none",
        }}
      >
        Settings &rarr;
      </a>
    </div>
  );
}

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(<Popup />);
}
