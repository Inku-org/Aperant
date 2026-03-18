/**
 * Outbound event queue for pushing Aperant events to Linear.
 * Handles deduplication, retry with backoff, rate limiting, and persistence.
 */

import crypto from 'crypto';
import type { OutboundEvent, OutboundQueueState } from './types';
import type { LinearGraphQLClient } from './linear-api';
import { loadOutboundQueue, saveOutboundQueue } from './sync-state';
import { MAX_RETRIES, RATE_LIMIT_THRESHOLD } from './constants';

interface EnqueueParams {
  type: OutboundEvent['type'];
  issueId: string;
  issueIdentifier: string;
  targetState?: string;
  body?: string;
}

export class OutboundQueue {
  private state: OutboundQueueState;
  private autoBuildPath: string;
  private client: LinearGraphQLClient;
  private teamId: string;

  constructor(autoBuildPath: string, client: LinearGraphQLClient, teamId: string) {
    this.autoBuildPath = autoBuildPath;
    this.client = client;
    this.teamId = teamId;
    this.state = { pending: [], deadLetter: [] };
  }

  get pendingCount(): number {
    return this.state.pending.length;
  }

  get deadLetterCount(): number {
    return this.state.deadLetter.length;
  }

  load(): void {
    this.state = loadOutboundQueue(this.autoBuildPath);
  }

  persist(): void {
    saveOutboundQueue(this.autoBuildPath, this.state);
  }

  enqueue(params: EnqueueParams): void {
    if (params.type === 'status_change') {
      const existing = this.state.pending.find(
        (e) =>
          e.type === 'status_change' &&
          e.issueId === params.issueId &&
          e.targetState === params.targetState,
      );
      if (existing) return;
    }

    const event: OutboundEvent = {
      id: crypto.randomUUID(),
      type: params.type,
      issueId: params.issueId,
      issueIdentifier: params.issueIdentifier,
      targetState: params.targetState,
      body: params.body,
      retries: 0,
      createdAt: new Date().toISOString(),
    };
    this.state.pending.push(event);
  }

  discardForIssue(issueId: string): void {
    this.state.pending = this.state.pending.filter((e) => e.issueId !== issueId);
  }

  async flush(): Promise<void> {
    if (
      this.client.lastRateLimitRemaining !== null &&
      this.client.lastRateLimitRemaining < RATE_LIMIT_THRESHOLD
    ) {
      return;
    }

    const toProcess = [...this.state.pending];
    const remaining: OutboundEvent[] = [];

    for (const event of toProcess) {
      try {
        await this.processEvent(event);
      } catch {
        event.retries++;
        if (event.retries > MAX_RETRIES) {
          event.deadLetterAt = new Date().toISOString();
          this.state.deadLetter.push(event);
        } else {
          remaining.push(event);
        }
      }
    }
    this.state.pending = remaining;
  }

  private async processEvent(event: OutboundEvent): Promise<void> {
    switch (event.type) {
      case 'status_change':
        if (event.targetState) {
          await this.client.updateIssueState(event.issueId, this.teamId, event.targetState);
        }
        break;
      case 'agent_progress':
      case 'qa_result':
      case 'pr_created':
      case 'spec_ready':
      case 'agent_error':
        if (event.body) {
          await this.client.postComment(event.issueId, event.body);
        }
        break;
      case 'create_issue':
        break;
    }
  }
}
