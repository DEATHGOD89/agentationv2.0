"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Annotation, OutputDetailLevel } from "../../types";
import {
  identifyElement,
  getNearbyText,
  getElementClasses,
  getDetailedComputedStyles,
  getForensicComputedStyles,
  getFullElementPath,
  getAccessibilityInfo,
  getNearbyElements,
  closestCrossingShadow,
} from "../../utils/element-identification";
import {
  loadAnnotations,
  saveAnnotations,
  getStorageKey,
  saveAnnotationsWithSyncMarker,
  clearWireframeState,
  loadToolbarHidden,
  saveToolbarHidden,
} from "../../utils/storage";
import {
  syncAnnotation,
  updateAnnotation as updateAnnotationOnServer,
  deleteAnnotation as deleteAnnotationFromServer,
} from "../../utils/sync";
import {
  freeze as freezeAll,
  unfreeze as unfreezeAll,
  originalSetTimeout,
} from "../../utils/freeze-animations";
import {
  generateOutput,
} from "../../utils/generate-output";
import {
  generateDesignOutput,
  generateRearrangeOutput,
} from "../../design-mode/output";
import type {
  DesignPlacement,
  RearrangeState,
  CanvasPurpose,
  ComponentType,
} from "../../design-mode/types";
import { snapshotCollectors } from "../../collectors";
import {
  getSourceLocation,
  findNearestComponentSource,
  formatSourceLocation,
} from "../../utils/source-location";

function deepElementFromPoint(x: number, y: number): HTMLElement | null {
  let element = document.elementFromPoint(x, y) as HTMLElement | null;
  if (!element) return null;
  while (element?.shadowRoot) {
    const deeper = element.shadowRoot.elementFromPoint(x, y) as HTMLElement | null;
    if (!deeper || deeper === element) break;
    element = deeper;
  }
  return element;
}

function isElementFixed(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    if (style.position === "fixed" || style.position === "sticky") return true;
    current = current.parentElement;
  }
  return false;
}

function isRenderableAnnotation(annotation: Annotation): boolean {
  return annotation.status !== "resolved" && annotation.status !== "dismissed";
}

function detectSourceFile(element: Element): string | undefined {
  const result = getSourceLocation(element as HTMLElement);
  const loc = result.found
    ? result
    : findNearestComponentSource(element as HTMLElement);
  if (loc.found && loc.source) {
    return formatSourceLocation(loc.source, "path");
  }
  return undefined;
}

const isValidUrl = (url: string): boolean => {
  if (!url || !url.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

type MarkerClickBehavior = "edit" | "delete";

type ToolbarSettings = {
  outputDetail: OutputDetailLevel;
  autoClearAfterCopy: boolean;
  annotationColorId: string;
  blockInteractions: boolean;
  reactEnabled: boolean;
  markerClickBehavior: MarkerClickBehavior;
  webhookUrl: string;
  webhooksEnabled: boolean;
};

const DEFAULT_SETTINGS: ToolbarSettings = {
  outputDetail: "standard",
  autoClearAfterCopy: false,
  annotationColorId: "blue",
  blockInteractions: true,
  reactEnabled: true,
  markerClickBehavior: "edit",
  webhookUrl: "",
  webhooksEnabled: true,
};

const COLOR_OPTIONS = [
  { id: "indigo", label: "Indigo", srgb: "#6155F5", p3: "color(display-p3 0.38 0.33 0.96)" },
  { id: "blue", label: "Blue", srgb: "#0088FF", p3: "color(display-p3 0.00 0.53 1.00)" },
  { id: "cyan", label: "Cyan", srgb: "#00C3D0", p3: "color(display-p3 0.00 0.76 0.82)" },
  { id: "green", label: "Green", srgb: "#34C759", p3: "color(display-p3 0.20 0.78 0.35)" },
  { id: "yellow", label: "Yellow", srgb: "#FFCC00", p3: "color(display-p3 1.00 0.80 0.00)" },
  { id: "orange", label: "Orange", srgb: "#FF8D28", p3: "color(display-p3 1.00 0.55 0.16)" },
  { id: "red", label: "Red", srgb: "#FF383C", p3: "color(display-p3 1.00 0.22 0.24)" },
];

type HoverInfo = {
  element: string;
  elementName: string;
  elementPath: string;
  rect: DOMRect | null;
  reactComponents?: string | null;
};

type UseAnnotationsProps = {
  pathname: string;
  isActive: boolean;
  isDesignMode: boolean;
  designPlacements: DesignPlacement[];
  setDesignPlacements: (v: DesignPlacement[] | ((prev: DesignPlacement[]) => DesignPlacement[])) => void;
  rearrangeState: RearrangeState | null;
  setRearrangeState: (v: RearrangeState | null | ((prev: RearrangeState | null) => RearrangeState | null)) => void;
  blankCanvas: boolean;
  setBlankCanvas: (v: boolean) => void;
  isDrawMode: boolean;
  setIsDrawMode: (v: boolean) => void;
  activeDesignComponent: ComponentType | null;
  setActiveDesignComponent: (v: ComponentType | null) => void;
  isFrozen: boolean;
  setIsFrozen: (v: boolean) => void;
  wireframePurpose: string;
  setWireframePurpose: (v: string) => void;
  closeDesignMode: () => void;
  deactivate: () => void;
  effectiveReactMode: string;
  showTooltipsAgain: () => void;
  endpoint?: string;
  currentSessionId?: string | null;
  webhookUrl?: string;
  fireWebhook: (event: string, payload: Record<string, unknown>, force?: boolean) => Promise<boolean>;
  onAnnotationAdd?: (annotation: Annotation) => void;
  onAnnotationDelete?: (annotation: Annotation) => void;
  onAnnotationUpdate?: (annotation: Annotation) => void;
  onAnnotationsClear?: (annotations: Annotation[]) => void;
  onCopy?: (markdown: string) => void;
  onSubmit?: (output: string, annotations: Annotation[]) => void;
  copyToClipboard?: boolean;
  portalWrapperRef: React.RefObject<HTMLDivElement | null>;
  canvasPurpose: CanvasPurpose;
  setIsActive: (v: boolean) => void;
  isDarkMode: boolean;
  designOverlayExiting: boolean;
  designDeselectSignal: number;
  setDesignDeselectSignal: (v: number | ((n: number) => number)) => void;
  rearrangeDeselectSignal: number;
  setRearrangeDeselectSignal: (v: number | ((n: number) => number)) => void;
  designClearSignal: number;
  setDesignClearSignal: (v: number | ((n: number) => number)) => void;
  rearrangeClearSignal: number;
  setRearrangeClearSignal: (v: number | ((n: number) => number)) => void;
  designSelectedIdsRef: React.MutableRefObject<Set<string>>;
  rearrangeSelectedIdsRef: React.MutableRefObject<Set<string>>;
  wireframeStashRef: React.MutableRefObject<{ rearrange: RearrangeState | null; placements: DesignPlacement[] }>;
  drawStrokes: any[];
  setDrawStrokes: (v: any[] | ((prev: any[]) => any[])) => void;
  drawCanvasRef: React.RefObject<HTMLCanvasElement | null>;
};

export function useAnnotations({
  pathname,
  isActive,
  isDesignMode,
  designPlacements,
  setDesignPlacements,
  rearrangeState,
  setRearrangeState,
  blankCanvas,
  setBlankCanvas,
  isDrawMode,
  setIsDrawMode,
  activeDesignComponent,
  setActiveDesignComponent,
  isFrozen,
  setIsFrozen,
  wireframePurpose,
  setWireframePurpose,
  closeDesignMode,
  deactivate,
  effectiveReactMode,
  showTooltipsAgain,
  endpoint,
  currentSessionId,
  webhookUrl,
  fireWebhook,
  onAnnotationAdd,
  onAnnotationDelete,
  onAnnotationUpdate,
  onAnnotationsClear,
  onCopy,
  onSubmit,
  copyToClipboard = true,
  portalWrapperRef,
  canvasPurpose,
  setIsActive,
  isDarkMode,
  designOverlayExiting,
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
  wireframeStashRef,
  drawStrokes,
  setDrawStrokes,
  drawCanvasRef,
}: UseAnnotationsProps) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [pendingAnnotation, setPendingAnnotation] = useState<any>(null);
  const [editingAnnotation, setEditingAnnotation] =
    useState<Annotation | null>(null);
  const [deletingMarkerId, setDeletingMarkerId] = useState<string | null>(null);
  const [renumberFrom, setRenumberFrom] = useState<number | null>(null);
  const [showMarkers, setShowMarkers] = useState(true);
  const [markersVisible, setMarkersVisible] = useState(false);
  const [markersExiting, setMarkersExiting] = useState(false);
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);
  const placementAnnotationMap = useRef(new Map<string, string>());
  const rearrangeAnnotationMap = useRef(new Map<string, string>());
  const [settings, setSettings] = useState<ToolbarSettings>(() => {
    if (typeof localStorage === "undefined") return DEFAULT_SETTINGS;
    try {
      const saved = JSON.parse(
        localStorage.getItem("feedback-toolbar-settings") ?? "",
      );
      return {
        ...DEFAULT_SETTINGS,
        ...saved,
        annotationColorId: COLOR_OPTIONS.find(
          (c) => c.id === saved.annotationColorId,
        )
          ? saved.annotationColorId
          : DEFAULT_SETTINGS.annotationColorId,
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  const [animatedMarkers, setAnimatedMarkers] = useState<Set<string>>(
    new Set(),
  );
  const [exitingMarkers, setExitingMarkers] = useState<Set<string>>(new Set());
  const popupRef = useRef<AnnotationPopupCSSHandle>(null);
  const editPopupRef = useRef<AnnotationPopupCSSHandle>(null);

  const shouldShowMarkers = isActive && showMarkers && !isDesignMode;

  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });
  const [copied, setCopied] = useState(false);
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [cleared, setCleared] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [hoveredTargetElement, setHoveredTargetElement] =
    useState<HTMLElement | null>(null);
  const [hoveredTargetElements, setHoveredTargetElements] = useState<
    HTMLElement[]
  >([]);
  const [editingTargetElement, setEditingTargetElement] =
    useState<HTMLElement | null>(null);
  const [editingTargetElements, setEditingTargetElements] = useState<
    HTMLElement[]
  >([]);
  const [scrollY, setScrollY] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const [pendingExiting, setPendingExiting] = useState(false);
  const [editExiting, setEditExiting] = useState(false);
  const [pendingMultiSelectElements, setPendingMultiSelectElements] = useState<
    Array<{
      element: HTMLElement;
      rect: DOMRect;
      name: string;
      path: string;
      reactComponents?: string;
    }>
  >([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSettingsVisible, setShowSettingsVisible] = useState(false);
  const [settingsPage, setSettingsPage] = useState<"main" | "automations">("main");
  const [tooltipsHidden, setTooltipsHidden] = useState(false);
  const [mounted, setMounted] = useState(false);

  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragRectRef = useRef<HTMLDivElement | null>(null);
  const highlightsContainerRef = useRef<HTMLDivElement | null>(null);
  const justFinishedDragRef = useRef(false);
  const lastElementUpdateRef = useRef(0);
  const recentlyAddedIdRef = useRef<string | null>(null);
  const DRAG_THRESHOLD = 8;
  const ELEMENT_UPDATE_THROTTLE = 50;
  const scrollTimeoutRef = useRef<ReturnType<typeof originalSetTimeout> | null>(null);
  const crossDragStartRef = useRef<Map<string, { x: number; y: number }> | null>(null);
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<Array<{ x: number; y: number }>>([]);
  const exitingStrokeIdRef = useRef<string | null>(null);
  const dimAmountRef = useRef(0);
  const visualHighlightRef = useRef<number | null>(null);
  const exitingAlphaRef = useRef(1);
  const modifiersHeldRef = useRef({ cmd: false, shift: false });
  const justFinishedToolbarDragRef = useRef(false);
  const [toolbarPosition, setToolbarPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingToolbar, setIsDraggingToolbar] = useState(false);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number; toolbarX: number; toolbarY: number } | null>(null);
  const [hoveredDrawingIdx, setHoveredDrawingIdx] = useState<number | null>(null);
  const [showEntranceAnimation, setShowEntranceAnimation] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const hideTooltipsUntilMouseLeave = () => {
    setTooltipsHidden(true);
  };

  const freezeAnimations = useCallback(() => {
    if (isFrozen) return;
    freezeAll();
    setIsFrozen(true);
  }, [isFrozen, setIsFrozen]);

  const unfreezeAnimations = useCallback(() => {
    if (!isFrozen) return;
    unfreezeAll();
    setIsFrozen(false);
  }, [isFrozen, setIsFrozen]);

  const toggleFreeze = useCallback(() => {
    if (isFrozen) {
      unfreezeAnimations();
    } else {
      freezeAnimations();
    }
  }, [isFrozen, freezeAnimations, unfreezeAnimations]);

  const [isToolbarHidden, setIsToolbarHidden] = useState(() => loadToolbarHidden());
  const [isToolbarHiding, setIsToolbarHiding] = useState(false);

  const hideToolbarTemporarily = useCallback(() => {
    if (isToolbarHiding) return;
    setIsToolbarHiding(true);
    setShowSettings(false);
    setIsActive(false);
    originalSetTimeout(() => {
      saveToolbarHidden(true);
      setIsToolbarHidden(true);
      setIsToolbarHiding(false);
    }, 400);
  }, [isToolbarHiding]);

  const hasAnnotations = annotations.length > 0;
  const visibleAnnotations = annotations.filter(isRenderableAnnotation);
  const hasVisibleAnnotations = visibleAnnotations.length > 0;
  const exitingAnnotationsList = annotations.filter(
    (a) => !isRenderableAnnotation(a),
  );

  const getTooltipPosition = useCallback(
    (annotation: Annotation): { x: number; y: number; align: "left" | "right" } => {
      const isFixed = annotation.isFixed;
      const scrollOffset = isFixed ? 0 : scrollY;
      const yPos = annotation.y - scrollOffset;

      let xPos = (annotation.x / 100) * window.innerWidth;
      let align: "left" | "right" = "left";

      if (xPos > window.innerWidth * 0.5) {
        xPos = window.innerWidth - xPos;
        align = "right";
      }

      return { x: xPos, y: yPos, align };
    },
    [scrollY],
  );

  // Save settings
  useEffect(() => {
    if (mounted) {
      localStorage.setItem(
        "feedback-toolbar-settings",
        JSON.stringify(settings),
      );
    }
  }, [settings, mounted]);

  // Save annotations
  useEffect(() => {
    if (!mounted) return;
    if (endpoint && currentSessionId) {
      saveAnnotationsWithSyncMarker(pathname, annotations, currentSessionId);
    } else {
      saveAnnotations(pathname, annotations);
    }
  }, [annotations, pathname, mounted, endpoint, currentSessionId]);

  // Load annotations on mount
  useEffect(() => {
    if (mounted) {
      const stored = loadAnnotations(pathname);
      if (stored.length > 0) {
        setAnnotations(stored as Annotation[]);
      }
    }
  }, [mounted, pathname]);

  // Markers visibility
  useEffect(() => {
    if (!mounted) return;
    if (shouldShowMarkers && hasVisibleAnnotations) {
      setMarkersVisible(true);
    } else if (markersVisible) {
      setMarkersExiting(true);
      originalSetTimeout(() => {
        setMarkersVisible(false);
        setMarkersExiting(false);
      }, 150);
    }
  }, [shouldShowMarkers, hasVisibleAnnotations, mounted, markersVisible]);

  // Sync placement shadow annotations to server
  useEffect(() => {
    if (!endpoint || !currentSessionId) return;

    const pendingPlacements = designPlacements.filter(
      (p) => !placementAnnotationMap.current.has(p.id),
    );

    for (const placement of pendingPlacements) {
      const shadowAnnotation: Annotation = {
        id: `shadow-place-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        x: (placement.x / window.innerWidth) * 100,
        y: placement.y,
        comment: `Design placement: ${placement.type}`,
        element: placement.type,
        elementPath: `design-placement at (${placement.x}, ${placement.y})`,
        timestamp: placement.timestamp,
        boundingBox: {
          x: placement.x,
          y: placement.y,
          width: placement.width,
          height: placement.height,
        },
        kind: "placement",
        placement: {
          componentType: placement.type,
          width: placement.width,
          height: placement.height,
          scrollY: placement.scrollY,
        },
        sessionId: currentSessionId,
        url: typeof window !== "undefined" ? window.location.href : undefined,
        status: "pending",
      };

      syncAnnotation(endpoint, currentSessionId, shadowAnnotation)
        .then((serverAnnotation) => {
          placementAnnotationMap.current.set(placement.id, serverAnnotation.id);
        })
        .catch(() => {});
    }

    const removedIds = new Set(placementAnnotationMap.current.keys());
    for (const p of designPlacements) {
      removedIds.delete(p.id);
    }
    for (const placementId of removedIds) {
      const annotationId = placementAnnotationMap.current.get(placementId);
      if (annotationId) {
        deleteAnnotationFromServer(endpoint, annotationId).catch(() => {});
      }
      placementAnnotationMap.current.delete(placementId);
    }
  }, [designPlacements, endpoint, currentSessionId]);

  // Sync rearrange shadow annotations to server (debounced)
  useEffect(() => {
    if (!endpoint || !currentSessionId || !rearrangeState) return;

    const timer = originalSetTimeout(() => {
      const pendingSections = rearrangeState.sections.filter(
        (s) => !rearrangeAnnotationMap.current.has(s.id),
      );

      for (const section of pendingSections) {
        const shadowAnnotation: Annotation = {
          id: `shadow-rearrange-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          x: (section.currentRect.x / window.innerWidth) * 100,
          y: section.currentRect.y,
          comment: `Rearrange: ${section.label}`,
          element: section.label,
          elementPath: section.selector,
          timestamp: Date.now(),
          boundingBox: {
            x: section.currentRect.x,
            y: section.currentRect.y,
            width: section.currentRect.width,
            height: section.currentRect.height,
          },
          kind: "rearrange",
          rearrange: {
            selector: section.selector,
            label: section.label,
            tagName: section.tagName,
            originalRect: section.originalRect,
            currentRect: section.currentRect,
          },
          sessionId: currentSessionId,
          url: typeof window !== "undefined" ? window.location.href : undefined,
          status: "pending",
        };

        syncAnnotation(endpoint, currentSessionId, shadowAnnotation)
          .then((serverAnnotation) => {
            rearrangeAnnotationMap.current.set(section.id, serverAnnotation.id);
          })
          .catch(() => {});
      }

      const rearrangedIds = new Set(
        rearrangeState.sections.map((s) => s.id),
      );
      for (const [sectionId, annotationId] of rearrangeAnnotationMap.current) {
        if (!rearrangedIds.has(sectionId)) {
          deleteAnnotationFromServer(endpoint, annotationId).catch(() => {});
          rearrangeAnnotationMap.current.delete(sectionId);
        }
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [rearrangeState, endpoint, currentSessionId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (e.key === "Escape") {
        if (isDesignMode) {
          if (activeDesignComponent) {
            setActiveDesignComponent(null);
          } else {
            closeDesignMode();
          }
          return;
        }
        if (isDrawMode) {
          setIsDrawMode(false);
          return;
        }
        if (pendingMultiSelectElements.length > 0) {
          setPendingMultiSelectElements([]);
          return;
        }
        if (pendingAnnotation) {
        } else if (isActive) {
          hideTooltipsUntilMouseLeave();
          setIsActive(false);
        }
      }

      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        (e.key === "f" || e.key === "F")
      ) {
        e.preventDefault();
        hideTooltipsUntilMouseLeave();
        if (isActive) {
          deactivate();
        } else {
          setIsActive(true);
        }
        return;
      }

      if (isTyping || e.metaKey || e.ctrlKey) return;

      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        hideTooltipsUntilMouseLeave();
        toggleFreeze();
      }

      if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        hideTooltipsUntilMouseLeave();
        if (isDrawMode) setIsDrawMode(false);
        if (showSettings) setShowSettings(false);
        if (pendingAnnotation) cancelAnnotation();
        if (isDesignMode) {
          closeDesignMode();
        } else {
          setIsDesignMode(true);
        }
      }

      if (e.key === "h" || e.key === "H") {
        if (annotations.length > 0) {
          e.preventDefault();
          hideTooltipsUntilMouseLeave();
          setShowMarkers((prev) => !prev);
        }
      }

      if (e.key === "c" || e.key === "C") {
        if (
          annotations.length > 0 ||
          designPlacements.length > 0 ||
          rearrangeState
        ) {
          e.preventDefault();
          hideTooltipsUntilMouseLeave();
          copyOutput();
        }
      }

      if (e.key === "x" || e.key === "X") {
        if (
          annotations.length > 0 ||
          designPlacements.length > 0 ||
          rearrangeState
        ) {
          e.preventDefault();
          hideTooltipsUntilMouseLeave();
          clearAll();
          if (designPlacements.length > 0) setDesignPlacements([]);
          if (rearrangeState) setRearrangeState(null);
        }
      }

      if (e.key === "s" || e.key === "S") {
        const hasValidWebhook =
          isValidUrl(settings.webhookUrl) || isValidUrl(webhookUrl || "");
        if (annotations.length > 0 && hasValidWebhook && sendState === "idle") {
          e.preventDefault();
          hideTooltipsUntilMouseLeave();
          sendToWebhook();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    isActive,
    isDrawMode,
    isDesignMode,
    activeDesignComponent,
    designPlacements,
    rearrangeState,
    pendingAnnotation,
    annotations.length,
    settings.webhookUrl,
    webhookUrl,
    sendState,
    pendingMultiSelectElements.length,
  ]);

  const createMultiSelectPendingAnnotation = useCallback(() => {
    if (pendingMultiSelectElements.length === 0) return;

    const firstItem = pendingMultiSelectElements[0];
    const firstEl = firstItem.element;
    const isMulti = pendingMultiSelectElements.length > 1;

    const freshRects = pendingMultiSelectElements.map((item) =>
      item.element.getBoundingClientRect(),
    );

    if (!isMulti) {
      const rect = freshRects[0];
      const fixed = isElementFixed(firstEl);

      setPendingAnnotation({
        x: (rect.left / window.innerWidth) * 100,
        y: fixed ? rect.top : rect.top + window.scrollY,
        clientY: rect.top,
        element: firstItem.name,
        elementPath: firstItem.path,
        boundingBox: {
          x: rect.left,
          y: fixed ? rect.top : rect.top + window.scrollY,
          width: rect.width,
          height: rect.height,
        },
        isFixed: fixed,
        fullPath: getFullElementPath(firstEl),
        accessibility: getAccessibilityInfo(firstEl),
        computedStyles: getForensicComputedStyles(firstEl),
        computedStylesObj: getDetailedComputedStyles(firstEl),
        nearbyElements: getNearbyElements(firstEl),
        cssClasses: getElementClasses(firstEl),
        nearbyText: getNearbyText(firstEl),
        reactComponents: firstItem.reactComponents || undefined,
        sourceFile: detectSourceFile(firstEl),
      });
    } else {
      const bounds = {
        left: Math.min(...freshRects.map((r) => r.left)),
        top: Math.min(...freshRects.map((r) => r.top)),
        right: Math.max(...freshRects.map((r) => r.right)),
        bottom: Math.max(...freshRects.map((r) => r.bottom)),
      };

      const names = pendingMultiSelectElements
        .slice(0, 5)
        .map((item) => item.name)
        .join(", ");
      const suffix =
        pendingMultiSelectElements.length > 5
          ? ` +${pendingMultiSelectElements.length - 5} more`
          : "";

      const elementBoundingBoxes = freshRects.map((rect) => ({
        x: rect.left,
        y: rect.top + window.scrollY,
        width: rect.width,
        height: rect.height,
      }));

      const lastItem =
        pendingMultiSelectElements[pendingMultiSelectElements.length - 1];
      const lastEl = lastItem.element;
      const lastRect = freshRects[freshRects.length - 1];
      const lastCenterX = lastRect.left + lastRect.width / 2;
      const lastCenterY = lastRect.top + lastRect.height / 2;
      const lastIsFixed = isElementFixed(lastEl);

      setPendingAnnotation({
        x: (lastCenterX / window.innerWidth) * 100,
        y: lastIsFixed ? lastCenterY : lastCenterY + window.scrollY,
        clientY: lastCenterY,
        element: `${pendingMultiSelectElements.length} elements: ${names}${suffix}`,
        elementPath: "multi-select",
        boundingBox: {
          x: bounds.left,
          y: bounds.top + window.scrollY,
          width: bounds.right - bounds.left,
          height: bounds.bottom - bounds.top,
        },
        isMultiSelect: true,
        isFixed: lastIsFixed,
        elementBoundingBoxes,
        multiSelectElements: pendingMultiSelectElements.map(
          (item) => item.element,
        ),
        targetElement: lastEl,
        fullPath: getFullElementPath(firstEl),
        accessibility: getAccessibilityInfo(firstEl),
        computedStyles: getForensicComputedStyles(firstEl),
        computedStylesObj: getDetailedComputedStyles(firstEl),
        nearbyElements: getNearbyElements(firstEl),
        cssClasses: getElementClasses(firstEl),
        nearbyText: getNearbyText(firstEl),
        sourceFile: detectSourceFile(firstEl),
      });
    }

    setPendingMultiSelectElements([]);
    setHoverInfo(null);
  }, [pendingMultiSelectElements]);

  const startEditAnnotation = useCallback(
    (annotation: Annotation) => {
      setEditingAnnotation(annotation);
      setHoveredMarkerId(null);
      setHoveredTargetElement(null);
      setHoveredTargetElements([]);

      if (annotation.elementBoundingBoxes?.length) {
        const elements: HTMLElement[] = [];
        for (const bb of annotation.elementBoundingBoxes) {
          const centerX = bb.x + bb.width / 2;
          const centerY = bb.y + bb.height / 2 - window.scrollY;
          const el = deepElementFromPoint(centerX, centerY);
          if (el) elements.push(el);
        }
        setEditingTargetElements(elements);
        setEditingTargetElement(null);
      } else if (annotation.boundingBox) {
        const bb = annotation.boundingBox;
        const centerX = bb.x + bb.width / 2;
        const centerY = annotation.isFixed
          ? bb.y + bb.height / 2
          : bb.y + bb.height / 2 - window.scrollY;
        const el = deepElementFromPoint(centerX, centerY);

        if (el) {
          const elRect = el.getBoundingClientRect();
          const widthRatio = elRect.width / bb.width;
          const heightRatio = elRect.height / bb.height;
          if (widthRatio < 0.5 || heightRatio < 0.5) {
            setEditingTargetElement(null);
          } else {
            setEditingTargetElement(el);
          }
        } else {
          setEditingTargetElement(null);
        }
        setEditingTargetElements([]);
      } else {
        setEditingTargetElement(null);
        setEditingTargetElements([]);
      }
    },
    [],
  );

  const addAnnotation = useCallback(
    (comment: string) => {
      if (!pendingAnnotation) return;

      const newAnnotation: Annotation = {
        id: Date.now().toString(),
        x: pendingAnnotation.x,
        y: pendingAnnotation.y,
        comment,
        element: pendingAnnotation.element,
        elementPath: pendingAnnotation.elementPath,
        timestamp: Date.now(),
        selectedText: pendingAnnotation.selectedText,
        boundingBox: pendingAnnotation.boundingBox,
        nearbyText: pendingAnnotation.nearbyText,
        cssClasses: pendingAnnotation.cssClasses,
        isMultiSelect: pendingAnnotation.isMultiSelect,
        isFixed: pendingAnnotation.isFixed,
        fullPath: pendingAnnotation.fullPath,
        accessibility: pendingAnnotation.accessibility,
        computedStyles: pendingAnnotation.computedStyles,
        nearbyElements: pendingAnnotation.nearbyElements,
        reactComponents: pendingAnnotation.reactComponents,
        sourceFile: pendingAnnotation.sourceFile,
        elementBoundingBoxes: pendingAnnotation.elementBoundingBoxes,
        context: (() => {
          const snap = snapshotCollectors();
          const ctx: Annotation["context"] = {};
          if (snap.network.length > 0) {
            ctx.network = snap.network.slice(0, 10).map((n) => ({
              method: n.method,
              url: n.url,
              status: n.status,
              duration: n.duration,
              ...(n.error ? { error: n.error } : {}),
              ...(n.responseBody
                ? { responseBody: n.responseBody.slice(0, 1000) }
                : {}),
            }));
          }
          if (snap.console.length > 0) {
            ctx.console = snap.console.slice(0, 10).map((c) => ({
              level: c.level,
              message: c.message.slice(0, 500),
              ...(c.stack ? { stack: c.stack.slice(0, 500) } : {}),
            }));
          }
          if (snap.state.length > 0) {
            ctx.state = snap.state.map((s) => ({
              storeType: s.storeType,
              storeName: s.storeName,
              state: s.state,
            }));
          }
          return Object.keys(ctx).length > 0 ? ctx : undefined;
        })(),
        ...(endpoint && currentSessionId
          ? {
              sessionId: currentSessionId,
              url:
                typeof window !== "undefined"
                  ? window.location.href
                  : undefined,
              status: "pending" as const,
            }
          : {}),
      };

      setAnnotations((prev) => [...prev, newAnnotation]);
      recentlyAddedIdRef.current = newAnnotation.id;
      originalSetTimeout(() => {
        recentlyAddedIdRef.current = null;
      }, 300);
      originalSetTimeout(() => {
        setAnimatedMarkers((prev) => new Set(prev).add(newAnnotation.id));
      }, 250);

      onAnnotationAdd?.(newAnnotation);
      fireWebhook("annotation.add", { annotation: newAnnotation });

      setPendingExiting(true);
      originalSetTimeout(() => {
        setPendingAnnotation(null);
        setPendingExiting(false);
      }, 150);

      window.getSelection()?.removeAllRanges();

      if (endpoint && currentSessionId) {
        syncAnnotation(endpoint, currentSessionId, newAnnotation)
          .then((serverAnnotation) => {
            if (serverAnnotation.id !== newAnnotation.id) {
              setAnnotations((prev) =>
                prev.map((a) =>
                  a.id === newAnnotation.id
                    ? { ...a, id: serverAnnotation.id }
                    : a,
                ),
              );
              setAnimatedMarkers((prev) => {
                const next = new Set(prev);
                next.delete(newAnnotation.id);
                next.add(serverAnnotation.id);
                return next;
              });
            }
          })
          .catch((error) => {
            console.warn("[Agentation] Failed to sync annotation:", error);
          });
      }
    },
    [pendingAnnotation, onAnnotationAdd, fireWebhook, endpoint, currentSessionId],
  );

  const cancelAnnotation = useCallback(() => {
    setPendingExiting(true);
    originalSetTimeout(() => {
      setPendingAnnotation(null);
      setPendingExiting(false);
    }, 150);
  }, []);

  const deleteAnnotation = useCallback(
    (id: string) => {
      const deletedIndex = annotations.findIndex((a) => a.id === id);
      const deletedAnnotation = annotations[deletedIndex];

      if (editingAnnotation?.id === id) {
        setEditExiting(true);
        originalSetTimeout(() => {
          setEditingAnnotation(null);
          setEditingTargetElement(null);
          setEditingTargetElements([]);
          setEditExiting(false);
        }, 150);
      }

      setDeletingMarkerId(id);
      setExitingMarkers((prev) => new Set(prev).add(id));

      if (deletedAnnotation) {
        onAnnotationDelete?.(deletedAnnotation);
        fireWebhook("annotation.delete", { annotation: deletedAnnotation });
      }

      if (endpoint) {
        deleteAnnotationFromServer(endpoint, id).catch((error) => {
          console.warn(
            "[Agentation] Failed to delete annotation from server:",
            error,
          );
        });
      }

      originalSetTimeout(() => {
        setAnnotations((prev) => prev.filter((a) => a.id !== id));
        setExitingMarkers((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setDeletingMarkerId(null);

        if (deletedIndex < annotations.length - 1) {
          setRenumberFrom(deletedIndex);
          originalSetTimeout(() => setRenumberFrom(null), 200);
        }
      }, 150);
    },
    [annotations, editingAnnotation, onAnnotationDelete, fireWebhook, endpoint],
  );

  const handleMarkerHover = useCallback(
    (annotation: Annotation | null) => {
      if (!annotation) {
        setHoveredMarkerId(null);
        setHoveredTargetElement(null);
        setHoveredTargetElements([]);
        return;
      }

      setHoveredMarkerId(annotation.id);

      if (annotation.elementBoundingBoxes?.length) {
        const elements: HTMLElement[] = [];
        for (const bb of annotation.elementBoundingBoxes) {
          const centerX = bb.x + bb.width / 2;
          const centerY = bb.y + bb.height / 2 - window.scrollY;
          const allEls = document.elementsFromPoint(centerX, centerY);
          const el = allEls.find(
            (e) =>
              !e.closest("[data-annotation-marker]") &&
              !e.closest("[data-agentation-root]"),
          ) as HTMLElement | undefined;
          if (el) elements.push(el);
        }
        setHoveredTargetElements(elements);
        setHoveredTargetElement(null);
      } else if (annotation.boundingBox) {
        const bb = annotation.boundingBox;
        const centerX = bb.x + bb.width / 2;
        const centerY = annotation.isFixed
          ? bb.y + bb.height / 2
          : bb.y + bb.height / 2 - window.scrollY;
        const el = deepElementFromPoint(centerX, centerY);

        if (el) {
          const elRect = el.getBoundingClientRect();
          const widthRatio = elRect.width / bb.width;
          const heightRatio = elRect.height / bb.height;
          if (widthRatio < 0.5 || heightRatio < 0.5) {
            setHoveredTargetElement(null);
          } else {
            setHoveredTargetElement(el);
          }
        } else {
          setHoveredTargetElement(null);
        }
        setHoveredTargetElements([]);
      } else {
        setHoveredTargetElement(null);
        setHoveredTargetElements([]);
      }
    },
    [],
  );

  const updateAnnotation = useCallback(
    (newComment: string) => {
      if (!editingAnnotation) return;

      const updatedAnnotation = {
        ...editingAnnotation,
        comment: newComment,
      };

      setAnnotations((prev) =>
        prev.map((a) =>
          a.id === editingAnnotation.id ? updatedAnnotation : a,
        ),
      );

      onAnnotationUpdate?.(updatedAnnotation);
      fireWebhook("annotation.update", { annotation: updatedAnnotation });

      if (endpoint) {
        updateAnnotationOnServer(endpoint, editingAnnotation.id, {
          comment: newComment,
        }).catch((error) => {
          console.warn(
            "[Agentation] Failed to update annotation on server:",
            error,
          );
        });
      }

      setEditExiting(true);
      originalSetTimeout(() => {
        setEditingAnnotation(null);
        setEditingTargetElement(null);
        setEditingTargetElements([]);
        setEditExiting(false);
      }, 150);
    },
    [editingAnnotation, onAnnotationUpdate, fireWebhook, endpoint],
  );

  const cancelEditAnnotation = useCallback(() => {
    setEditExiting(true);
    originalSetTimeout(() => {
      setEditingAnnotation(null);
      setEditingTargetElement(null);
      setEditingTargetElements([]);
      setEditExiting(false);
    }, 150);
  }, []);

  const clearAll = useCallback(() => {
    const count = annotations.length;
    const hasDesign =
      designPlacements.length > 0 || !!rearrangeState;
    if (count === 0 && drawStrokes.length === 0 && !hasDesign) return;

    onAnnotationsClear?.(annotations);
    fireWebhook("annotations.clear", { annotations });

    if (endpoint) {
      Promise.all(
        annotations.map((a) =>
          deleteAnnotationFromServer(endpoint, a.id).catch((error) => {
            console.warn(
              "[Agentation] Failed to delete annotation from server:",
              error,
            );
          }),
        ),
      );

      for (const [, annotationId] of placementAnnotationMap.current) {
        if (annotationId) {
          deleteAnnotationFromServer(endpoint, annotationId).catch(() => {});
        }
      }
      placementAnnotationMap.current.clear();

      for (const [, annotationId] of rearrangeAnnotationMap.current) {
        if (annotationId) {
          deleteAnnotationFromServer(endpoint, annotationId).catch(() => {});
        }
      }
      rearrangeAnnotationMap.current.clear();
    }

    setIsClearing(true);
    setCleared(true);

    setDrawStrokes([]);
    const canvas = drawCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    if (designPlacements.length > 0 || rearrangeState) {
      setDesignClearSignal((n) => n + 1);
      setRearrangeClearSignal((n) => n + 1);
      originalSetTimeout(() => {
        setDesignPlacements([]);
        setRearrangeState(null);
      }, 200);
    }
    if (blankCanvas) setBlankCanvas(false);
    if (wireframePurpose) setWireframePurpose("");
    wireframeStashRef.current = { rearrange: null, placements: [] };
    clearWireframeState(pathname);

    const totalAnimationTime = count * 30 + 200;
    originalSetTimeout(() => {
      setAnnotations([]);
      setAnimatedMarkers(new Set());
      localStorage.removeItem(getStorageKey(pathname));
      setIsClearing(false);
    }, totalAnimationTime);

    originalSetTimeout(() => setCleared(false), 1500);
  }, [
    pathname,
    annotations,
    drawStrokes,
    designPlacements,
    rearrangeState,
    blankCanvas,
    wireframePurpose,
    onAnnotationsClear,
    fireWebhook,
    endpoint,
  ]);

  const copyOutput = useCallback(async () => {
    const displayUrl =
      typeof window !== "undefined"
        ? window.location.pathname +
          window.location.search +
          window.location.hash
        : pathname;
    const wireframeOnly = isDesignMode && blankCanvas;

    let output: string;
    if (wireframeOnly) {
      if (
        designPlacements.length === 0 &&
        !rearrangeState &&
        !wireframePurpose
      )
        return;
      output = "";
    } else {
      output = generateOutput(annotations, displayUrl, settings.outputDetail);
      if (
        !output &&
        drawStrokes.length === 0 &&
        designPlacements.length === 0 &&
        !rearrangeState
      )
        return;
      if (!output) output = `## Page Feedback: ${displayUrl}\n`;
    }

    if (!wireframeOnly && drawStrokes.length > 0) {
      const linkedDrawingIndices = new Set<number>();
      for (const a of annotations) {
        if (a.drawingIndex != null)
          linkedDrawingIndices.add(a.drawingIndex);
      }

      const canvas = drawCanvasRef.current;
      if (canvas) canvas.style.visibility = "hidden";

      const strokeDescriptions: string[] = [];
      const scrollYVal = window.scrollY;
      for (
        let strokeIdx = 0;
        strokeIdx < drawStrokes.length;
        strokeIdx++
      ) {
        if (linkedDrawingIndices.has(strokeIdx)) continue;
        const stroke = drawStrokes[strokeIdx];
        if (stroke.points.length < 2) continue;

        const viewportPoints = stroke.fixed
          ? stroke.points
          : stroke.points.map((p: any) => ({ x: p.x, y: p.y - scrollYVal }));

        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;
        for (const p of viewportPoints) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
        const bboxW = maxX - minX;
        const bboxH = maxY - minY;
        const bboxDiag = Math.hypot(bboxW, bboxH);

        const start = viewportPoints[0];
        const end = viewportPoints[viewportPoints.length - 1];
        const startEndDist = Math.hypot(end.x - start.x, end.y - start.y);

        let gesture: "circle" | "box" | "underline" | "arrow" | "drawing";
        const closedLoop = startEndDist < bboxDiag * 0.35;
        const aspectRatio = bboxW / Math.max(bboxH, 1);

        if (closedLoop && bboxDiag > 20) {
          const edgeThreshold = Math.max(bboxW, bboxH) * 0.15;
          let edgePoints = 0;
          for (const p of viewportPoints) {
            const nearLeft = p.x - minX < edgeThreshold;
            const nearRight = maxX - p.x < edgeThreshold;
            const nearTop = p.y - minY < edgeThreshold;
            const nearBottom = maxY - p.y < edgeThreshold;
            if ((nearLeft || nearRight) && (nearTop || nearBottom))
              edgePoints++;
          }
          gesture =
            edgePoints > viewportPoints.length * 0.15 ? "box" : "circle";
        } else if (aspectRatio > 3 && bboxH < 40) {
          gesture = "underline";
        } else if (startEndDist > bboxDiag * 0.5) {
          gesture = "arrow";
        } else {
          gesture = "drawing";
        }

        const sampleCount = Math.min(10, viewportPoints.length);
        const step = Math.max(
          1,
          Math.floor(viewportPoints.length / sampleCount),
        );
        const seenElements = new Set<HTMLElement>();
        const elementNames: string[] = [];

        const samplePoints = [start];
        for (let i = step; i < viewportPoints.length - 1; i += step) {
          samplePoints.push(viewportPoints[i]);
        }
        samplePoints.push(end);

        for (const p of samplePoints) {
          const el = deepElementFromPoint(p.x, p.y);
          if (!el || seenElements.has(el)) continue;
          if (closestCrossingShadow(el, "[data-feedback-toolbar]")) continue;
          seenElements.add(el);
          const { name } = identifyElement(el);
          if (!elementNames.includes(name)) {
            elementNames.push(name);
          }
        }

        const region = `${Math.round(minX)},${Math.round(minY)} → ${Math.round(maxX)},${Math.round(maxY)}`;
        let desc: string;

        if (
          (gesture === "circle" || gesture === "box") &&
          elementNames.length > 0
        ) {
          const verb = gesture === "box" ? "Boxed" : "Circled";
          desc = `${verb} **${elementNames[0]}**${elementNames.length > 1 ? ` (and ${elementNames.slice(1).join(", ")})` : ""} (region: ${region})`;
        } else if (gesture === "underline" && elementNames.length > 0) {
          desc = `Underlined **${elementNames[0]}** (${region})`;
        } else if (
          gesture === "arrow" &&
          elementNames.length >= 2
        ) {
          desc = `Arrow from **${elementNames[0]}** to **${elementNames[elementNames.length - 1]}** (${Math.round(start.x)},${Math.round(start.y)} → ${Math.round(end.x)},${Math.round(end.y)})`;
        } else if (elementNames.length > 0) {
          desc = `${gesture === "arrow" ? "Arrow" : "Drawing"} near **${elementNames.join("**, **")}** (region: ${region})`;
        } else {
          desc = `Drawing at ${region}`;
        }
        strokeDescriptions.push(desc);
      }

      if (canvas) canvas.style.visibility = "";

      if (strokeDescriptions.length > 0) {
        output += `\n**Drawings:**\n`;
        strokeDescriptions.forEach((d, i) => {
          output += `${i + 1}. ${d}\n`;
        });
      }
    }

    if (designPlacements.length > 0 || (wireframeOnly && wireframePurpose)) {
      output +=
        "\n" +
        generateDesignOutput(
          designPlacements,
          {
            width: window.innerWidth,
            height: window.innerHeight,
          },
          {
            blankCanvas,
            wireframePurpose: wireframePurpose || undefined,
          },
          settings.outputDetail,
        );
    }

    if (rearrangeState) {
      const rearrangeOutput = generateRearrangeOutput(
        rearrangeState,
        settings.outputDetail,
        {
          width: window.innerWidth,
          height: window.innerHeight,
        },
      );
      if (rearrangeOutput) {
        output += "\n" + rearrangeOutput;
      }
    }

    if (copyToClipboard) {
      try {
        await navigator.clipboard.writeText(output);
      } catch {
        // continue
      }
    }

    onCopy?.(output);

    setCopied(true);
    originalSetTimeout(() => setCopied(false), 2000);

    if (settings.autoClearAfterCopy) {
      originalSetTimeout(() => clearAll(), 500);
    }
  }, [
    annotations,
    drawStrokes,
    designPlacements,
    rearrangeState,
    blankCanvas,
    isDesignMode,
    wireframePurpose,
    pathname,
    settings,
    copyToClipboard,
    onCopy,
    clearAll,
  ]);

  const sendToWebhook = useCallback(async () => {
    const displayUrl =
      typeof window !== "undefined"
        ? window.location.pathname +
          window.location.search +
          window.location.hash
        : pathname;
    let output = generateOutput(annotations, displayUrl, settings.outputDetail);
    if (!output && designPlacements.length === 0 && !rearrangeState) return;
    if (!output) output = `## Page Feedback: ${displayUrl}\n`;

    if (designPlacements.length > 0) {
      output +=
        "\n" +
        generateDesignOutput(
          designPlacements,
          {
            width: window.innerWidth,
            height: window.innerHeight,
          },
          { blankCanvas, wireframePurpose: wireframePurpose || undefined },
          settings.outputDetail,
        );
    }

    if (rearrangeState) {
      const rearrangeOutput = generateRearrangeOutput(
        rearrangeState,
        settings.outputDetail,
        {
          width: window.innerWidth,
          height: window.innerHeight,
        },
      );
      if (rearrangeOutput) {
        output += "\n" + rearrangeOutput;
      }
    }

    if (onSubmit) {
      onSubmit(output, annotations);
    }

    setSendState("sending");

    await new Promise((resolve) => originalSetTimeout(resolve, 150));

    const success = await fireWebhook(
      "submit",
      { output, annotations },
      true,
    );

    setSendState(success ? "sent" : "failed");
    originalSetTimeout(() => setSendState("idle"), 2500);

    if (success && settings.autoClearAfterCopy) {
      originalSetTimeout(() => clearAll(), 500);
    }
  }, [
    onSubmit,
    fireWebhook,
    annotations,
    designPlacements,
    rearrangeState,
    blankCanvas,
    wireframePurpose,
    pathname,
    settings,
    clearAll,
  ]);

  return {
    annotations,
    setAnnotations,
    pendingAnnotation,
    setPendingAnnotation,
    editingAnnotation,
    setEditingAnnotation,
    deletingMarkerId,
    setDeletingMarkerId,
    renumberFrom,
    setRenumberFrom,
    showMarkers,
    setShowMarkers,
    markersVisible,
    setMarkersVisible,
    markersExiting,
    setMarkersExiting,
    hoveredMarkerId,
    setHoveredMarkerId,
    placementAnnotationMap,
    rearrangeAnnotationMap,
    settings,
    setSettings,
    animatedMarkers,
    setAnimatedMarkers,
    exitingMarkers,
    setExitingMarkers,
    shouldShowMarkers,
    popupRef,
    editPopupRef,
    hoverInfo,
    setHoverInfo,
    hoverPosition,
    setHoverPosition,
    copied,
    setCopied,
    sendState,
    setSendState,
    cleared,
    setCleared,
    isClearing,
    setIsClearing,
    hoveredTargetElement,
    setHoveredTargetElement,
    hoveredTargetElements,
    setHoveredTargetElements,
    editingTargetElement,
    setEditingTargetElement,
    editingTargetElements,
    setEditingTargetElements,
    scrollY,
    setScrollY,
    isScrolling,
    setIsScrolling,
    pendingExiting,
    setPendingExiting,
    editExiting,
    setEditExiting,
    pendingMultiSelectElements,
    setPendingMultiSelectElements,
    isDragging,
    setIsDragging,
    showSettings,
    setShowSettings,
    showSettingsVisible,
    setShowSettingsVisible,
    settingsPage,
    setSettingsPage,
    tooltipsHidden,
    setTooltipsHidden,
    mounted,
    setMounted,
    createMultiSelectPendingAnnotation,
    startEditAnnotation,
    addAnnotation,
    cancelAnnotation,
    deleteAnnotation,
    handleMarkerHover,
    updateAnnotation,
    cancelEditAnnotation,
    clearAll,
    copyOutput,
    sendToWebhook,
    hideTooltipsUntilMouseLeave,
    hideToolbarTemporarily,
    isToolbarHidden,
    setIsToolbarHidden,
    isToolbarHiding,
    setIsToolbarHiding,
    freezeAnimations,
    unfreezeAnimations,
    toggleFreeze,
    hasAnnotations,
    visibleAnnotations,
    hasVisibleAnnotations,
    exitingAnnotationsList,
    getTooltipPosition,
    mouseDownPosRef,
    dragStartRef,
    dragRectRef,
    highlightsContainerRef,
    justFinishedDragRef,
    lastElementUpdateRef,
    recentlyAddedIdRef,
    DRAG_THRESHOLD,
    ELEMENT_UPDATE_THROTTLE,
    scrollTimeoutRef,
    crossDragStartRef,
    isDrawingRef,
    currentStrokeRef,
    exitingStrokeIdRef,
    dimAmountRef,
    visualHighlightRef,
    exitingAlphaRef,
    modifiersHeldRef,
    justFinishedToolbarDragRef,
    toolbarPosition,
    setToolbarPosition,
    isDraggingToolbar,
    setIsDraggingToolbar,
    dragStartPos,
    setDragStartPos,
    hoveredDrawingIdx,
    setHoveredDrawingIdx,
    showEntranceAnimation,
    setShowEntranceAnimation,
  };
}
