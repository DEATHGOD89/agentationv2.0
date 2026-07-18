"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type {
  DesignPlacement,
  RearrangeState,
} from "../../design-mode/types";
import {
  originalSetTimeout,
  originalRequestAnimationFrame,
} from "../../utils/freeze-animations";
import {
  loadDesignPlacements,
  saveDesignPlacements,
  clearDesignPlacements,
  loadRearrangeState,
  saveRearrangeState,
  clearRearrangeState,
  loadWireframeState,
  saveWireframeState,
  clearWireframeState,
} from "../../utils/storage";

type MovedEntry = {
  el: HTMLElement;
  origStyles: {
    transform: string;
    transformOrigin: string;
    opacity: string;
    position: string;
    zIndex: string;
    display: string;
  };
  ancestors: { el: HTMLElement; overflow: string }[];
};

type UseDesignModeProps = {
  pathname: string;
  isActive: boolean;
  mounted?: boolean;
};

export function useDesignMode({
  pathname,
  isActive,
  mounted,
}: UseDesignModeProps) {
  const [isDesignMode, setIsDesignMode] = useState(false);
  const [designOverlayExiting, setDesignOverlayExiting] = useState(false);
  const [designPlacements, setDesignPlacements] = useState<DesignPlacement[]>(
    [],
  );
  const [activeDesignComponent, setActiveDesignComponent] =
    useState<import("../../design-mode/types").ComponentType | null>(null);
  const [blankCanvas, setBlankCanvas] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);
  const [canvasOpacity, setCanvasOpacity] = useState(1);
  const [canvasPurpose, setCanvasPurpose] = useState<
    import("../../design-mode/types").CanvasPurpose
  >("new-page");
  const [wireframePurpose, setWireframePurpose] = useState("");
  const [designInteracting, setDesignInteracting] = useState(false);
  const [rearrangeState, setRearrangeState] = useState<RearrangeState | null>(
    null,
  );

  const designPlacementsLoaded = useRef(false);
  const rearrangeLoaded = useRef(false);
  const wireframeLoaded = useRef(false);
  const exploreStashRef = useRef<{
    rearrange: RearrangeState | null;
    placements: DesignPlacement[];
  }>({ rearrange: null, placements: [] });
  const wireframeStashRef = useRef<{
    rearrange: RearrangeState | null;
    placements: DesignPlacement[];
  }>({ rearrange: null, placements: [] });
  const [designDeselectSignal, setDesignDeselectSignal] = useState(0);
  const [rearrangeDeselectSignal, setRearrangeDeselectSignal] = useState(0);
  const [designClearSignal, setDesignClearSignal] = useState(0);
  const [rearrangeClearSignal, setRearrangeClearSignal] = useState(0);
  const designSelectedIdsRef = useRef<Set<string>>(new Set());
  const rearrangeSelectedIdsRef = useRef<Set<string>>(new Set());
  const designExitTimer = useRef<ReturnType<typeof originalSetTimeout>>();
  const rearrangeDebounceTimer = useRef<ReturnType<
    typeof originalSetTimeout
  >>();
  const rearrangeMovedEls = useRef<Map<string, MovedEntry>>(new Map());

  const canvasShouldBeVisible =
    isDesignMode && isActive && !designOverlayExiting && blankCanvas;

  const closeDesignMode = useCallback(() => {
    setDesignOverlayExiting(true);
    setIsDesignMode(false);
    setActiveDesignComponent(null);
    clearTimeout(designExitTimer.current);
    designExitTimer.current = originalSetTimeout(() => {
      setDesignOverlayExiting(false);
    }, 300);
  }, []);

  const deactivate = useCallback(() => {
    if (isDesignMode) {
      setDesignOverlayExiting(true);
      setIsDesignMode(false);
      setActiveDesignComponent(null);
      clearTimeout(designExitTimer.current);
      designExitTimer.current = originalSetTimeout(() => {
        setDesignOverlayExiting(false);
      }, 300);
    }
  }, [isDesignMode]);

  useEffect(() => {
    if (canvasShouldBeVisible) {
      setCanvasReady(false);
      const raf = originalRequestAnimationFrame(() => {
        setCanvasReady(true);
      });
      return () => cancelAnimationFrame(raf);
    } else {
      setCanvasReady(false);
    }
  }, [canvasShouldBeVisible]);

  useEffect(() => {
    if (mounted && !designPlacementsLoaded.current) {
      designPlacementsLoaded.current = true;
      const stored = loadDesignPlacements<DesignPlacement>(pathname);
      if (stored.length > 0) setDesignPlacements(stored);
    }
  }, [mounted, pathname]);

  useEffect(() => {
    if (mounted && designPlacementsLoaded.current && !blankCanvas) {
      if (designPlacements.length > 0) {
        saveDesignPlacements(pathname, designPlacements);
      } else {
        clearDesignPlacements(pathname);
      }
    }
  }, [designPlacements, pathname, mounted, blankCanvas]);

  useEffect(() => {
    if (mounted && !rearrangeLoaded.current) {
      rearrangeLoaded.current = true;
      const stored = loadRearrangeState<RearrangeState>(pathname);
      if (stored) {
        const migrated = {
          ...stored,
          sections: stored.sections.map((s) => ({
            ...s,
            currentRect:
              s.currentRect ?? { ...(s as any).originalRect },
          })),
        };
        setRearrangeState(migrated);
      }
    }
  }, [mounted, pathname]);

  useEffect(() => {
    if (mounted && rearrangeLoaded.current && !blankCanvas) {
      if (rearrangeState) {
        saveRearrangeState(pathname, rearrangeState);
      } else {
        clearRearrangeState(pathname);
      }
    }
  }, [rearrangeState, pathname, mounted, blankCanvas]);

  useEffect(() => {
    if (mounted && !wireframeLoaded.current) {
      wireframeLoaded.current = true;
      const stored = loadWireframeState(pathname);
      if (stored) {
        wireframeStashRef.current = {
          rearrange: stored.rearrange as RearrangeState | null,
          placements: (stored.placements || []) as DesignPlacement[],
        };
        if (stored.purpose) setWireframePurpose(stored.purpose);
      }
    }
  }, [mounted, pathname]);

  useEffect(() => {
    if (!mounted || !wireframeLoaded.current) return;
    const stash = wireframeStashRef.current;
    if (blankCanvas) {
      const hasContent =
        (rearrangeState?.sections?.length ?? 0) > 0 ||
        designPlacements.length > 0 ||
        !!wireframePurpose;
      if (hasContent) {
        saveWireframeState(pathname, {
          rearrange: rearrangeState,
          placements: designPlacements,
          purpose: wireframePurpose,
        });
      } else {
        clearWireframeState(pathname);
      }
    } else {
      const hasContent =
        (stash.rearrange?.sections?.length ?? 0) > 0 ||
        stash.placements.length > 0 ||
        !!wireframePurpose;
      if (hasContent) {
        saveWireframeState(pathname, {
          rearrange: stash.rearrange,
          placements: stash.placements,
          purpose: wireframePurpose,
        });
      } else {
        clearWireframeState(pathname);
      }
    }
  }, [
    rearrangeState,
    designPlacements,
    wireframePurpose,
    blankCanvas,
    pathname,
    mounted,
  ]);

  useEffect(() => {
    if (isDesignMode && !rearrangeState) {
      setRearrangeState({
        sections: [],
        originalOrder: [],
        detectedAt: Date.now(),
      });
    }
  }, [isDesignMode, rearrangeState]);

  useEffect(() => {
    return () => {
      for (const [, entry] of rearrangeMovedEls.current) {
        const { el, origStyles, ancestors } = entry;
        el.style.transition =
          "transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.4s cubic-bezier(0.22, 1, 0.36, 1)";
        el.style.transform = origStyles.transform;
        el.style.transformOrigin = origStyles.transformOrigin;
        el.style.opacity = origStyles.opacity;
        el.style.position = origStyles.position;
        el.style.zIndex = origStyles.zIndex;
        originalSetTimeout(() => {
          el.style.transition = "";
          el.style.display = origStyles.display;
          for (const a of ancestors) {
            a.el.style.overflow = a.overflow;
          }
        }, 450);
      }
      rearrangeMovedEls.current.clear();
    };
  }, []);

  return {
    isDesignMode,
    setIsDesignMode,
    designOverlayExiting,
    setDesignOverlayExiting,
    designPlacements,
    setDesignPlacements,
    activeDesignComponent,
    setActiveDesignComponent,
    blankCanvas,
    setBlankCanvas,
    canvasReady,
    setCanvasReady,
    canvasOpacity,
    setCanvasOpacity,
    canvasPurpose,
    setCanvasPurpose,
    wireframePurpose,
    setWireframePurpose,
    designInteracting,
    setDesignInteracting,
    rearrangeState,
    setRearrangeState,
    exploreStashRef,
    wireframeStashRef,
    designDeselectSignal,
    setDesignDeselectSignal,
    rearrangeDeselectSignal,
    setRearrangeDeselectSignal,
    designClearSignal,
    setDesignClearSignal,
    rearrangeClearSignal,
    setRearrangeClearSignal,
    designSelectedIdsRef,
    rearrangeSelectedIdsRef,
    designExitTimer,
    closeDesignMode,
    deactivate,
    rearrangeMovedEls,
  };
}
