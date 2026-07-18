import React, { useState, useEffect } from "react";
import { createRoot, Root } from "react-dom/client";
import { Agentation } from "agentation";
import type { Annotation } from "agentation";

const AGENTATION_ATTR = "data-agentation-shadow-host";

interface ExtensionConfig {
  endpoint?: string;
}

interface InitMessage {
  type: "AGENTATION_INIT";
  config: ExtensionConfig;
}

interface ToggleMessage {
  type: "AGENTATION_TOGGLE";
  enabled: boolean;
}

interface ActionMessage {
  type: "AGENTATION_ACTION";
  action: string;
}

type ExtensionMessage = InitMessage | ToggleMessage | ActionMessage;

function isExtensionMessage(data: unknown): data is ExtensionMessage {
  if (!data || typeof data !== "object") return false;
  const msg = data as Record<string, unknown>;
  return typeof msg.type === "string" && msg.type.startsWith("AGENTATION_");
}

let appRoot: Root | null = null;
let appConfig: ExtensionConfig = {};

function getShadowContainer(): HTMLElement | null {
  const host = document.querySelector(`[${AGENTATION_ATTR}]`);
  if (!host || !host.shadowRoot) return null;
  return host.shadowRoot.getElementById("agentation-root");
}

function mountApp(config: ExtensionConfig) {
  appConfig = config;
  const container = getShadowContainer();
  if (!container) return;

  if (appRoot) {
    appRoot.unmount();
  }

  appRoot = createRoot(container);
  appRoot.render(<ToolbarApp config={config} />);
}

function ToolbarApp({ config }: { config: ExtensionConfig }) {
  const [enabled, setEnabled] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (!isExtensionMessage(event.data)) return;

      switch (event.data.type) {
        case "AGENTATION_TOGGLE":
          setEnabled(event.data.enabled);
          break;
        case "AGENTATION_ACTION":
          break;
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  if (!mounted || !enabled) return null;

  return (
    <Agentation
      endpoint={config.endpoint || "http://localhost:4747"}
      onAnnotationAdd={(annotation: Annotation) => {
        window.postMessage(
          { type: "AGENTATION_ANNOTATION", action: "add", annotation },
          "*",
        );
      }}
      onAnnotationDelete={(annotation: Annotation) => {
        window.postMessage(
          { type: "AGENTATION_ANNOTATION", action: "delete", annotation },
          "*",
        );
      }}
      onAnnotationUpdate={(annotation: Annotation) => {
        window.postMessage(
          { type: "AGENTATION_ANNOTATION", action: "update", annotation },
          "*",
        );
      }}
    />
  );
}

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window) return;
  if (!isExtensionMessage(event.data)) return;
  if (event.data.type === "AGENTATION_INIT") {
    mountApp(event.data.config || {});
  }
});

if (document.querySelector(`[${AGENTATION_ATTR}]`)) {
  mountApp({});
}
