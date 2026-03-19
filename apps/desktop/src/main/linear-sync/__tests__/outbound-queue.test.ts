import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { OutboundQueue } from '../outbound-queue';
import type { LinearGraphQLClient } from '../linear-api';

function makeMockClient(): LinearGraphQLClient {
  return {
    postComment: vi.fn().mockResolvedValue({ success: true }),
    updateIssueState: vi.fn().mockResolvedValue({ success: true }),
    createIssue: vi
      .fn()
      .mockResolvedValue({
        success: true,
        issue: { id: 'new1', identifier: 'LIN-99', url: 'https://linear.app/issue/LIN-99' },
      }),
    lastRateLimitRemaining: 1400,
  } as any;
}

describe('OutboundQueue', () => {
  let tmpDir: string;
  let queue: OutboundQueue;
  let mockClient: LinearGraphQLClient;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outbound-test-'));
    mockClient = makeMockClient();
    queue = new OutboundQueue(tmpDir, mockClient, 'team1');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('enqueues and flushes a comment event', async () => {
    queue.enqueue({
      type: 'agent_progress',
      issueId: 'issue1',
      issueIdentifier: 'LIN-1',
      body: '[Aperant] Planner started',
    });
    expect(queue.pendingCount).toBe(1);
    await queue.flush();
    expect(queue.pendingCount).toBe(0);
    expect(mockClient.postComment).toHaveBeenCalledWith('issue1', '[Aperant] Planner started');
  });

  it('enqueues and flushes a status change', async () => {
    queue.enqueue({
      type: 'status_change',
      issueId: 'issue1',
      issueIdentifier: 'LIN-1',
      targetState: 'completed',
    });
    await queue.flush();
    expect(mockClient.updateIssueState).toHaveBeenCalledWith('issue1', 'team1', 'completed');
  });

  it('deduplicates identical status changes', () => {
    queue.enqueue({
      type: 'status_change',
      issueId: 'issue1',
      issueIdentifier: 'LIN-1',
      targetState: 'started',
    });
    queue.enqueue({
      type: 'status_change',
      issueId: 'issue1',
      issueIdentifier: 'LIN-1',
      targetState: 'started',
    });
    expect(queue.pendingCount).toBe(1);
  });

  it('retries failed events', async () => {
    (mockClient.postComment as any).mockRejectedValueOnce(new Error('Network error'));
    queue.enqueue({
      type: 'agent_progress',
      issueId: 'issue1',
      issueIdentifier: 'LIN-1',
      body: '[Aperant] test',
    });
    await queue.flush();
    expect(queue.pendingCount).toBe(1); // Still pending with retry count incremented
  });

  it('moves to dead letter after max retries', async () => {
    (mockClient.postComment as any).mockRejectedValue(new Error('Permanent failure'));
    queue.enqueue({
      type: 'agent_progress',
      issueId: 'issue1',
      issueIdentifier: 'LIN-1',
      body: '[Aperant] test',
    });
    for (let i = 0; i < 11; i++) {
      await queue.flush();
    }
    expect(queue.pendingCount).toBe(0);
    expect(queue.deadLetterCount).toBe(1);
  });

  it('persists and reloads queue', async () => {
    queue.enqueue({
      type: 'agent_progress',
      issueId: 'issue1',
      issueIdentifier: 'LIN-1',
      body: '[Aperant] test',
    });
    queue.persist();
    const queue2 = new OutboundQueue(tmpDir, mockClient, 'team1');
    queue2.load();
    expect(queue2.pendingCount).toBe(1);
  });

  it('pauses flush when rate limited', async () => {
    (mockClient as any).lastRateLimitRemaining = 50;
    queue.enqueue({
      type: 'agent_progress',
      issueId: 'issue1',
      issueIdentifier: 'LIN-1',
      body: '[Aperant] test',
    });
    await queue.flush();
    expect(mockClient.postComment).not.toHaveBeenCalled();
    expect(queue.pendingCount).toBe(1);
  });

  it('discards events for a specific issue', () => {
    queue.enqueue({
      type: 'agent_progress',
      issueId: 'issue1',
      issueIdentifier: 'LIN-1',
      body: '[Aperant] test1',
    });
    queue.enqueue({
      type: 'agent_progress',
      issueId: 'issue2',
      issueIdentifier: 'LIN-2',
      body: '[Aperant] test2',
    });
    queue.discardForIssue('issue1');
    expect(queue.pendingCount).toBe(1);
  });
});
