"use client";

import { useState, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

import {
  AnnotationPopupCSS,
  AnnotationPopupCSSHandle,
} from "../annotation-popup-css";
import {
  IconListSparkle,
  IconGear,
  IconCopyAnimated,
  IconSendArrow,
  IconTrashAlt,
  IconEyeAnimated,
  IconPausePlayAnimated,
  IconXmarkLarge,
  IconEdit,
  IconChevronLeft,
  IconChevronRight,
  IconLayout,
} from "../icons";
import { HelpTooltip } from "../help-tooltip";
import { DesignMode } from "../design-mode";
import { DesignPalette } from "../design-mode/palette";
import designStyles from "../design-mode/styles.module.scss";
import { RearrangeOverlay } from "../design-mode/rearrange";
import { generateDesignOutput, generateRearrangeOutput } from "../design-mode/output";
import { detectPageSections } from "../design-mode/section-detection";
import { DEFAULT_SIZES, type DesignPlacement, type ComponentType as DesignComponentType, type RearrangeState } from "../design-mode/types";
import {
  identifyElement,
  getNearbyText,
  getElementClasses,
  getDetailedComputedStyles,
  getForensicComputedStyles,
  parseComputedStylesString,
  getFullElementPath,
  getAccessibilityInfo,
  getNearbyElements,
  closestCrossingShadow,
} from "../../utils/element-identification";
import {
  loadAnnotations,
  loadAllAnnotations,
  saveAnnotations,
  getStorageKey,
  loadSessionId,
  saveSessionId,
  clearSessionId,
  saveAnnotationsWithSyncMarker,
  loadDesignPlacements,
  saveDesignPlacements,
  clearDesignPlacements,
  loadRearrangeState,
  saveRearrangeState,
  clearRearrangeState,
  loadWireframeState,
  saveWireframeState,
  clearWireframeState,
  loadToolbarHidden,
  saveToolbarHidden,
} from "../../utils/storage";
import {
  createSession,
  getSession,
  syncAnnotation,
  updateAnnotation as updateAnnotationOnServer,
  deleteAnnotation as deleteAnnotationFromServer,
} from "../../utils/sync";
import { getReactComponentName } from "../../utils/react-detection";
import {
  getSourceLocation,
  findNearestComponentSource,
  formatSourceLocation,
} from "../../utils/source-location";
import { initScanners, scanElement, clearCache } from "../../scanners";
import { startCollectors, snapshotCollectors, clearCollectors } from "../../collectors";
import {
  freeze as freezeAll,
  initFreezePatches,
  unfreeze as unfreezeAll,
  originalSetTimeout,
  originalSetInterval,
  originalRequestAnimationFrame,
} from "../../utils/freeze-animations";

import type { Annotation } from "../../types";
import styles from "./styles.module.scss";
import { generateOutput } from "../../utils/generate-output";
import { AnnotationMarker, ExitingMarker, PendingMarker } from "./annotation-marker";
import { SettingsPanel } from "./settings-panel";
import { OutputDetailLevel, ReactComponentMode } from "../../types";
import { OUTPUT_TO_REACT_MODE } from "../../utils/generate-output";


// Initialize framework scanners once
let scannersInitialized = false;
function ensureScanners(): void {
  if (!scannersInitialized) {
    initScanners();
    scannersInitialized = true;
  }
}

/**
 * Composes element identification with framework component detection.
 * Supports React, Vue, Svelte, Angular, and SolidJS.
 * Falls back to React-specific detection for backward compatibility.
 */
function identifyElementWithReact(
  element: HTMLElement,
  reactMode: ReactComponentMode = "filtered",
): {
  /** Combined name for display (Framework path + element) */
  name: string;
  /** Raw element name without React path */
  elementName: string;
  /** DOM path */
  path: string;
  /** Framework component path (e.g., '<App> <SideNav> <Button>') */
  reactComponents: string | null;
} {
  ensureScanners();
  const { name: elementName, path } = identifyElement(element);

  // If React detection is off, just return element info
  if (reactMode === "off") {
    return { name: elementName, elementName, path, reactComponents: null };
  }

  const frameworkInfo = scanElement(element);

  if (frameworkInfo?.path) {
    return {
      name: `${frameworkInfo.path} ${elementName}`,
      elementName,
      path,
      reactComponents: frameworkInfo.path,
    };
  }

  // Fallback to React-specific detection for backward compatibility
  const reactInfo = getReactComponentName(element, { mode: reactMode });

  return {
    name: reactInfo.path ? `${reactInfo.path} ${elementName}` : elementName,
    elementName,
    path,
    reactComponents: reactInfo.path,
  };
}

// Module-level flag to prevent re-animating on SPA page navigation
let hasPlayedEntranceAnimation = false;

// =============================================================================
// Types
// =============================================================================

type HoverInfo = {
  element: string;
  elementName: string;
  elementPath: string;
  rect: DOMRect | null;
  reactComponents?: string | null;
};


type MarkerClickBehavior = "edit" | "delete";

export type ToolbarSettings = {
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

// Simple URL validation - checks for valid http(s) URL format
const isValidUrl = (url: string): boolean => {
  if (!url || !url.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};



export const COLOR_OPTIONS = [
  { id: "indigo",  label: "Indigo",  srgb: "#6155F5", p3: "color(display-p3 0.38 0.33 0.96)" },
  { id: "blue",    label: "Blue",    srgb: "#0088FF", p3: "color(display-p3 0.00 0.53 1.00)" },
  { id: "cyan",    label: "Cyan",    srgb: "#00C3D0", p3: "color(display-p3 0.00 0.76 0.82)" },
  { id: "green",   label: "Green",   srgb: "#34C759", p3: "color(display-p3 0.20 0.78 0.35)" },
  { id: "yellow",  label: "Yellow",  srgb: "#FFCC00", p3: "color(display-p3 1.00 0.80 0.00)" },
  { id: "orange",  label: "Orange",  srgb: "#FF8D28", p3: "color(display-p3 1.00 0.55 0.16)" },
  { id: "red",     label: "Red",     srgb: "#FF383C", p3: "color(display-p3 1.00 0.22 0.24)" },
];

const injectAgentationColorTokens = () => {
  if (typeof document === "undefined") return;
  if (document.getElementById("agentation-color-tokens")) return;
  const style = document.createElement("style");
  style.id = "agentation-color-tokens";
  style.textContent = [
    ...COLOR_OPTIONS.map(c => `
      [data-agentation-accent="${c.id}"] {
        --agentation-color-accent: ${c.srgb};
      }

      @supports (color: color(display-p3 0 0 0)) {
        [data-agentation-accent="${c.id}"] {
          --agentation-color-accent: ${c.p3};
        }
      }
    `),
    `:root {
      ${COLOR_OPTIONS.map(c => `--agentation-color-${c.id}: ${c.srgb};`).join("\n")}
    }`,
    `@supports (color: color(display-p3 0 0 0)) {
      :root {
        ${COLOR_OPTIONS.map(c => `--agentation-color-${c.id}: ${c.p3};`).join("\n")}
      }
    }`,
  ].join("");
  document.head.appendChild(style);
}

injectAgentationColorTokens();

// =============================================================================
// Utils
// =============================================================================

/**
 * Recursively pierces shadow DOMs to find the deepest element at a point.
 * document.elementFromPoint() stops at shadow hosts, so we need to
 * recursively check inside open shadow roots to find the actual target.
 */
function deepElementFromPoint(x: number, y: number): HTMLElement | null {
  let element = document.elementFromPoint(x, y) as HTMLElement | null;
  if (!element) return null;

  // Keep drilling down through shadow roots
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
    const position = style.position;
    if (position === "fixed" || position === "sticky") {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

function isRenderableAnnotation(annotation: Annotation): boolean {
  return annotation.status !== "resolved" && annotation.status !== "dismissed";
}

function detectSourceFile(element: Element): string | undefined {
  const result = getSourceLocation(element as HTMLElement);
  const loc = result.found ? result : findNearestComponentSource(element as HTMLElement);
  if (loc.found && loc.source) {
    return formatSourceLocation(loc.source, "path");
  }
  return undefined;
}

// =============================================================================
// Types for Props
// =============================================================================

export type DemoAnnotation = {
  selector: string;
  comment: string;
  selectedText?: string;
};

export type PageFeedbackToolbarCSSProps = {
  demoAnnotations?: DemoAnnotation[];
  demoDelay?: number;
  enableDemoMode?: boolean;
  /** Callback fired when an annotation is added. */
  onAnnotationAdd?: (annotation: Annotation) => void;
  /** Callback fired when an annotation is deleted. */
  onAnnotationDelete?: (annotation: Annotation) => void;
  /** Callback fired when an annotation comment is edited. */
  onAnnotationUpdate?: (annotation: Annotation) => void;
  /** Callback fired when all annotations are cleared. Receives the annotations that were cleared. */
  onAnnotationsClear?: (annotations: Annotation[]) => void;
  /** Callback fired when the copy button is clicked. Receives the markdown output. */
  onCopy?: (markdown: string) => void;
  /** Callback fired when "Send to Agent" is clicked. Receives the markdown output and annotations. */
  onSubmit?: (output: string, annotations: Annotation[]) => void;
  /** Whether to copy to clipboard when the copy button is clicked. Defaults to true. */
  copyToClipboard?: boolean;
  /** Server URL for sync (e.g., "http://localhost:4747"). If not provided, uses localStorage only. */
  endpoint?: string;
  /** Pre-existing session ID to join. If not provided with endpoint, creates a new session. */
  sessionId?: string;
  /** Called when a new session is created (only when endpoint is provided without sessionId). */
  onSessionCreated?: (sessionId: string) => void;
  /** Webhook URL to receive annotation events. */
  webhookUrl?: string;
  /** Custom class name applied to the toolbar container. Use to adjust positioning or z-index. */
  className?: string;
};

/** Alias for PageFeedbackToolbarCSSProps */
export type AgentationProps = PageFeedbackToolbarCSSProps;

// =============================================================================
// Component
// =============================================================================

export function PageFeedbackToolbarCSS({
  demoAnnotations,
  demoDelay = 1000,
  enableDemoMode = false,
  onAnnotationAdd,
  onAnnotationDelete,
  onAnnotationUpdate,
  onAnnotationsClear,
  onCopy,
  onSubmit,
  copyToClipboard = true,
  endpoint,
  sessionId: initialSessionId,
  onSessionCreated,
  webhookUrl,
  className: userClassName,
}: PageFeedbackToolbarCSSProps = {}) {
  const [isActive, setIsActive] = useState(false);
  const [isToolbarHidden, setIsToolbarHidden] = useState(() => loadToolbarHidden());
  const [isToolbarHiding, setIsToolbarHiding] = useState(false);

  // --- Restored states from useAnnotations ---
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [pendingAnnotation, setPendingAnnotation] = useState<any>(null);
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null);
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
      const saved = JSON.parse(localStorage.getItem("feedback-toolbar-settings") ?? "");
      return {
        ...DEFAULT_SETTINGS,
        ...saved,
        annotationColorId: COLOR_OPTIONS.find(c => c.id === saved.annotationColorId)
          ? saved.annotationColorId
          : DEFAULT_SETTINGS.annotationColorId,
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const [animatedMarkers, setAnimatedMarkers] = useState<Set<string>>(new Set());
  const [exitingMarkers, setExitingMarkers] = useState<Set<string>>(new Set());
  
  // --- Restored states from useDesignMode ---
  const [isDesignMode, setIsDesignMode] = useState(false);
  const [designOverlayExiting, setDesignOverlayExiting] = useState(false);
  const [designPlacements, setDesignPlacements] = useState<DesignPlacement[]>([]);
  const [activeDesignComponent, setActiveDesignComponent] = useState<DesignComponentType | null>(null);
  const [blankCanvas, setBlankCanvas] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);
  const [canvasOpacity, setCanvasOpacity] = useState(1);
  const [canvasPurpose, setCanvasPurpose] = useState<any>("new-page");
  const [wireframePurpose, setWireframePurpose] = useState("");
  const [designInteracting, setDesignInteracting] = useState(false);
  const [rearrangeState, setRearrangeState] = useState<RearrangeState | null>(null);

  const designPlacementsLoaded = useRef(false);
  const rearrangeLoaded = useRef(false);
  const wireframeLoaded = useRef(false);
  
  const exploreStashRef = useRef<{ rearrange: RearrangeState | null; placements: DesignPlacement[] }>({ rearrange: null, placements: [] });
  const wireframeStashRef = useRef<{ rearrange: RearrangeState | null; placements: DesignPlacement[] }>({ rearrange: null, placements: [] });
  const [designDeselectSignal, setDesignDeselectSignal] = useState(0);
  const [rearrangeDeselectSignal, setRearrangeDeselectSignal] = useState(0);
  const [designClearSignal, setDesignClearSignal] = useState(0);
  const [rearrangeClearSignal, setRearrangeClearSignal] = useState(0);
  
  const designSelectedIdsRef = useRef<Set<string>>(new Set());
  const rearrangeSelectedIdsRef = useRef<Set<string>>(new Set());
  const designExitTimer = useRef<ReturnType<typeof originalSetTimeout>>();
  const canvasShouldBeVisible = isDesignMode && isActive && !designOverlayExiting && blankCanvas;
  const rearrangeDebounceTimer = useRef<ReturnType<typeof originalSetTimeout>>();
  type MovedEntry = {
    el: HTMLElement;
    origStyles: { transform: string; transformOrigin: string; opacity: string; position: string; zIndex: string; display: string };
    ancestors: { el: HTMLElement; overflow: string }[];
  };
  const rearrangeMovedEls = useRef<Map<string, MovedEntry>>(new Map());

  const [hoveredDrawingIdx, setHoveredDrawingIdx] = useState<number | null>(null);
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<Array<{x: number, y: number}>>([]);
  const exitingStrokeIdRef = useRef<string | null>(null);

  // --- Restored states from useServerSync ---
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(initialSessionId || null);
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [tooltipSessionActive, setTooltipSessionActive] = useState(false);
  const tooltipSessionTimerRef = useRef<ReturnType<typeof originalSetTimeout> | null>(null);
  const sessionInitializedRef = useRef(false);
  const prevConnectionStatusRef = useRef<any>(null);

  // Stop native events from bubbling past document.body when they originate
  // inside the toolbar portal. Without this, clicks on the toolbar propagate to
  // document-level listeners, triggering "click outside" handlers that close
  // modals, dropdowns, and drawers. We attach to body (not a wrapper div) so
  // React's synthetic event delegation (which also listens on body/root) still
  // works — we only block propagation from body → document/window.
  const portalWrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    initFreezePatches();
    const stop = (e: Event) => {
      const wrapper = portalWrapperRef.current;
      if (wrapper && wrapper.contains(e.target as Node)) {
        e.stopPropagation();
      }
    };
    const events = ["mousedown", "click", "pointerdown"] as const;
    events.forEach((evt) => document.body.addEventListener(evt, stop));
    return () => {
      events.forEach((evt) => document.body.removeEventListener(evt, stop));
    };
  }, []);

  // Unified marker visibility state - controls both toolbar and eye toggle
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });
  const [copied, setCopied] = useState(false);
  const [sendState, setSendState] = useState<
    "idle" | "sending" | "sent" | "failed"
  >("idle");
  const [cleared, setCleared] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [hoveredTargetElement, setHoveredTargetElement] =
    useState<HTMLElement | null>(null);
  const [hoveredTargetElements, setHoveredTargetElements] = useState<
    HTMLElement[]
  >([]); // For cmd+shift+click multi-select hover
  const [editingTargetElement, setEditingTargetElement] =
    useState<HTMLElement | null>(null);
  const [editingTargetElements, setEditingTargetElements] = useState<
    HTMLElement[]
  >([]); // For cmd+shift+click multi-select
  const [scrollY, setScrollY] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [isFrozen, setIsFrozen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSettingsVisible, setShowSettingsVisible] = useState(false);
  const [settingsPage, setSettingsPage] = useState<"main" | "automations">(
    "main",
  );
  const [tooltipsHidden, setTooltipsHidden] = useState(false);

  // Layout mode state
  // Sub-mode state removed — unified mode renders both overlays simultaneously
  // Stash explore/wireframe state for full isolation between modes
  // Cross-overlay deselect signals — bump one to deselect the other
  // Track selections for cross-overlay drag coordination
  // Track start positions for cross-drag (set when drag starts)
  const crossDragStartRef = useRef<Map<string, { x: number; y: number }> | null>(null);
  // Delay blank canvas .visible by one frame when becoming visible so CSS transition fires
  // Shadow annotation tracking (design → server sync)
  // Draw mode state
  const [isDrawMode, setIsDrawMode] = useState(false);
  const [drawStrokes, setDrawStrokes] = useState<any[]>([]);
  const drawStrokesRef = useRef<any[]>([]);
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  drawStrokesRef.current = drawStrokes;
  const dimAmountRef = useRef(0);
  const visualHighlightRef = useRef<number | null>(null);
  const exitingAlphaRef = useRef(1);
  // Cmd+shift+click multi-select state
  const [pendingMultiSelectElements, setPendingMultiSelectElements] = useState<
    Array<{
      element: HTMLElement;
      rect: DOMRect;
      name: string;
      path: string;
      reactComponents?: string;
    }>
  >([]);
  const modifiersHeldRef = useRef({ cmd: false, shift: false });

  // Hide tooltips after button click until mouse leaves
  const hideTooltipsUntilMouseLeave = () => {
    setTooltipsHidden(true);
  };

  const showTooltipsAgain = () => {
    setTooltipsHidden(false);
  };
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [showEntranceAnimation, setShowEntranceAnimation] = useState(false);

  const toggleTheme = () => {
    portalWrapperRef.current?.classList.add(styles.disableTransitions);
    setIsDarkMode((previous) => !previous);
    originalRequestAnimationFrame(() => {
      portalWrapperRef.current?.classList.remove(styles.disableTransitions);
    });
  }

  // Check if running in development mode - React detection only works in development mode
  const isDevMode = process.env.NODE_ENV === "development";

  // Effective React mode - derived from outputDetail when enabled
  const effectiveReactMode: ReactComponentMode =
    isDevMode && settings.reactEnabled
      ? OUTPUT_TO_REACT_MODE[settings.outputDetail]
      : "off";

  // Server sync state
  // Draggable toolbar state
  const [toolbarPosition, setToolbarPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isDraggingToolbar, setIsDraggingToolbar] = useState(false);
  const [dragStartPos, setDragStartPos] = useState<{
    x: number;
    y: number;
    toolbarX: number;
    toolbarY: number;
  } | null>(null);
  const justFinishedToolbarDragRef = useRef(false);

  // For animations - track which markers have animated in and which are exiting
  const [pendingExiting, setPendingExiting] = useState(false);
  const [editExiting, setEditExiting] = useState(false);

  // Multi-select drag state - use refs for all drag visuals to avoid re-renders
  const [isDragging, setIsDragging] = useState(false);
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragRectRef = useRef<HTMLDivElement | null>(null);
  const highlightsContainerRef = useRef<HTMLDivElement | null>(null);
  const justFinishedDragRef = useRef(false);
  const lastElementUpdateRef = useRef(0);
  const recentlyAddedIdRef = useRef<string | null>(null);
  const DRAG_THRESHOLD = 8;
  const ELEMENT_UPDATE_THROTTLE = 50; // Faster updates since no React re-renders
  const scrollTimeoutRef = useRef<ReturnType<typeof originalSetTimeout> | null>(null);

  const popupRef = useRef<AnnotationPopupCSSHandle>(null);
  const editPopupRef = useRef<AnnotationPopupCSSHandle>(null);

  const visibleAnnotations = annotations.filter(isRenderableAnnotation);
  const hasVisibleAnnotations = visibleAnnotations.length > 0;
  const hasAnnotations = annotations.filter(isRenderableAnnotation).length > 0;
  const exitingAnnotationsList = annotations.filter((a) => exitingMarkers.has(a.id));
  const shouldShowMarkers = showMarkers || isDrawMode || annotations.length === 0;
  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "/";

  // Handle showSettings changes with exit animation
  useEffect(() => {
    if (showSettings) {
      setShowSettingsVisible(true);
    } else {
      // Reset tooltips when settings close (fixes tooltips not showing after closing settings)
      setTooltipsHidden(false);
      // Reset to main page when settings close
      setSettingsPage("main");
      const timer = originalSetTimeout(() => setShowSettingsVisible(false), 0);
      return () => clearTimeout(timer);
    }
  }, [showSettings]);

  // Unified marker visibility - depends on toolbar active, showMarkers toggle, and not blank canvas
  // This single effect handles all marker show/hide animations
  // Mount and load
  // Save settings
  useEffect(() => {
    if (mounted) {
      localStorage.setItem(
        "feedback-toolbar-settings",
        JSON.stringify(settings),
      );
    }
  }, [settings, mounted]);

  // Save theme preference
  useEffect(() => {
    if (mounted) {
      localStorage.setItem(
        "feedback-toolbar-theme",
        isDarkMode ? "dark" : "light",
      );
    }
  }, [isDarkMode, mounted]);

  // Save toolbar position when drag ends
  const prevDraggingRef = useRef(false);
  useEffect(() => {
    const wasDragging = prevDraggingRef.current;
    prevDraggingRef.current = isDraggingToolbar;

    // Save position when dragging ends (transition from true to false)
    if (wasDragging && !isDraggingToolbar && toolbarPosition && mounted) {
      localStorage.setItem(
        "feedback-toolbar-position",
        JSON.stringify(toolbarPosition),
      );
    }
  }, [isDraggingToolbar, toolbarPosition, mounted]);

  // Initialize server session (when endpoint is provided)
  // Periodic health check for server connection
  // Listen for server-side annotation updates (e.g. resolved by agent)
  // Sync local annotations when connection is restored
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

  // Demo annotations
  // Track scroll
  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
      setIsScrolling(true);

      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      scrollTimeoutRef.current = originalSetTimeout(() => {
        setIsScrolling(false);
      }, 150);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Save annotations (preserving sync markers if connected to a session)
  // Load design placements from localStorage on mount
  // Save design placements to localStorage (only explore-mode data — wireframe has its own key)
  // Load rearrange state from localStorage on mount
  // Save rearrange state to localStorage (only explore-mode data — wireframe has its own key)
  // Load wireframe stash from localStorage on mount
  // Save wireframe stash to localStorage when it changes
  // Initialize empty rearrange state when entering explore mode
  // Sections are captured on click, not auto-detected
  // Sync placement shadow annotations to server
  // Sync rearrange shadow annotations to server (debounced)
  // Visually move/resize original DOM elements to match rearrange state.
  // Lives here (not in RearrangeOverlay) so transforms persist across sub-mode
  // switches (rearrange ↔ add) and animate back when layout mode exits.
  useLayoutEffect(() => {
    const sections = rearrangeState?.sections ?? [];
    const active = new Set<string>();

    if ((isDesignMode || designOverlayExiting) && isActive) {
      for (const s of sections) {
        active.add(s.id);
        try {
          const el = document.querySelector(s.selector) as HTMLElement | null;
          if (!el) continue;

          // Elevate on first encounter — prevents clipping during drag/resize
          if (!rearrangeMovedEls.current.has(s.id)) {
            const origStyles = {
              transform: el.style.transform,
              transformOrigin: el.style.transformOrigin,
              opacity: el.style.opacity,
              position: el.style.position,
              zIndex: el.style.zIndex,
              display: el.style.display,
            };

            // Find clipping ancestors
            const ancestors: { el: HTMLElement; overflow: string }[] = [];
            let parent = el.parentElement;
            while (parent && parent !== document.body) {
              const cs = getComputedStyle(parent);
              if (cs.overflow !== "visible" || cs.overflowX !== "visible" || cs.overflowY !== "visible") {
                ancestors.push({ el: parent, overflow: parent.style.overflow });
                parent.style.overflow = "visible";
              }
              parent = parent.parentElement;
            }

            // Inline elements don't support transforms — promote to inline-block
            const computed = getComputedStyle(el);
            if (computed.display === "inline") {
              el.style.display = "inline-block";
            }

            rearrangeMovedEls.current.set(s.id, { el, origStyles, ancestors });
            el.style.transformOrigin = "top left";
            el.style.zIndex = "9999";
          }

          // Ghost mode: don't transform page elements. Outlines show ghosts instead.
        } catch { /* invalid selector */ }
      }
    }

    // Restore elements that are no longer captured or layout mode exited
    for (const [id, entry] of rearrangeMovedEls.current) {
      if (!active.has(id)) {
        const { el, origStyles, ancestors } = entry;
        el.style.transition = "transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.4s cubic-bezier(0.22, 1, 0.36, 1)";
        el.style.transform = origStyles.transform;
        el.style.transformOrigin = origStyles.transformOrigin;
        el.style.opacity = origStyles.opacity;
        el.style.position = origStyles.position;
        el.style.zIndex = origStyles.zIndex;
        rearrangeMovedEls.current.delete(id);
        originalSetTimeout(() => {
          el.style.transition = "";
          el.style.display = origStyles.display;
          for (const a of ancestors) {
            a.el.style.overflow = a.overflow;
          }
        }, 450);
      }
    }
  }, [rearrangeState, isDesignMode, designOverlayExiting, isActive]);

  // Clean up all moved elements on unmount — animate back to original positions
  // Close layout mode — palette + overlays exit concurrently
  // Deactivate toolbar — if in layout mode, animate out overlays independently
  // Freeze animations (delegates to freeze-animations utility)
  const freezeAnimations = useCallback(() => {
    if (isFrozen) return;
    freezeAll();
    setIsFrozen(true);
  }, [isFrozen]);

  const unfreezeAnimations = useCallback(() => {
    if (!isFrozen) return;
    unfreezeAll();
    setIsFrozen(false);
  }, [isFrozen]);

  const toggleFreeze = useCallback(() => {
    if (isFrozen) {
      unfreezeAnimations();
    } else {
      freezeAnimations();
    }
  }, [isFrozen, freezeAnimations, unfreezeAnimations]);

  // Create pending annotation from cmd+shift+click multi-select
  // Reset state when deactivating
  // Unmount safety — if component is removed while frozen, unfreeze the page
  useEffect(() => {
    return () => {
      unfreezeAll();
    };
  }, []);

  // Custom cursor
  useEffect(() => {
    if (!isActive) return;

    const textElementsSelector = [
      "p", "span", "h1", "h2", "h3", "h4", "h5", "h6",
      "li", "td", "th", "label", "blockquote", "figcaption",
      "caption", "legend", "dt", "dd", "pre", "code",
      "em", "strong", "b", "i", "u", "s", "a",
      "time", "address", "cite", "q", "abbr", "dfn",
      "mark", "small", "sub", "sup", "[contenteditable]"
    ].join(", ");

    const notAgentationSelector = `:not([data-agentation-root]):not([data-agentation-root] *)`;

    const style = document.createElement("style");
    style.id = "feedback-cursor-styles";
    // Text elements get text cursor (higher specificity with body prefix)
    // Everything else gets crosshair
    style.textContent = `
      body ${notAgentationSelector} {
        cursor: crosshair !important;
      }

      body :is(${textElementsSelector})${notAgentationSelector} {
        cursor: text !important;
      }
    `;
    document.head.appendChild(style);

    return () => {
      const existingStyle = document.getElementById("feedback-cursor-styles");
      if (existingStyle) existingStyle.remove();
    };
  }, [isActive]);


  // Cursor change when hovering a drawing stroke (both draw mode and normal mode)
  // Handle mouse move
  // Start editing an annotation (right-click or click on drawing stroke)
  // Handle click
  // Cmd+shift+click multi-select: keyup listener for modifier release
  // Multi-select drag - mousedown
  // Multi-select drag - mousemove (fully optimized with direct DOM updates)
  // Multi-select drag - mouseup
  // Fire webhook for annotation events - returns true on success, false on failure
  // Add annotation
  // Cancel annotation with exit animation
  // Delete annotation with exit animation
  // Handle marker hover - finds element(s) for live position tracking
  // Update annotation (edit mode submit)
  // Cancel editing with exit animation
  // Clear all with staggered animation
  // Copy output
  // Send to webhook
  // Toolbar dragging - mousemove and mouseup
  // Handle toolbar drag start
  const handleToolbarMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only drag when clicking the toolbar background (not buttons or settings)
      if (
        (e.target as HTMLElement).closest("button") ||
        (e.target as HTMLElement).closest('[data-agentation-settings-panel]')
      ) {
        return;
      }

      // Don't prevent default yet - let onClick work for collapsed state

      // Get toolbar parent's actual current position (toolbarPosition is applied to parent)
      const toolbarParent = (e.currentTarget as HTMLElement).parentElement;
      if (!toolbarParent) return;

      const rect = toolbarParent.getBoundingClientRect();
      const currentX = toolbarPosition?.x ?? rect.left;
      const currentY = toolbarPosition?.y ?? rect.top;

      setDragStartPos({
        x: e.clientX,
        y: e.clientY,
        toolbarX: currentX,
        toolbarY: currentY,
      });
      // Don't set isDraggingToolbar yet - wait for actual movement
    },
    [toolbarPosition],
  );

  // Keep toolbar in view on window resize and when toolbar expands/collapses
// =============================================================================
// Refs for state/callback access in effects (avoids stale closures)
// =============================================================================
const editingAnnotationRef = useRef<Annotation | null>(null);
editingAnnotationRef.current = editingAnnotation;
const pendingAnnotationRef = useRef<any>(null);
pendingAnnotationRef.current = pendingAnnotation;
const isDesignModeRef = useRef(false);
isDesignModeRef.current = isDesignMode;
const toolbarPositionRef = useRef<{ x: number; y: number } | null>(null);
toolbarPositionRef.current = toolbarPosition;
const isDraggingToolbarRef = useRef(false);
isDraggingToolbarRef.current = isDraggingToolbar;
const pendingMultiSelectElementsRef = useRef<Array<{ element: HTMLElement; rect: DOMRect; name: string; path: string; reactComponents?: string }>>([]);
pendingMultiSelectElementsRef.current = pendingMultiSelectElements;

// =============================================================================
// Fire webhook for annotation events - returns true on success, false on failure
// =============================================================================
const fireWebhook = useCallback(async (type: string, annotation: Annotation): Promise<boolean> => {
  const url = settings.webhookUrl || webhookUrl;
  if (!url || !isValidUrl(url)) return false;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, annotation, timestamp: Date.now() }),
    });
    return response.ok;
  } catch {
    return false;
  }
}, [settings.webhookUrl, webhookUrl]);

// =============================================================================
// Add annotation
// =============================================================================
const addAnnotation = useCallback((comment: string) => {
  if (!pendingAnnotation) return;
  const annotation: Annotation = {
    id: pendingAnnotation.id || `ann-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    x: pendingAnnotation.x,
    y: pendingAnnotation.y,
    comment,
    element: pendingAnnotation.element || 'Unknown element',
    elementPath: pendingAnnotation.elementPath || '',
    timestamp: Date.now(),
    selectedText: pendingAnnotation.selectedText,
    boundingBox: pendingAnnotation.boundingBox,
    isMultiSelect: pendingAnnotation.isMultiSelect,
    isFixed: pendingAnnotation.isFixed,
    computedStyles: typeof pendingAnnotation.computedStyles === 'string'
      ? pendingAnnotation.computedStyles
      : pendingAnnotation.computedStylesObj
        ? JSON.stringify(pendingAnnotation.computedStylesObj)
        : undefined,
    reactComponents: pendingAnnotation.reactComponents,
    sourceFile: pendingAnnotation.sourceFile,
    elementBoundingBoxes: pendingAnnotation.elementBoundingBoxes,
    status: 'pending',
  };
  const newAnnotations = [...annotations, annotation];
  setAnnotations(newAnnotations);
  if (currentSessionId) {
    saveAnnotationsWithSyncMarker(pathname, newAnnotations, currentSessionId);
  } else {
    saveAnnotations(pathname, newAnnotations);
  }
  setPendingAnnotation(null);
  setAnimatedMarkers(prev => new Set(prev).add(annotation.id));
  onAnnotationAdd?.(annotation);
  fireWebhook('add', annotation);
}, [pendingAnnotation, annotations, currentSessionId, pathname, onAnnotationAdd, fireWebhook]);

// =============================================================================
// Cancel annotation with exit animation
// =============================================================================
const cancelAnnotation = useCallback(() => {
  setPendingExiting(true);
  originalSetTimeout(() => {
    setPendingAnnotation(null);
    setPendingExiting(false);
  }, 150);
}, []);

// =============================================================================
// Delete annotation with exit animation
// =============================================================================
const deleteAnnotation = useCallback((id: string) => {
  setDeletingMarkerId(id);
  setExitingMarkers(prev => new Set(prev).add(id));
  setRenumberFrom(annotations.findIndex(a => a.id === id));
  originalSetTimeout(() => {
    const deleted = annotations.find(a => a.id === id);
    const newAnnotations = annotations.filter(a => a.id !== id);
    setAnnotations(newAnnotations);
    setExitingMarkers(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setDeletingMarkerId(null);
    setRenumberFrom(null);
    if (currentSessionId) {
      saveAnnotationsWithSyncMarker(pathname, newAnnotations, currentSessionId);
    } else {
      saveAnnotations(pathname, newAnnotations);
    }
    if (deleted) {
      onAnnotationDelete?.(deleted);
      fireWebhook('delete', deleted);
    }
  }, 300);
}, [annotations, currentSessionId, pathname, onAnnotationDelete, fireWebhook]);

// =============================================================================
// Handle marker hover - finds element(s) for live position tracking
// =============================================================================
const handleMarkerHover = useCallback((annotation: Annotation | null) => {
  if (!annotation) {
    setHoveredMarkerId(null);
    setHoveredTargetElement(null);
    setHoveredTargetElements([]);
    return;
  }
  setHoveredMarkerId(annotation.id);
  if (annotation.elementPath && !annotation.isMultiSelect) {
    try {
      const el = document.querySelector(annotation.elementPath) as HTMLElement | null;
      if (el) {
        setHoveredTargetElement(el);
        setHoveredTargetElements([el]);
      }
    } catch {
      setHoveredTargetElement(null);
      setHoveredTargetElements([]);
    }
  } else {
    setHoveredTargetElement(null);
    setHoveredTargetElements([]);
  }
}, []);

// =============================================================================
// Update annotation (edit mode submit)
// =============================================================================
const updateAnnotation = useCallback((comment: string) => {
  if (!editingAnnotation) return;
  const updated: Annotation = { ...editingAnnotation, comment, timestamp: Date.now() };
  const newAnnotations = annotations.map(a =>
    a.id === editingAnnotation.id ? updated : a
  );
  setAnnotations(newAnnotations);
  if (currentSessionId) {
    saveAnnotationsWithSyncMarker(pathname, newAnnotations, currentSessionId);
  } else {
    saveAnnotations(pathname, newAnnotations);
  }
  setEditingAnnotation(null);
  setEditingTargetElement(null);
  setEditingTargetElements([]);
  onAnnotationUpdate?.(updated);
  fireWebhook('update', updated);
}, [editingAnnotation, annotations, currentSessionId, pathname, onAnnotationUpdate, fireWebhook]);

// =============================================================================
// Cancel editing with exit animation
// =============================================================================
const cancelEditAnnotation = useCallback(() => {
  setEditExiting(true);
  originalSetTimeout(() => {
    setEditingAnnotation(null);
    setEditExiting(false);
    setEditingTargetElement(null);
    setEditingTargetElements([]);
  }, 150);
}, []);

// =============================================================================
// Clear all with staggered animation
// =============================================================================
const clearAll = useCallback(() => {
  setIsClearing(true);
  const toClear = annotations.filter(isRenderableAnnotation);
  const ids = new Set(toClear.map(a => a.id));
  setExitingMarkers(prev => new Set([...prev, ...ids]));
  setAnimatedMarkers(new Set());
  setDrawStrokes([]);
  drawStrokesRef.current = [];
  originalSetTimeout(() => {
    setAnnotations([]);
    saveAnnotations(pathname, []);
    setExitingMarkers(new Set());
    setIsClearing(false);
    setDesignPlacements([]);
    setActiveDesignComponent(null);
    setRearrangeState({ sections: [], originalOrder: [], detectedAt: Date.now() });
    setBlankCanvas(false);
    setCanvasReady(false);
    clearDesignPlacements(pathname);
    clearRearrangeState(pathname);
    clearWireframeState(pathname);
    setCleared(true);
    originalSetTimeout(() => setCleared(false), 1500);
    onAnnotationsClear?.(toClear);
    for (const a of toClear) {
      fireWebhook('delete', a);
    }
  }, 300);
}, [annotations, pathname, onAnnotationsClear, fireWebhook]);

// =============================================================================
// Copy output
// =============================================================================
const copyOutput = useCallback(() => {
  const viewport = typeof window !== 'undefined'
    ? { width: window.innerWidth, height: window.innerHeight }
    : { width: 0, height: 0 };

  let output = '';
  if (isDesignMode && blankCanvas) {
    const designOut = generateDesignOutput(designPlacements, viewport, { blankCanvas, wireframePurpose }, settings.outputDetail);
    const rearrangeOut = rearrangeState?.sections?.length
      ? generateRearrangeOutput(rearrangeState, settings.outputDetail, viewport)
      : '';
    output = [designOut, rearrangeOut].filter(Boolean).join('\n\n');
    if (!output) return;
  } else {
    const annotationOut = annotations.filter(isRenderableAnnotation).length > 0
      ? generateOutput(annotations.filter(isRenderableAnnotation), pathname, settings.outputDetail)
      : '';
    const designOut = designPlacements.length > 0
      ? generateDesignOutput(designPlacements, viewport, undefined, settings.outputDetail)
      : '';
    const rearrangeOut = rearrangeState?.sections?.length
      ? generateRearrangeOutput(rearrangeState, settings.outputDetail, viewport)
      : '';
    output = [annotationOut, designOut, rearrangeOut].filter(Boolean).join('\n\n');
    if (!output) return;
  }

  if (copyToClipboard) {
    navigator.clipboard.writeText(output).catch(() => {});
  }
  setCopied(true);
  originalSetTimeout(() => setCopied(false), 2000);
  onCopy?.(output);
  if (settings.autoClearAfterCopy) {
    originalSetTimeout(() => clearAll(), 100);
  }
}, [annotations, pathname, settings.outputDetail, settings.autoClearAfterCopy, designPlacements, rearrangeState, blankCanvas, wireframePurpose, isDesignMode, copyToClipboard, onCopy, clearAll]);

// =============================================================================
// Send to webhook
// =============================================================================
const sendToWebhook = useCallback(async () => {
  const url = settings.webhookUrl || webhookUrl;
  if (!url || !isValidUrl(url)) return;
  setSendState('sending');
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'send_all',
        annotations: annotations.filter(isRenderableAnnotation),
        timestamp: Date.now(),
      }),
    });
    if (response.ok) {
      setSendState('sent');
      originalSetTimeout(() => setSendState('idle'), 2000);
    } else {
      setSendState('failed');
    }
  } catch {
    setSendState('failed');
  }
}, [settings.webhookUrl, webhookUrl, annotations]);

// =============================================================================
// Close layout mode - animate out overlays
// =============================================================================
const closeDesignMode = useCallback(() => {
  setDesignOverlayExiting(true);
  originalSetTimeout(() => {
    setIsDesignMode(false);
    setDesignOverlayExiting(false);
    setActiveDesignComponent(null);
    setDesignInteracting(false);
    setBlankCanvas(false);
    setCanvasReady(false);
  }, 150);
}, []);

// =============================================================================
// Tooltip visibility handlers
// =============================================================================
const handleControlsMouseEnter = useCallback(() => {
  setTooltipsHidden(false);
}, []);

const handleControlsMouseLeave = useCallback(() => {
  setTooltipsHidden(true);
}, []);

// =============================================================================
// Deactivate toolbar - close everything
// =============================================================================
const deactivate = useCallback(() => {
  setIsActive(false);
  setPendingAnnotation(null);
  setPendingExiting(false);
  setEditingAnnotation(null);
  setEditExiting(false);
  setHoverInfo(null);
  setIsDrawMode(false);
  setShowSettings(false);
  setShowSettingsVisible(false);
  setHoveredTargetElement(null);
  setHoveredTargetElements([]);
  setEditingTargetElement(null);
  setEditingTargetElements([]);
  setHoveredMarkerId(null);
  setPendingMultiSelectElements([]);
}, []);

// =============================================================================
// Get tooltip position with viewport-aware scroll adjustment
// =============================================================================
const getTooltipPosition = useCallback((annotation: Annotation): { x: number; y: number; isFixed: boolean } => {
  return {
    x: annotation.x,
    y: annotation.isFixed ? annotation.y : annotation.y - scrollY,
    isFixed: annotation.isFixed || false,
  };
}, [scrollY]);

// Start editing an annotation (right-click or click on marker)
const startEditAnnotation = useCallback((annotation: Annotation) => {
  setEditingAnnotation(annotation);
  setHoveredMarkerId(null);
  if (annotation.elementPath && !annotation.isMultiSelect) {
    try {
      const el = document.querySelector(annotation.elementPath) as HTMLElement | null;
      if (el) {
        setEditingTargetElement(el);
        setEditingTargetElements([el]);
      }
    } catch {
      setEditingTargetElement(null);
      setEditingTargetElements([]);
    }
  } else {
    setEditingTargetElement(null);
    setEditingTargetElements([]);
  }
}, []);

// =============================================================================
// Refs for callback access in effects
// =============================================================================
const addAnnotationRef = useRef<(comment: string) => void>(addAnnotation);
addAnnotationRef.current = addAnnotation;
const cancelAnnotationRef = useRef<() => void>(cancelAnnotation);
cancelAnnotationRef.current = cancelAnnotation;
const deleteAnnotationRef = useRef<(id: string) => void>(deleteAnnotation);
deleteAnnotationRef.current = deleteAnnotation;
const startEditAnnotationRef = useRef<(annotation: Annotation) => void>(startEditAnnotation);
startEditAnnotationRef.current = startEditAnnotation;
const updateAnnotationRef = useRef<(comment: string) => void>(updateAnnotation);
updateAnnotationRef.current = updateAnnotation;
const cancelEditAnnotationRef = useRef<() => void>(cancelEditAnnotation);
cancelEditAnnotationRef.current = cancelEditAnnotation;
const clearAllRef = useRef<() => void>(clearAll);
clearAllRef.current = clearAll;
const copyOutputRef = useRef<() => void>(copyOutput);
copyOutputRef.current = copyOutput;
const sendToWebhookRef = useRef<() => void>(sendToWebhook);
sendToWebhookRef.current = sendToWebhook;
const closeDesignModeRef = useRef<() => void>(closeDesignMode);
closeDesignModeRef.current = closeDesignMode;
const deactivateRef = useRef<() => void>(deactivate);
deactivateRef.current = deactivate;
const toggleFreezeRef = useRef<() => void>(toggleFreeze);
toggleFreezeRef.current = toggleFreeze;

// =============================================================================
// useEffect hooks
// =============================================================================

// 17. Marker visibility effect (reacts to shouldShowMarkers)
useEffect(() => {
  if (shouldShowMarkers && !markersVisible && !markersExiting) {
    setMarkersVisible(true);
  } else if (!shouldShowMarkers && markersVisible && !markersExiting) {
    setMarkersExiting(true);
    const timer = originalSetTimeout(() => {
      setMarkersVisible(false);
      setMarkersExiting(false);
    }, 200);
    return () => clearTimeout(timer);
  }
}, [shouldShowMarkers, markersVisible, markersExiting]);

// 18. Mount initialization effect (load annotations, theme, position from localStorage)
useEffect(() => {
  if (!mounted) return;
  const stored = loadAnnotations<Annotation>(pathname);
  if (stored.length > 0) {
    setAnnotations(stored);
  }
  const theme = localStorage.getItem('feedback-toolbar-theme');
  if (theme === 'light' || theme === 'dark') {
    setIsDarkMode(theme === 'dark');
  }
  const savedPosition = localStorage.getItem('feedback-toolbar-position');
  if (savedPosition) {
    try {
      const pos = JSON.parse(savedPosition);
      if (typeof pos.x === 'number' && typeof pos.y === 'number') {
        setToolbarPosition(pos);
      }
    } catch {}
  }
  if (!hasPlayedEntranceAnimation) {
    hasPlayedEntranceAnimation = true;
    setShowEntranceAnimation(true);
    const timer = originalSetTimeout(() => setShowEntranceAnimation(false), 600);
    return () => clearTimeout(timer);
  }
}, [mounted, pathname]);

// 19. Mousemove handler effect (element tracking)
useEffect(() => {
  if (!isActive) return;
  const handleMouseMove = (e: MouseEvent) => {
    const el = deepElementFromPoint(e.clientX, e.clientY);
    if (!el || (el as HTMLElement).closest?.('[data-feedback-toolbar]')) {
      setHoverInfo(null);
      return;
    }
    const htmlEl = el as HTMLElement;
    const elementData = identifyElementWithReact(htmlEl, effectiveReactMode);
    const rect = htmlEl.getBoundingClientRect();
    setHoverInfo({
      element: elementData.name,
      elementName: elementData.elementName,
      elementPath: elementData.path,
      rect,
      reactComponents: elementData.reactComponents,
    });
    setHoverPosition({ x: e.clientX, y: e.clientY });
  };
  window.addEventListener('mousemove', handleMouseMove, { passive: true });
  return () => {
    window.removeEventListener('mousemove', handleMouseMove);
  };
}, [isActive, effectiveReactMode]);

// 20. Click handler effect (annotation creation)
useEffect(() => {
  if (!isActive) return;
  const handleClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest?.('[data-feedback-toolbar]') ||
        (e.target as HTMLElement).closest?.('[data-annotation-popup]')) {
      return;
    }
    if (editingAnnotationRef.current || pendingAnnotationRef.current) return;

    if (modifiersHeldRef.current.cmd && modifiersHeldRef.current.shift) {
      const el = deepElementFromPoint(e.clientX, e.clientY);
      if (!el || (el as HTMLElement).closest?.('[data-feedback-toolbar]')) return;
      const htmlEl = el as HTMLElement;
      const elementData = identifyElementWithReact(htmlEl, effectiveReactMode);
      setPendingMultiSelectElements((prev) => {
        const alreadySelected = prev.some(item => item.element === htmlEl);
        if (alreadySelected) {
          return prev.filter(item => item.element !== htmlEl);
        }
        return [...prev, {
          element: htmlEl,
          rect: htmlEl.getBoundingClientRect(),
          name: elementData.name,
          path: elementData.path,
          reactComponents: elementData.reactComponents,
        } as typeof prev[number]];
      });
      return;
    }

    const el = deepElementFromPoint(e.clientX, e.clientY);
    if (!el || (el as HTMLElement).closest?.('[data-feedback-toolbar]')) return;
    const htmlEl = el as HTMLElement;
    const elementData = identifyElementWithReact(htmlEl, effectiveReactMode);
    const rect = htmlEl.getBoundingClientRect();
    const isFixed = isElementFixed(htmlEl);
    const selectedText = window.getSelection()?.toString() || undefined;
    const computedStylesObj = getDetailedComputedStyles(htmlEl);
    const sourceFile = detectSourceFile(htmlEl);
    setPendingAnnotation({
      x: (rect.left / window.innerWidth) * 100,
      y: isFixed ? rect.top : rect.top + window.scrollY,
      element: elementData.name,
      elementPath: elementData.path,
      selectedText,
      boundingBox: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      isFixed,
      computedStylesObj,
      computedStyles: JSON.stringify(computedStylesObj),
      reactComponents: elementData.reactComponents,
      sourceFile,
      multiSelectElements: [htmlEl],
      targetElement: htmlEl,
    });
  };
  document.addEventListener('click', handleClick, true);
  return () => {
    document.removeEventListener('click', handleClick, true);
  };
}, [isActive, effectiveReactMode]);

// 21. Keyboard shortcut effect (Esc, P, L, H, C, S, X)
useEffect(() => {
  if (!isActive) return;
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest?.('input, textarea, [contenteditable]')) return;
    switch (e.key) {
      case 'Escape': {
        e.preventDefault();
        if (editingAnnotationRef.current) {
          cancelEditAnnotationRef.current();
        } else if (pendingAnnotationRef.current) {
          cancelAnnotationRef.current();
        } else {
          deactivateRef.current();
        }
        break;
      }
      case 'p':
      case 'P': {
        e.preventDefault();
        toggleFreezeRef.current();
        break;
      }
      case 'l':
      case 'L': {
        e.preventDefault();
        if (isDesignModeRef.current) {
          closeDesignModeRef.current();
        } else {
          setIsDesignMode(true);
        }
        break;
      }
      case 'h':
      case 'H': {
        e.preventDefault();
        setShowMarkers(prev => !prev);
        break;
      }
      case 'c':
      case 'C': {
        e.preventDefault();
        copyOutputRef.current();
        break;
      }
      case 's':
      case 'S': {
        e.preventDefault();
        sendToWebhookRef.current();
        break;
      }
      case 'x':
      case 'X': {
        e.preventDefault();
        clearAllRef.current();
        break;
      }
    }
  };
  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, [isActive]);

// 22. Modifier tracking effect (cmd+shift+click multi-select)
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Meta') modifiersHeldRef.current.cmd = true;
    if (e.key === 'Shift') modifiersHeldRef.current.shift = true;
  };
  const handleKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Meta') modifiersHeldRef.current.cmd = false;
    if (e.key === 'Shift') {
      modifiersHeldRef.current.shift = false;
      const elements = pendingMultiSelectElementsRef.current;
      if (elements.length > 1) {
        const combinedBoundingBox = elements.reduce(
          (acc, item) => ({
            x: Math.min(acc.x, item.rect.left),
            y: Math.min(acc.y, item.rect.top),
            width: Math.max(acc.x + acc.width, item.rect.left + item.rect.width) - Math.min(acc.x, item.rect.left),
            height: Math.max(acc.y + acc.height, item.rect.top + item.rect.height) - Math.min(acc.y, item.rect.top),
          }),
          { x: Infinity, y: Infinity, width: 0, height: 0 }
        );
        const isFixed = elements.some(item => isElementFixed(item.element));
        setPendingAnnotation({
          x: (combinedBoundingBox.x / window.innerWidth) * 100,
          y: isFixed ? combinedBoundingBox.y : combinedBoundingBox.y + window.scrollY,
          element: `${elements.length} elements`,
          elementPath: elements.map(e => e.path).join(', '),
          boundingBox: combinedBoundingBox,
          isMultiSelect: true,
          isFixed,
          multiSelectElements: elements.map(e => e.element),
          targetElement: elements[0].element,
          elementBoundingBoxes: elements.map(e => ({
            x: e.rect.left,
            y: e.rect.top,
            width: e.rect.width,
            height: e.rect.height,
          })),
        });
        setPendingMultiSelectElements([]);
      } else if (elements.length === 1) {
        setPendingMultiSelectElements([]);
      }
    }
  };
  const handleBlur = () => {
    modifiersHeldRef.current.cmd = false;
    modifiersHeldRef.current.shift = false;
  };
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup', handleKeyUp);
  window.addEventListener('blur', handleBlur);
  return () => {
    document.removeEventListener('keydown', handleKeyDown);
    document.removeEventListener('keyup', handleKeyUp);
    window.removeEventListener('blur', handleBlur);
  };
}, []);

// 23. Window resize effect (keep toolbar in view)
useEffect(() => {
  const handleResize = () => {
    const pos = toolbarPositionRef.current;
    const dragging = isDraggingToolbarRef.current;
    if (!pos || dragging) return;
    const maxX = window.innerWidth - 80;
    const maxY = window.innerHeight - 60;
    if (pos.x > maxX || pos.y > maxY) {
      setToolbarPosition({
        x: Math.min(pos.x, maxX),
        y: Math.min(pos.y, maxY),
      });
    }
  };
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);

  // Keyboard shortcuts
  if (!mounted) return null;
  if (isToolbarHidden) return null;
  if (isToolbarHidden) return null;
  // Filter annotations for rendering (exclude exiting ones from normal flow)
  // Helper function to calculate viewport-aware tooltip positioning
  // Helper function to calculate viewport-aware tooltip positioning
  return createPortal(
    <div ref={portalWrapperRef} style={{ display: "contents" }} data-agentation-theme={isDarkMode ? "dark" : "light"} data-agentation-accent={settings.annotationColorId} data-agentation-root="">
      {/* Toolbar */}
      <div
        className={`${styles.toolbar}${userClassName ? ` ${userClassName}` : ""}`}
        data-feedback-toolbar
        data-agentation-toolbar
        style={
          toolbarPosition
            ? {
                left: toolbarPosition.x,
                top: toolbarPosition.y,
                right: "auto",
                bottom: "auto",
              }
            : undefined
        }
      >
        {/* Morphing container */}
        <div
          className={`${styles.toolbarContainer} ${isActive ? styles.expanded : styles.collapsed} ${showEntranceAnimation ? styles.entrance : ""} ${isToolbarHiding ? styles.hiding : ""} ${!settings.webhooksEnabled && (isValidUrl(settings.webhookUrl) || isValidUrl(webhookUrl || "")) ? styles.serverConnected : ""}`}
          onClick={
            !isActive
              ? (e) => {
                  // Don't activate if we just finished dragging
                  if (justFinishedToolbarDragRef.current) {
                    justFinishedToolbarDragRef.current = false;
                    e.preventDefault();
                    return;
                  }
                  setIsActive(true);
                }
              : undefined
          }
          onMouseDown={handleToolbarMouseDown}
          role={!isActive ? "button" : undefined}
          tabIndex={!isActive ? 0 : -1}
          title={!isActive ? "Start feedback mode" : undefined}
        >
          {/* Toggle content - visible when collapsed */}
          <div
            className={`${styles.toggleContent} ${!isActive ? styles.visible : styles.hidden}`}
          >
            <IconListSparkle size={24} />
            {hasVisibleAnnotations && (
              <span
                className={`${styles.badge} ${isActive ? styles.fadeOut : ""} ${showEntranceAnimation ? styles.entrance : ""}`}
              >
                {visibleAnnotations.length}
              </span>
            )}
          </div>

          {/* Controls content - visible when expanded */}
          <div
            className={`${styles.controlsContent} ${isActive ? styles.visible : styles.hidden} ${
              toolbarPosition && toolbarPosition.y < 100
                ? styles.tooltipBelow
                : ""
            } ${tooltipsHidden || showSettings ? styles.tooltipsHidden : ""} ${tooltipSessionActive ? styles.tooltipsInSession : ""}`}
            onMouseEnter={handleControlsMouseEnter}
            onMouseLeave={handleControlsMouseLeave}
          >
            <div
              className={`${styles.buttonWrapper} ${
                toolbarPosition && toolbarPosition.x < 120
                  ? styles.buttonWrapperAlignLeft
                  : ""
              }`}
            >
              <button
                className={styles.controlButton}
                onClick={(e) => {
                  e.stopPropagation();
                  hideTooltipsUntilMouseLeave();
                  toggleFreeze();
                }}
                data-active={isFrozen}
              >
                <IconPausePlayAnimated size={24} isPaused={isFrozen} />
              </button>
              <span className={styles.buttonTooltip}>
                {isFrozen ? "Resume animations" : "Pause animations"}
                <span className={styles.shortcut}>P</span>
              </span>
            </div>

            {/* Draw mode disabled for now
            <div className={styles.buttonWrapper}>
              <button
                className={`${styles.controlButton} ${!isDarkMode ? styles.light : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  hideTooltipsUntilMouseLeave();
                  if (isDesignMode) closeDesignMode();
                  setIsDrawMode(prev => !prev);
                }}
                data-active={isDrawMode}
              >
                <IconPencil size={24} />
              </button>
              <span className={styles.buttonTooltip}>
                {isDrawMode ? "Exit draw mode" : "Draw mode"}
                <span className={styles.shortcut}>D</span>
              </span>
            </div>
            */}

            <div className={styles.buttonWrapper}>
              <button
                className={`${styles.controlButton} ${!isDarkMode ? styles.light : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  hideTooltipsUntilMouseLeave();
                  if (isDrawMode) setIsDrawMode(false);
                  if (showSettings) setShowSettings(false);
                  if (pendingAnnotation) cancelAnnotation();
                  if (isDesignMode) {
                    closeDesignMode();
                  } else {
                    setIsDesignMode(true);
                  }
                }}
                data-active={isDesignMode}
                style={isDesignMode && blankCanvas ? { color: '#f97316', background: 'rgba(249, 115, 22, 0.25)' } : undefined}
              >
                <IconLayout size={21} />
              </button>
              <span className={styles.buttonTooltip}>
                {isDesignMode ? "Exit layout mode" : "Layout mode"}
                <span className={styles.shortcut}>L</span>
              </span>
            </div>

            <div className={styles.buttonWrapper}>
              <button
                className={styles.controlButton}
                onClick={(e) => {
                  e.stopPropagation();
                  hideTooltipsUntilMouseLeave();
                  setShowMarkers(!showMarkers);
                }}
                disabled={!hasAnnotations || isDesignMode}
              >
                <IconEyeAnimated size={24} isOpen={showMarkers} />
              </button>
              <span className={styles.buttonTooltip}>
                {showMarkers ? "Hide markers" : "Show markers"}
                <span className={styles.shortcut}>H</span>
              </span>
            </div>

            <div className={styles.buttonWrapper}>
              <button
                className={`${styles.controlButton} ${copied ? styles.statusShowing : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  hideTooltipsUntilMouseLeave();
                  copyOutput();
                }}
                disabled={isDesignMode && blankCanvas
                  ? designPlacements.length === 0 && !(rearrangeState?.sections?.length)
                  : !hasAnnotations && drawStrokes.length === 0 && designPlacements.length === 0 && !(rearrangeState?.sections?.length)}
                data-active={copied}
              >
                <IconCopyAnimated size={24} copied={copied} tint={isDesignMode && blankCanvas && (designPlacements.length > 0 || !!(rearrangeState?.sections?.length)) ? "#f97316" : undefined} />
              </button>
              <span className={styles.buttonTooltip}>
                {isDesignMode && blankCanvas ? "Copy layout" : "Copy feedback"}
                <span className={styles.shortcut}>C</span>
              </span>
            </div>

            {/* Send button - only visible when webhook URL is available AND auto-send is off */}
            <div
              className={`${styles.buttonWrapper} ${styles.sendButtonWrapper} ${isActive && !settings.webhooksEnabled && (isValidUrl(settings.webhookUrl) || isValidUrl(webhookUrl || "")) ? styles.sendButtonVisible : ""}`}
            >
              <button
                className={`${styles.controlButton} ${sendState === "sent" || sendState === "failed" ? styles.statusShowing : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  hideTooltipsUntilMouseLeave();
                  sendToWebhook();
                }}
                disabled={
                  !hasAnnotations ||
                  (!isValidUrl(settings.webhookUrl) &&
                    !isValidUrl(webhookUrl || "")) ||
                  sendState === "sending"
                }
                data-no-hover={sendState === "sent" || sendState === "failed"}
                tabIndex={
                  isValidUrl(settings.webhookUrl) ||
                  isValidUrl(webhookUrl || "")
                    ? 0
                    : -1
                }
              >
                <IconSendArrow size={24} state={sendState} />
                {hasAnnotations && sendState === "idle" && (
                  <span
                    className={styles.buttonBadge}
                  >
                    {annotations.length}
                  </span>
                )}
              </button>
              <span className={styles.buttonTooltip}>
                Send Annotations
                <span className={styles.shortcut}>S</span>
              </span>
            </div>

            <div className={styles.buttonWrapper}>
              <button
                className={styles.controlButton}
                onClick={(e) => {
                  e.stopPropagation();
                  hideTooltipsUntilMouseLeave();
                  clearAll();
                }}
                disabled={!hasAnnotations && drawStrokes.length === 0 && designPlacements.length === 0 && !(rearrangeState?.sections?.length)}
                data-danger
              >
                <IconTrashAlt size={24} />
              </button>
              <span className={styles.buttonTooltip}>
                Clear all
                <span className={styles.shortcut}>X</span>
              </span>
            </div>

            <div className={styles.buttonWrapper}>
              <button
                className={styles.controlButton}
                onClick={(e) => {
                  e.stopPropagation();
                  hideTooltipsUntilMouseLeave();
                  if (isDesignMode) closeDesignMode();
                  setShowSettings(!showSettings);
                }}
              >
                <IconGear size={24} />
              </button>
              {endpoint && connectionStatus !== "disconnected" && (
                <span
                  className={`${styles.mcpIndicator} ${styles[connectionStatus]} ${showSettings ? styles.hidden : ""}`}
                  title={
                    connectionStatus === "connected"
                      ? "MCP Connected"
                      : "MCP Connecting..."
                  }
                />
              )}
              <span className={styles.buttonTooltip}>Settings</span>
            </div>

            <div
              className={styles.divider}
            />

            <div
              className={`${styles.buttonWrapper} ${
                toolbarPosition &&
                typeof window !== "undefined" &&
                toolbarPosition.x > window.innerWidth - 120
                  ? styles.buttonWrapperAlignRight
                  : ""
              }`}
            >
              <button
                className={styles.controlButton}
                onClick={(e) => {
                  e.stopPropagation();
                  hideTooltipsUntilMouseLeave();
                  deactivate();
                }}
              >
                <IconXmarkLarge size={24} />
              </button>
              <span className={styles.buttonTooltip}>
                Exit
                <span className={styles.shortcut}>Esc</span>
              </span>
            </div>
          </div>

          {/* Layout Mode Palette */}
            <DesignPalette
              visible={isDesignMode && isActive}
              activeType={activeDesignComponent}
              onSelect={(type) => {
                setActiveDesignComponent(activeDesignComponent === type ? null : type);
              }}
              isDarkMode={isDarkMode}
              sectionCount={rearrangeState?.sections.length ?? 0}
              onDetectSections={() => {
                const sections = detectPageSections();
                const existing = rearrangeState?.sections ?? [];
                const existingSelectors = new Set(existing.map(s => s.selector));
                const newSections = sections.filter(s => !existingSelectors.has(s.selector));
                const merged = [...existing, ...newSections];
                const mergedOrder = [...(rearrangeState?.originalOrder ?? []), ...newSections.map(s => s.id)];
                setRearrangeState({
                  sections: merged,
                  originalOrder: mergedOrder,
                  detectedAt: Date.now(),
                });
              }}
              placementCount={designPlacements.length}
              onClearPlacements={() => {
                // Animate placements and rearrange sections out, then clear
                setDesignClearSignal(n => n + 1);
                setRearrangeClearSignal(n => n + 1);
                originalSetTimeout(() => {
                  setRearrangeState({
                    sections: [],
                    originalOrder: [],
                    detectedAt: Date.now(),
                  });
                }, 200);
              }}
              blankCanvas={blankCanvas}
              onBlankCanvasChange={(on) => {
                const emptyRearrange = { sections: [], originalOrder: [], detectedAt: Date.now() };
                if (on) {
                  // Entering wireframe: stash all explore state, restore wireframe state
                  exploreStashRef.current = { rearrange: rearrangeState, placements: designPlacements };
                  setRearrangeState(wireframeStashRef.current.rearrange || emptyRearrange);
                  setDesignPlacements(wireframeStashRef.current.placements);
                  setActiveDesignComponent(null);
                } else {
                  // Leaving wireframe: stash all wireframe state, restore explore state
                  wireframeStashRef.current = { rearrange: rearrangeState, placements: designPlacements };
                  setRearrangeState(exploreStashRef.current.rearrange || emptyRearrange);
                  setDesignPlacements(exploreStashRef.current.placements);
                }
                setBlankCanvas(on);
              }}
              wireframePurpose={wireframePurpose}
              onWireframePurposeChange={setWireframePurpose}
              Tooltip={HelpTooltip}
              onDragStart={(type, e) => {
                e.preventDefault();
                const def = DEFAULT_SIZES[type];
                let preview: HTMLDivElement | null = null;
                let didDrag = false;
                const startX = e.clientX;
                const startY = e.clientY;

                // Find toolbar bottom for distance-based scaling
                const toolbar = (e.target as HTMLElement).closest("[data-feedback-toolbar]");
                const toolbarTop = toolbar?.getBoundingClientRect().top ?? window.innerHeight;

                const onMove = (ev: MouseEvent) => {
                  const dx = ev.clientX - startX;
                  const dy = ev.clientY - startY;

                  if (!didDrag && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
                    didDrag = true;
                    preview = document.createElement("div");
                    preview.className = `${designStyles.dragPreview}${blankCanvas ? ` ${designStyles.dragPreviewWireframe}` : ""}`;
                    document.body.appendChild(preview);
                  }

                  if (!preview) return;

                  // Scale up as cursor moves away from toolbar
                  const dist = Math.max(0, toolbarTop - ev.clientY);
                  const progress = Math.min(1, dist / 180);
                  const eased = 1 - Math.pow(1 - progress, 2); // ease-out

                  const minW = 28;
                  const minH = 20;
                  const maxW = Math.min(140, def.width * 0.18);
                  const maxH = Math.min(90, def.height * 0.18);
                  const w = minW + (maxW - minW) * eased;
                  const h = minH + (maxH - minH) * eased;

                  preview.style.width = `${w}px`;
                  preview.style.height = `${h}px`;
                  preview.style.left = `${ev.clientX - w / 2}px`;
                  preview.style.top = `${ev.clientY - h / 2}px`;
                  preview.style.opacity = `${0.5 + 0.5 * eased}`;
                  preview.textContent = eased > 0.25 ? type : "";
                };

                const onUp = (ev: MouseEvent) => {
                  window.removeEventListener("mousemove", onMove);
                  window.removeEventListener("mouseup", onUp);
                  if (preview) document.body.removeChild(preview);

                  if (didDrag) {
                    const w = def.width;
                    const h = def.height;
                    const scrollY = window.scrollY;
                    const x = Math.max(0, ev.clientX - w / 2);
                    const y = Math.max(0, ev.clientY + scrollY - h / 2);
                    const placement: DesignPlacement = {
                      id: `dp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                      type,
                      x,
                      y,
                      width: w,
                      height: h,
                      scrollY,
                      timestamp: Date.now(),
                    };
                    setDesignPlacements((prev) => [...prev, placement]);
                    setActiveDesignComponent(null);
                    // Deselect any previously selected placements
                    designSelectedIdsRef.current = new Set();
                    setDesignDeselectSignal(n => n + 1);
                  }
                };

                window.addEventListener("mousemove", onMove);
                window.addEventListener("mouseup", onUp);
              }}
            />

          <SettingsPanel
            settings={settings}
            onSettingsChange={(patch) => setSettings((s) => ({ ...s, ...patch }))}
            isDarkMode={isDarkMode}
            onToggleTheme={toggleTheme}
            isDevMode={isDevMode}
            connectionStatus={connectionStatus}
            endpoint={endpoint}
            isVisible={showSettingsVisible}
            toolbarNearBottom={!!toolbarPosition && toolbarPosition.y < 230}
            settingsPage={settingsPage}
            onSettingsPageChange={setSettingsPage}
            onHideToolbar={hideToolbarTemporarily}
          />
        </div>
      </div>

      {/* Blank canvas backdrop — stays mounted so opacity transition works on open/close */}
      {(isDesignMode || designOverlayExiting) && (
        <div
          className={`${designStyles.blankCanvas} ${canvasReady ? designStyles.visible : ""} ${designInteracting ? designStyles.gridActive : ""}`}
          style={{ '--canvas-opacity': canvasOpacity } as React.CSSProperties}
          data-feedback-toolbar
        />
      )}

      {/* Wireframe hint — bottom-left notice */}
      {isDesignMode && blankCanvas && canvasReady && (
        <div className={designStyles.wireframeNotice} data-feedback-toolbar>
          <div className={designStyles.wireframeOpacityRow}>
            <span className={designStyles.wireframeOpacityLabel}>Toggle Opacity</span>
            <input
              type="range"
              className={designStyles.wireframeOpacitySlider}
              min={0}
              max={1}
              step={0.01}
              value={canvasOpacity}
              onChange={(e) => setCanvasOpacity(Number(e.target.value))}
            />
          </div>
          <div className={designStyles.wireframeNoticeTitleRow}>
            <span className={designStyles.wireframeNoticeTitle}>Wireframe Mode</span>
            <span className={designStyles.wireframeNoticeDivider} />
            <button
              className={designStyles.wireframeStartOver}
              onClick={() => {
                setDesignClearSignal(n => n + 1);
                setRearrangeState({ sections: [], originalOrder: [], detectedAt: Date.now() });
                wireframeStashRef.current = { rearrange: null, placements: [] };
                setWireframePurpose("");
                clearWireframeState(pathname);
              }}
            >
              Start Over
            </button>
          </div>
          Drag components onto the canvas.<br />Copied output will only include the wireframed layout.
        </div>
      )}

      {/* Layout mode overlay — passthrough when no component selected */}
      {(isDesignMode || designOverlayExiting) && (
        <DesignMode
          placements={designPlacements}
          onChange={setDesignPlacements}
          activeComponent={designOverlayExiting ? null : activeDesignComponent}
          onActiveComponentChange={setActiveDesignComponent}
          isDarkMode={isDarkMode}
          exiting={designOverlayExiting}
          onInteractionChange={setDesignInteracting}
          passthrough={!activeDesignComponent}
          extraSnapRects={rearrangeState?.sections.map(s => s.currentRect)}
          deselectSignal={designDeselectSignal}
          clearSignal={designClearSignal}
          wireframe={blankCanvas}
          onSelectionChange={(ids, isShift) => {
            designSelectedIdsRef.current = ids;
            if (!isShift) {
              rearrangeSelectedIdsRef.current = new Set();
              setRearrangeDeselectSignal(n => n + 1);
            }
          }}
          onDragMove={(dx, dy) => {
            // Move selected rearrange sections by same delta
            const selIds = rearrangeSelectedIdsRef.current;
            if (!selIds.size || !rearrangeState) return;
            // Cache start positions on first move
            if (!crossDragStartRef.current) {
              crossDragStartRef.current = new Map();
              for (const s of rearrangeState.sections) {
                if (selIds.has(s.id)) {
                  crossDragStartRef.current.set(s.id, { x: s.currentRect.x, y: s.currentRect.y });
                }
              }
            }
            for (const s of rearrangeState.sections) {
              if (!selIds.has(s.id)) continue;
              const start = crossDragStartRef.current.get(s.id);
              if (!start) continue;
              const outlineEl = document.querySelector(`[data-rearrange-section="${s.id}"]`) as HTMLElement | null;
              if (outlineEl) outlineEl.style.transform = `translate(${dx}px, ${dy}px)`;
            }
          }}
          onDragEnd={(dx, dy, committed) => {
            const selIds = rearrangeSelectedIdsRef.current;
            const starts = crossDragStartRef.current;
            crossDragStartRef.current = null;
            if (!selIds.size || !rearrangeState || !starts) return;
            // Clear outline transforms
            for (const id of selIds) {
              const el = document.querySelector(`[data-rearrange-section="${id}"]`) as HTMLElement | null;
              if (el) el.style.transform = "";
            }
            if (committed) {
              setRearrangeState(prev => {
                if (!prev) return prev;
                return {
                  ...prev,
                  sections: prev.sections.map(s => {
                    const start = starts.get(s.id);
                    if (!start) return s;
                    return { ...s, currentRect: { ...s.currentRect, x: Math.max(0, start.x + dx), y: Math.max(0, start.y + dy) } };
                  }),
                };
              });
            }
          }}
        />
      )}

      {/* Rearrange overlay — always active alongside design overlay */}
      {(isDesignMode || designOverlayExiting) && rearrangeState && (
        <RearrangeOverlay
          rearrangeState={rearrangeState}
          onChange={setRearrangeState}
          isDarkMode={isDarkMode}
          exiting={designOverlayExiting}
          blankCanvas={blankCanvas}
          extraSnapRects={designPlacements.map(p => ({ x: p.x, y: p.y, width: p.width, height: p.height }))}
          clearSignal={rearrangeClearSignal}
          deselectSignal={rearrangeDeselectSignal}
          onSelectionChange={(ids, isShift) => {
            rearrangeSelectedIdsRef.current = ids;
            if (!isShift) {
              designSelectedIdsRef.current = new Set();
              setDesignDeselectSignal(n => n + 1);
            }
          }}
          onDragMove={(dx, dy) => {
            // Move selected design placements by same delta
            const selIds = designSelectedIdsRef.current;
            if (!selIds.size) return;
            // Cache start positions on first move
            if (!crossDragStartRef.current) {
              crossDragStartRef.current = new Map();
              for (const p of designPlacements) {
                if (selIds.has(p.id)) {
                  crossDragStartRef.current.set(p.id, { x: p.x, y: p.y });
                }
              }
            }
            // Imperatively move placement divs
            for (const id of selIds) {
              const el = document.querySelector(`[data-design-placement="${id}"]`) as HTMLElement | null;
              if (el) el.style.transform = `translate(${dx}px, ${dy}px)`;
            }
          }}
          onDragEnd={(dx, dy, committed) => {
            const selIds = designSelectedIdsRef.current;
            const starts = crossDragStartRef.current;
            crossDragStartRef.current = null;
            if (!selIds.size || !starts) return;
            // Clear transforms
            for (const id of selIds) {
              const el = document.querySelector(`[data-design-placement="${id}"]`) as HTMLElement | null;
              if (el) el.style.transform = "";
            }
            if (committed) {
              setDesignPlacements(prev => prev.map(p => {
                const start = starts.get(p.id);
                if (!start) return p;
                return { ...p, x: Math.max(0, start.x + dx), y: Math.max(0, start.y + dy) };
              }));
            }
          }}
        />
      )}

      {/* Draw canvas — outside overlay so it can fade on toolbar close */}
      <canvas
        ref={drawCanvasRef}
        className={`${styles.drawCanvas} ${isDrawMode ? styles.active : ""}`}
        style={{ opacity: shouldShowMarkers ? 1 : 0, transition: "opacity 0.15s ease" }}
        data-feedback-toolbar
      />

      {/* Markers layer - normal scrolling markers */}
      <div className={styles.markersLayer} data-feedback-toolbar>
        {markersVisible &&
          visibleAnnotations
            .filter((a) => !a.isFixed)
            .map((annotation, layerIndex, arr) => (
              <AnnotationMarker
                key={annotation.id}
                annotation={annotation}
                globalIndex={visibleAnnotations.findIndex((a) => a.id === annotation.id)}
                layerIndex={layerIndex}
                layerSize={arr.length}
                isExiting={markersExiting}
                isClearing={isClearing}
                isAnimated={animatedMarkers.has(annotation.id)}
                isHovered={!markersExiting && hoveredMarkerId === annotation.id}
                isDeleting={deletingMarkerId === annotation.id}
                isEditingAny={!!editingAnnotation}
                renumberFrom={renumberFrom}
                markerClickBehavior={settings.markerClickBehavior}
                tooltipStyle={getTooltipPosition(annotation)}
                onHoverEnter={(a) =>
                  !markersExiting &&
                  a.id !== recentlyAddedIdRef.current &&
                  handleMarkerHover(a)
                }
                onHoverLeave={() => handleMarkerHover(null)}
                onClick={(a) =>
                  settings.markerClickBehavior === "delete"
                    ? deleteAnnotation(a.id)
                    : startEditAnnotation(a)
                }
                onContextMenu={startEditAnnotation}
              />
            ))}
        {markersVisible &&
          !markersExiting &&
          exitingAnnotationsList
            .filter((a) => !a.isFixed)
            .map((a) => <ExitingMarker key={a.id} annotation={a} />)}
      </div>

      {/* Fixed markers layer */}
      <div className={styles.fixedMarkersLayer} data-feedback-toolbar>
        {markersVisible &&
          visibleAnnotations
            .filter((a) => a.isFixed)
            .map((annotation, layerIndex, arr) => (
              <AnnotationMarker
                key={annotation.id}
                annotation={annotation}
                globalIndex={visibleAnnotations.findIndex((a) => a.id === annotation.id)}
                layerIndex={layerIndex}
                layerSize={arr.length}
                isExiting={markersExiting}
                isClearing={isClearing}
                isAnimated={animatedMarkers.has(annotation.id)}
                isHovered={!markersExiting && hoveredMarkerId === annotation.id}
                isDeleting={deletingMarkerId === annotation.id}
                isEditingAny={!!editingAnnotation}
                renumberFrom={renumberFrom}
                markerClickBehavior={settings.markerClickBehavior}
                tooltipStyle={getTooltipPosition(annotation)}
                onHoverEnter={(a) =>
                  !markersExiting &&
                  a.id !== recentlyAddedIdRef.current &&
                  handleMarkerHover(a)
                }
                onHoverLeave={() => handleMarkerHover(null)}
                onClick={(a) =>
                  settings.markerClickBehavior === "delete"
                    ? deleteAnnotation(a.id)
                    : startEditAnnotation(a)
                }
                onContextMenu={startEditAnnotation}
              />
            ))}
        {markersVisible &&
          !markersExiting &&
          exitingAnnotationsList
            .filter((a) => a.isFixed)
            .map((a) => <ExitingMarker key={a.id} annotation={a} fixed />)}
      </div>


      {/* Interactive overlay */}
      {isActive && (
        <div
          className={styles.overlay}
          data-feedback-toolbar
          style={
            pendingAnnotation || editingAnnotation
              ? { zIndex: 99999 }
              : undefined
          }
        >
          {/* Hover highlight */}
          {hoverInfo?.rect &&
            !pendingAnnotation &&
            !isScrolling &&
            !isDragging && (
              <div
                className={`${styles.hoverHighlight} ${styles.enter}`}
                style={{
                  left: hoverInfo.rect.left,
                  top: hoverInfo.rect.top,
                  width: hoverInfo.rect.width,
                  height: hoverInfo.rect.height,
                  borderColor: "color-mix(in srgb, var(--agentation-color-accent) 50%, transparent)",
                  backgroundColor: "color-mix(in srgb, var(--agentation-color-accent) 4%, transparent)",
                }}
              />
            )}

          {/* Cmd+shift+click multi-select highlights (during selection, before releasing modifiers) */}
          {pendingMultiSelectElements
            .filter((item) => document.contains(item.element))
            .map((item, index) => {
              const rect = item.element.getBoundingClientRect();
              // Only show green if 2+ elements selected, otherwise use default blue
              const isMulti = pendingMultiSelectElements.length > 1;
              return (
                <div
                  key={index}
                  className={
                    isMulti
                      ? styles.multiSelectOutline
                      : styles.singleSelectOutline
                  }
                  style={{
                    position: "fixed",
                    left: rect.left,
                    top: rect.top,
                    width: rect.width,
                    height: rect.height,
                    ...(isMulti
                      ? {}
                      : {
                          borderColor: "color-mix(in srgb, var(--agentation-color-accent) 60%, transparent)",
                          backgroundColor: "color-mix(in srgb, var(--agentation-color-accent) 5%, transparent)",
                        }),
                  }}
                />
              );
            })}

          {/* Marker hover outline (shows bounding box of hovered annotation) */}
          {hoveredMarkerId &&
            !pendingAnnotation &&
            (() => {
              const hoveredAnnotation = annotations.find(
                (a) => a.id === hoveredMarkerId,
              );
              if (!hoveredAnnotation?.boundingBox) return null;

              // Render individual element boxes if available (cmd+shift+click multi-select)
              if (hoveredAnnotation.elementBoundingBoxes?.length) {
                // Use live positions from hoveredTargetElements when available
                if (hoveredTargetElements.length > 0) {
                  return hoveredTargetElements
                    .filter((el) => document.contains(el))
                    .map((el, index) => {
                      const rect = el.getBoundingClientRect();
                      return (
                        <div
                          key={`hover-outline-live-${index}`}
                          className={`${styles.multiSelectOutline} ${styles.enter}`}
                          style={{
                            left: rect.left,
                            top: rect.top,
                            width: rect.width,
                            height: rect.height,
                          }}
                        />
                      );
                    });
                }
                // Fallback to stored bounding boxes
                return hoveredAnnotation.elementBoundingBoxes.map(
                  (bb, index) => (
                    <div
                      key={`hover-outline-${index}`}
                      className={`${styles.multiSelectOutline} ${styles.enter}`}
                      style={{
                        left: bb.x,
                        top: bb.y - scrollY,
                        width: bb.width,
                        height: bb.height,
                      }}
                    />
                  ),
                );
              }

              // Single element: use live position from hoveredTargetElement when available
              const rect =
                hoveredTargetElement && document.contains(hoveredTargetElement)
                  ? hoveredTargetElement.getBoundingClientRect()
                  : null;

              const bb = rect
                ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
                : {
                    x: hoveredAnnotation.boundingBox.x,
                    y: hoveredAnnotation.isFixed
                      ? hoveredAnnotation.boundingBox.y
                      : hoveredAnnotation.boundingBox.y - scrollY,
                    width: hoveredAnnotation.boundingBox.width,
                    height: hoveredAnnotation.boundingBox.height,
                  };

              const isMulti = hoveredAnnotation.isMultiSelect;
              return (
                <div
                  className={`${isMulti ? styles.multiSelectOutline : styles.singleSelectOutline} ${styles.enter}`}
                  style={{
                    left: bb.x,
                    top: bb.y,
                    width: bb.width,
                    height: bb.height,
                    ...(isMulti
                      ? {}
                      : {
                          borderColor: "color-mix(in srgb, var(--agentation-color-accent) 60%, transparent)",
                          backgroundColor: "color-mix(in srgb, var(--agentation-color-accent) 5%, transparent)",
                        }),
                  }}
                />
              );
            })()}

          {/* Hover tooltip */}
          {hoverInfo && !pendingAnnotation && !isScrolling && !isDragging && (
            <div
              className={`${styles.hoverTooltip} ${styles.enter}`}
              style={{
                left: Math.max(
                  8,
                  Math.min(hoverPosition.x, window.innerWidth - 100),
                ),
                top: Math.max(
                  hoverPosition.y - (hoverInfo.reactComponents ? 48 : 32),
                  8,
                ),
              }}
            >
              {hoverInfo.reactComponents && (
                <div className={styles.hoverReactPath}>
                  {hoverInfo.reactComponents}
                </div>
              )}
              <div className={styles.hoverElementName}>
                {hoverInfo.elementName}
              </div>
            </div>
          )}

          {/* Pending annotation marker + popup */}
          {pendingAnnotation && (
            <>
              {/* Show element/area outline while adding annotation */}
              {pendingAnnotation.multiSelectElements?.length
                ? // Cmd+shift+click multi-select: show individual boxes with live positions
                  pendingAnnotation.multiSelectElements
                    .filter((el) => document.contains(el))
                    .map((el, index) => {
                      const rect = el.getBoundingClientRect();
                      return (
                        <div
                          key={`pending-multi-${index}`}
                          className={`${styles.multiSelectOutline} ${pendingExiting ? styles.exit : styles.enter}`}
                          style={{
                            left: rect.left,
                            top: rect.top,
                            width: rect.width,
                            height: rect.height,
                          }}
                        />
                      );
                    })
                : // Single element or drag multi-select: show single box
                  pendingAnnotation.targetElement &&
                  document.contains(pendingAnnotation.targetElement)
                    ? // Single-click: use live getBoundingClientRect for consistent positioning
                      (() => {
                        const rect =
                          pendingAnnotation.targetElement!.getBoundingClientRect();
                        return (
                          <div
                            className={`${styles.singleSelectOutline} ${pendingExiting ? styles.exit : styles.enter}`}
                            style={{
                              left: rect.left,
                              top: rect.top,
                              width: rect.width,
                              height: rect.height,
                              borderColor: "color-mix(in srgb, var(--agentation-color-accent) 60%, transparent)",
                              backgroundColor: "color-mix(in srgb, var(--agentation-color-accent) 5%, transparent)",
                            }}
                          />
                        );
                      })()
                    : // Drag selection or fallback: use stored boundingBox
                      pendingAnnotation.boundingBox && (
                        <div
                          className={`${pendingAnnotation.isMultiSelect ? styles.multiSelectOutline : styles.singleSelectOutline} ${pendingExiting ? styles.exit : styles.enter}`}
                          style={{
                            left: pendingAnnotation.boundingBox.x,
                            top: pendingAnnotation.boundingBox.y - scrollY,
                            width: pendingAnnotation.boundingBox.width,
                            height: pendingAnnotation.boundingBox.height,
                            ...(pendingAnnotation.isMultiSelect
                              ? {}
                              : {
                                  borderColor: "color-mix(in srgb, var(--agentation-color-accent) 60%, transparent)",
                                  backgroundColor: "color-mix(in srgb, var(--agentation-color-accent) 5%, transparent)",
                                }),
                          }}
                        />
                      )}

              {(() => {
                // Use stored coordinates - they match what will be saved
                const markerX = pendingAnnotation.x;
                const markerY = pendingAnnotation.isFixed
                  ? pendingAnnotation.y
                  : pendingAnnotation.y - scrollY;

                return (
                  <>
                    <PendingMarker
                      x={markerX}
                      y={markerY}
                      isMultiSelect={pendingAnnotation.isMultiSelect}
                      isExiting={pendingExiting}
                    />

                    <AnnotationPopupCSS
                      ref={popupRef}
                      element={pendingAnnotation.element}
                      selectedText={pendingAnnotation.selectedText}
                      computedStyles={pendingAnnotation.computedStylesObj}
                      placeholder={
                        pendingAnnotation.element === "Area selection"
                          ? "What should change in this area?"
                          : pendingAnnotation.isMultiSelect
                            ? "Feedback for this group of elements..."
                            : "What should change?"
                      }
                      onSubmit={addAnnotation}
                      onCancel={cancelAnnotation}
                      isExiting={pendingExiting}
                      lightMode={!isDarkMode}
                      accentColor={
                        pendingAnnotation.isMultiSelect
                          ? "var(--agentation-color-green)"
                          : "var(--agentation-color-accent)"
                      }
                      style={{
                        // Popup is 280px wide, centered with translateX(-50%), so 140px each side
                        // Clamp so popup stays 20px from viewport edges
                        left: Math.max(
                          160,
                          Math.min(
                            window.innerWidth - 160,
                            (markerX / 100) * window.innerWidth,
                          ),
                        ),
                        // Position popup above or below marker to keep marker visible
                        ...(markerY > window.innerHeight - 290
                          ? { bottom: window.innerHeight - markerY + 20 }
                          : { top: markerY + 20 }),
                      }}
                    />
                  </>
                );
              })()}
            </>
          )}

          {/* Edit annotation popup */}
          {editingAnnotation && (
            <>
              {/* Show element/area outline while editing */}
              {editingAnnotation.elementBoundingBoxes?.length
                ? // Cmd+shift+click: show individual element boxes (use live rects when available)
                  (() => {
                    // Use live positions from editingTargetElements when available
                    if (editingTargetElements.length > 0) {
                      return editingTargetElements
                        .filter((el) => document.contains(el))
                        .map((el, index) => {
                          const rect = el.getBoundingClientRect();
                          return (
                            <div
                              key={`edit-multi-live-${index}`}
                              className={`${styles.multiSelectOutline} ${styles.enter}`}
                              style={{
                                left: rect.left,
                                top: rect.top,
                                width: rect.width,
                                height: rect.height,
                              }}
                            />
                          );
                        });
                    }
                    // Fallback to stored bounding boxes
                    return editingAnnotation.elementBoundingBoxes!.map(
                      (bb, index) => (
                        <div
                          key={`edit-multi-${index}`}
                          className={`${styles.multiSelectOutline} ${styles.enter}`}
                          style={{
                            left: bb.x,
                            top: bb.y - scrollY,
                            width: bb.width,
                            height: bb.height,
                          }}
                        />
                      ),
                    );
                  })()
                : // Single element or drag multi-select: show single box
                  (() => {
                    // Use live position from editingTargetElement when available
                    const rect =
                      editingTargetElement &&
                      document.contains(editingTargetElement)
                        ? editingTargetElement.getBoundingClientRect()
                        : null;

                    const bb = rect
                      ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
                      : editingAnnotation.boundingBox
                        ? {
                            x: editingAnnotation.boundingBox.x,
                            y: editingAnnotation.isFixed
                              ? editingAnnotation.boundingBox.y
                              : editingAnnotation.boundingBox.y - scrollY,
                            width: editingAnnotation.boundingBox.width,
                            height: editingAnnotation.boundingBox.height,
                          }
                        : null;

                    if (!bb) return null;

                    return (
                      <div
                        className={`${editingAnnotation.isMultiSelect ? styles.multiSelectOutline : styles.singleSelectOutline} ${styles.enter}`}
                        style={{
                          left: bb.x,
                          top: bb.y,
                          width: bb.width,
                          height: bb.height,
                          ...(editingAnnotation.isMultiSelect
                            ? {}
                            : {
                                borderColor: "color-mix(in srgb, var(--agentation-color-accent) 60%, transparent)",
                                backgroundColor: "color-mix(in srgb, var(--agentation-color-accent) 5%, transparent)",
                              }),
                        }}
                      />
                    );
                  })()}

              <AnnotationPopupCSS
                ref={editPopupRef}
                element={editingAnnotation.element}
                selectedText={editingAnnotation.selectedText}
                computedStyles={parseComputedStylesString(
                  editingAnnotation.computedStyles,
                )}
                placeholder="Edit your feedback..."
                initialValue={editingAnnotation.comment}
                submitLabel="Save"
                onSubmit={updateAnnotation}
                onCancel={cancelEditAnnotation}
                onDelete={() => deleteAnnotation(editingAnnotation.id)}
                isExiting={editExiting}
                lightMode={!isDarkMode}
                accentColor={
                  editingAnnotation.isMultiSelect
                    ? "var(--agentation-color-green)"
                    : "var(--agentation-color-accent)"
                }
                style={(() => {
                  const markerY = editingAnnotation.isFixed
                    ? editingAnnotation.y
                    : editingAnnotation.y - scrollY;
                  return {
                    // Popup is 280px wide, centered with translateX(-50%), so 140px each side
                    // Clamp so popup stays 20px from viewport edges
                    left: Math.max(
                      160,
                      Math.min(
                        window.innerWidth - 160,
                        (editingAnnotation.x / 100) * window.innerWidth,
                      ),
                    ),
                    // Position popup above or below marker to keep marker visible
                    ...(markerY > window.innerHeight - 290
                      ? { bottom: window.innerHeight - markerY + 20 }
                      : { top: markerY + 20 }),
                  };
                })()}
              />
            </>
          )}

          {/* Drag selection - all visuals use refs for smooth 60fps */}
          {isDragging && (
            <>
              <div ref={dragRectRef} className={styles.dragSelection} />
              <div
                ref={highlightsContainerRef}
                className={styles.highlightsContainer}
              />
            </>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}

export default PageFeedbackToolbarCSS;
