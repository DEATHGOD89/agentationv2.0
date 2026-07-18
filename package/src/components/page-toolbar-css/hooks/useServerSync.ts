"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  originalSetTimeout,
  originalSetInterval,
} from "../../utils/freeze-animations";
import { createSession, getSession } from "../../utils/sync";
import {
  loadSessionId,
  saveSessionId,
} from "../../utils/storage";

type UseServerSyncProps = {
  initialSessionId?: string;
  endpoint?: string;
  onSessionCreated?: (sessionId: string) => void;
  webhookUrl?: string;
  showTooltipsAgain: () => void;
  settings?: { webhookUrl?: string; webhooksEnabled?: boolean };
  mounted?: boolean;
  pathname?: string;
};

export function useServerSync({
  initialSessionId,
  endpoint,
  onSessionCreated,
  webhookUrl,
  showTooltipsAgain,
  settings,
  mounted,
  pathname,
}: UseServerSyncProps) {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(
    initialSessionId || null,
  );
  const [connectionStatus, setConnectionStatus] = useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");
  const [tooltipSessionActive, setTooltipSessionActive] = useState(false);
  const tooltipSessionTimerRef = useRef<ReturnType<
    typeof originalSetTimeout
  > | null>(null);
  const sessionInitializedRef = useRef(false);
  const prevConnectionStatusRef = useRef<typeof connectionStatus | null>(null);

  useEffect(() => {
    prevConnectionStatusRef.current = connectionStatus;
  }, [connectionStatus]);

  const handleControlsMouseEnter = useCallback(() => {
    if (!tooltipSessionActive) {
      tooltipSessionTimerRef.current = originalSetTimeout(
        () => setTooltipSessionActive(true),
        850,
      );
    }
  }, [tooltipSessionActive]);

  const handleControlsMouseLeave = useCallback(() => {
    if (tooltipSessionTimerRef.current) {
      clearTimeout(tooltipSessionTimerRef.current);
      tooltipSessionTimerRef.current = null;
    }
    setTooltipSessionActive(false);
    showTooltipsAgain();
  }, [showTooltipsAgain]);

  const fireWebhook = useCallback(
    async (
      event: string,
      payload: Record<string, unknown>,
      force?: boolean,
    ): Promise<boolean> => {
      const targetUrl = settings?.webhookUrl || webhookUrl;
      if (!targetUrl || (!settings?.webhooksEnabled && !force)) return false;

      try {
        const response = await fetch(targetUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event,
            timestamp: Date.now(),
            url:
              typeof window !== "undefined" ? window.location.href : undefined,
            ...payload,
          }),
        });
        return response.ok;
      } catch (error) {
        console.warn("[Agentation] Webhook failed:", error);
        return false;
      }
    },
    [webhookUrl, settings?.webhookUrl, settings?.webhooksEnabled],
  );

  useEffect(() => {
    if (!endpoint || !mounted) return;
    const initSession = async () => {
      try {
        setConnectionStatus("connecting");
        let sessionId = currentSessionId;
        if (!sessionId) {
          const existingId = pathname ? loadSessionId(pathname) : null;
          if (existingId) {
            try {
              const session = await getSession(endpoint, existingId);
              sessionId = session.id;
            } catch {
              sessionId = null;
            }
          }
        }
        if (!sessionId) {
          const session = await createSession(
            endpoint,
            typeof window !== "undefined" ? window.location.href : "",
          );
          sessionId = session.id;
          setCurrentSessionId(sessionId);
          if (pathname) saveSessionId(pathname, sessionId);
          onSessionCreated?.(sessionId);
        } else {
          setCurrentSessionId(sessionId);
        }
        sessionInitializedRef.current = true;
        setConnectionStatus("connected");
      } catch (error) {
        console.warn("[Agentation] Failed to initialize session:", error);
        setConnectionStatus("disconnected");
      }
    };
    initSession();
  }, [endpoint, mounted, currentSessionId, pathname, onSessionCreated]);

  useEffect(() => {
    if (!endpoint || !mounted) return;

    const checkHealth = async () => {
      try {
        const response = await fetch(`${endpoint}/health`);
        if (response.ok) {
          setConnectionStatus("connected");
        } else {
          setConnectionStatus("disconnected");
        }
      } catch {
        setConnectionStatus("disconnected");
      }
    };

    checkHealth();
    const interval = originalSetInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, [endpoint, mounted]);

  useEffect(() => {
    return () => {
      if (tooltipSessionTimerRef.current)
        clearTimeout(tooltipSessionTimerRef.current);
    };
  }, []);

  return {
    currentSessionId,
    setCurrentSessionId,
    connectionStatus,
    setConnectionStatus,
    tooltipSessionActive,
    setTooltipSessionActive,
    handleControlsMouseEnter,
    handleControlsMouseLeave,
    fireWebhook,
    sessionInitializedRef,
    prevConnectionStatusRef,
  };
}
