/**
 * LinearSyncEngine — main orchestrator for bidirectional Linear sync.
 * Ties together the poller, outbound queue, and inbound/outbound handlers
 * into a single start/stop service.
 */

import { EventEmitter } from 'events';
import type { SyncEngineConfig, SyncState, SyncEngineStatus, OutboundEvent } from './types';
import { LinearGraphQLClient } from './linear-api';
import { OutboundQueue } from './outbound-queue';
import { loadSyncState, saveSyncState, getDefaultSyncState } from './sync-state';
import { pollOnce } from './poller';
import { applyInboundChanges } from './inbound-handlers';
import { STALE_SYNC_HOURS, QUEUE_FLUSH_INTERVAL_MS, MILESTONE_EVENT_TYPES } from './constants';

interface EnqueueParams {
  type: OutboundEvent['type'];
  issueId: string;
  issueIdentifier: string;
  targetState?: string;
  body?: string;
}

export class LinearSyncEngine extends EventEmitter {
  private config: SyncEngineConfig;
  private specsDir: string;
  private client: LinearGraphQLClient;
  private outboundQueue: OutboundQueue;
  private syncState: SyncState;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private _isRunning = false;

  constructor(config: SyncEngineConfig, specsDir: string) {
    super();
    this.config = config;
    this.specsDir = specsDir;
    this.client = new LinearGraphQLClient(config.apiKey);
    this.outboundQueue = new OutboundQueue(config.autoBuildPath, this.client, config.teamId);
    this.syncState = getDefaultSyncState();
    if (config.pollIntervalMs) this.syncState.pollIntervalMs = config.pollIntervalMs;
    if (config.verbosity) this.syncState.verbosity = config.verbosity;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  async start(): Promise<void> {
    if (this._isRunning) return;

    // Load persisted state and queue
    this.syncState = loadSyncState(this.config.autoBuildPath);
    this.outboundQueue.load();

    // Apply config overrides
    if (this.config.pollIntervalMs) this.syncState.pollIntervalMs = this.config.pollIntervalMs;
    if (this.config.verbosity) this.syncState.verbosity = this.config.verbosity;

    // Initialize lastSyncAt on first start
    if (!this.syncState.lastSyncAt) {
      this.syncState.lastSyncAt = new Date().toISOString();
      saveSyncState(this.config.autoBuildPath, this.syncState);
    }

    // Reset stale sync cursor to avoid fetching a huge backlog
    if (this.syncState.lastSyncAt) {
      const hoursAgo =
        (Date.now() - new Date(this.syncState.lastSyncAt).getTime()) / (1000 * 60 * 60);
      if (hoursAgo > STALE_SYNC_HOURS) {
        this.syncState.lastSyncAt = new Date().toISOString();
      }
    }

    this._isRunning = true;
    this.pollTimer = setInterval(() => this.pollCycle(), this.syncState.pollIntervalMs);
    this.flushTimer = setInterval(() => this.flushOutbound(), QUEUE_FLUSH_INTERVAL_MS);

    // Run first poll immediately
    this.pollCycle();
    this.emit('started');
  }

  async stop(): Promise<void> {
    if (!this._isRunning) return;
    this._isRunning = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Best-effort flush before shutdown
    try {
      await this.outboundQueue.flush();
    } catch {
      /* best effort */
    }

    saveSyncState(this.config.autoBuildPath, this.syncState);
    this.outboundQueue.persist();
    this.emit('stopped');
  }

  getStatus(): SyncEngineStatus {
    return {
      running: this._isRunning,
      lastSyncAt: this.syncState.lastSyncAt,
      issueCount: Object.keys(this.syncState.issueMap).length,
      pendingOutbound: this.outboundQueue.pendingCount,
      deadLetterCount: this.outboundQueue.deadLetterCount,
    };
  }

  /** Enqueue an outbound event, respecting the verbosity setting. */
  enqueueOutbound(params: EnqueueParams): void {
    // status_change always goes through regardless of verbosity
    if (params.type !== 'status_change') {
      if (this.syncState.verbosity === 'none') return;
      if (this.syncState.verbosity === 'milestones' && !MILESTONE_EVENT_TYPES.has(params.type)) {
        return;
      }
    }
    this.outboundQueue.enqueue(params);
  }

  /** Remove all pending outbound events for a given issue (e.g. on cancel). */
  discardOutboundForIssue(issueId: string): void {
    this.outboundQueue.discardForIssue(issueId);
  }

  /** Look up the issue mapping for a Linear identifier (e.g. "LIN-42"). */
  getIssueMapping(identifier: string) {
    return this.syncState.issueMap[identifier];
  }

  /** Return a shallow copy of all issue mappings. */
  getIssueMappings() {
    return { ...this.syncState.issueMap };
  }

  // ---------------------------------------------------------------------------
  // Internal cycles
  // ---------------------------------------------------------------------------

  private async pollCycle(): Promise<void> {
    if (!this._isRunning) return;
    try {
      const { changes } = await pollOnce(
        this.client,
        this.config.teamId,
        this.config.projectId,
        this.syncState,
      );

      if (changes.length > 0) {
        const result = await applyInboundChanges(
          changes,
          this.syncState,
          this.config.autoBuildPath,
          this.specsDir,
        );

        for (const change of changes) {
          if (change.type === 'issue_canceled' || change.type === 'issue_deleted') {
            this.discardOutboundForIssue(change.issueId);
            this.emit('issue-canceled', change.issueIdentifier, change.issueId);
          }
        }

        this.emit('sync-cycle-complete', result);
      }

      this.syncState.lastSyncAt = new Date().toISOString();
      saveSyncState(this.config.autoBuildPath, this.syncState);
    } catch (error) {
      this.emit('sync-error', error instanceof Error ? error.message : String(error));
    }
  }

  private async flushOutbound(): Promise<void> {
    if (!this._isRunning) return;
    try {
      await this.outboundQueue.flush();
      this.outboundQueue.persist();
    } catch (error) {
      this.emit('flush-error', error instanceof Error ? error.message : String(error));
    }
  }
}
