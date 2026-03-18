/**
 * Types for the Linear bidirectional sync engine.
 */

import type { LinearIssue, LinearComment } from '../../shared/types/integrations';

/** Verbosity levels for outbound comment posting */
export type SyncVerbosity = 'all' | 'milestones' | 'none';

/** Mapping of a single Linear issue to its Aperant task */
export interface IssueMapping {
  taskSpecNumber: string;
  linearIssueId: string;
  lastSeenUpdatedAt: string;
  lastSeenTitle?: string;
  knownCommentIds: string[];
  linearState: string;
  aperantStatus: string;
  archived?: boolean;
}

/** Persisted sync state (sync_state.json) */
export interface SyncState {
  lastSyncAt: string | null;
  pollIntervalMs: number;
  verbosity: SyncVerbosity;
  issueMap: Record<string, IssueMapping>;
}

/** Types of inbound changes detected by the poller */
export type InboundChangeType =
  | 'new_issue'
  | 'new_comments'
  | 'issue_deleted'
  | 'issue_canceled'
  | 'title_changed'
  | 'description_changed'
  | 'labels_changed'
  | 'assignee_changed'
  | 'status_changed';

/** A single inbound change detected by the poller */
export interface InboundChange {
  type: InboundChangeType;
  issueIdentifier: string;
  issueId: string;
  issue: LinearIssue;
  newComments?: LinearComment[];
  previousValue?: string;
  newValue?: string;
}

/** Types of outbound events to push to Linear */
export type OutboundEventType =
  | 'status_change'
  | 'agent_progress'
  | 'pr_created'
  | 'qa_result'
  | 'spec_ready'
  | 'agent_error'
  | 'create_issue';

/** A single outbound event in the queue */
export interface OutboundEvent {
  id: string;
  type: OutboundEventType;
  issueId: string;
  issueIdentifier: string;
  targetState?: string;
  body?: string;
  retries: number;
  createdAt: string;
  deadLetterAt?: string;
}

/** Persisted outbound queue (outbound_queue.json) */
export interface OutboundQueueState {
  pending: OutboundEvent[];
  deadLetter: OutboundEvent[];
}

/** Config passed to the sync engine on start */
export interface SyncEngineConfig {
  projectPath: string;
  autoBuildPath: string;
  apiKey: string;
  teamId: string;
  projectId?: string;
  pollIntervalMs?: number;
  verbosity?: SyncVerbosity;
}

/** Status of the sync engine (exposed to renderer) */
export interface SyncEngineStatus {
  running: boolean;
  lastSyncAt: string | null;
  issueCount: number;
  pendingOutbound: number;
  deadLetterCount: number;
  lastError?: string;
}
