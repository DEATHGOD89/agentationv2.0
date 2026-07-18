// =============================================================================
// Shared Types (imported from agentation package)
// =============================================================================

import type {
  Annotation,
  AnnotationIntent,
  AnnotationSeverity,
  AnnotationStatus,
  Session,
  SessionStatus,
  SessionWithAnnotations,
  ThreadMessage,
} from "agentation";

export type {
  Annotation,
  AnnotationIntent,
  AnnotationSeverity,
  AnnotationStatus,
  Session,
  SessionStatus,
  SessionWithAnnotations,
  ThreadMessage,
};

// -----------------------------------------------------------------------------
// Events (for real-time streaming)
// -----------------------------------------------------------------------------

export type AFSEventType =
  | "annotation.created"
  | "annotation.updated"
  | "annotation.deleted"
  | "session.created"
  | "session.updated"
  | "session.closed"
  | "thread.message"
  | "action.requested";

export type ActionRequest = {
  sessionId: string;
  annotations: Annotation[];
  output: string; // Pre-formatted markdown output
  timestamp: string;
};

export type AFSEvent = {
  type: AFSEventType;
  timestamp: string; // ISO 8601
  sessionId: string;
  sequence: number; // Monotonic for ordering/dedup/replay
  payload: Annotation | Session | ThreadMessage | ActionRequest;
};

// -----------------------------------------------------------------------------
// Multi-Tenant Types
// -----------------------------------------------------------------------------

export type Organization = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
};

export type UserRole = "owner" | "admin" | "member";

export type User = {
  id: string;
  email: string;
  orgId: string;
  role: UserRole;
  createdAt: string;
  updatedAt?: string;
};

export type ApiKey = {
  id: string;
  keyPrefix: string; // First 8 chars for display (e.g., "sk_live_a")
  keyHash: string; // SHA-256 hash of full key
  userId: string;
  name: string;
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
};

export type UserContext = {
  userId: string;
  orgId: string;
  email?: string;
  role?: UserRole;
};

// -----------------------------------------------------------------------------
// Store Interface
// -----------------------------------------------------------------------------

export interface AFSStore {
  // Sessions
  createSession(url: string, projectId?: string): Session;
  getSession(id: string): Session | undefined;
  getSessionWithAnnotations(id: string): SessionWithAnnotations | undefined;
  updateSessionStatus(id: string, status: SessionStatus): Session | undefined;
  listSessions(): Session[];

  // Annotations
  addAnnotation(
    sessionId: string,
    data: Omit<Annotation, "id" | "sessionId" | "status" | "createdAt">
  ): Annotation | undefined;
  getAnnotation(id: string): Annotation | undefined;
  updateAnnotation(
    id: string,
    data: Partial<Omit<Annotation, "id" | "sessionId" | "createdAt">>
  ): Annotation | undefined;
  updateAnnotationStatus(
    id: string,
    status: AnnotationStatus,
    resolvedBy?: "human" | "agent"
  ): Annotation | undefined;
  addThreadMessage(
    annotationId: string,
    role: "human" | "agent",
    content: string
  ): Annotation | undefined;
  getPendingAnnotations(sessionId: string): Annotation[];
  getSessionAnnotations(sessionId: string): Annotation[];
  deleteAnnotation(id: string): Annotation | undefined;

  // Events (for replay on reconnect)
  getEventsSince(sessionId: string, sequence: number): AFSEvent[];

  // Lifecycle
  close(): void;
}

// -----------------------------------------------------------------------------
// Universal Context Types (for project scanning / multi-source AI context)
// -----------------------------------------------------------------------------

import type { ProjectScanResult } from "./scanner/types.js";

export type ContextSource = "web" | "cli" | "mobile" | "desktop" | "backend" | "infra" | "db";

export type UniversalContext = {
  source: ContextSource;
  timestamp: string;
  sessionId?: string;
  project?: ProjectScanResult;
  annotations?: Annotation[];
};
