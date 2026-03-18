import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { applyInboundChanges } from '../inbound-handlers';
import type { InboundChange, SyncState } from '../types';
import type { LinearIssue } from '../../../shared/types/integrations';

function makeIssue(overrides: Partial<LinearIssue> = {}): LinearIssue {
  return {
    id: 'issue1',
    identifier: 'LIN-1',
    title: 'Test Issue',
    state: { id: 's1', name: 'Todo', type: 'backlog' },
    priority: 2,
    priorityLabel: 'Medium',
    labels: [],
    createdAt: '2026-03-18T14:00:00Z',
    updatedAt: '2026-03-18T15:00:00Z',
    url: 'https://linear.app/test/issue/LIN-1',
    ...overrides,
  };
}

describe('applyInboundChanges', () => {
  let tmpDir: string;
  let specsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inbound-test-'));
    specsDir = path.join(tmpDir, 'specs');
    fs.mkdirSync(specsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates task spec directory for new issue', async () => {
    const changes: InboundChange[] = [
      { type: 'new_issue', issueIdentifier: 'LIN-1', issueId: 'issue1', issue: makeIssue() },
    ];
    const state: SyncState = {
      lastSyncAt: '2026-03-18T14:00:00Z',
      pollIntervalMs: 60000,
      verbosity: 'all',
      issueMap: {},
    };

    const result = await applyInboundChanges(changes, state, tmpDir, specsDir);

    expect(result.created).toBe(1);
    expect(state.issueMap['LIN-1']).toBeDefined();
    expect(state.issueMap['LIN-1'].aperantStatus).toBe('backlog');

    // Verify spec directory was created with expected files
    const entries = fs.readdirSync(specsDir);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatch(/^001-/);

    const specDir = path.join(specsDir, entries[0]);
    expect(fs.existsSync(path.join(specDir, 'task_metadata.json'))).toBe(true);
    expect(fs.existsSync(path.join(specDir, 'requirements.json'))).toBe(true);
    expect(fs.existsSync(path.join(specDir, 'implementation_plan.json'))).toBe(true);
  });

  it('marks task as canceled', async () => {
    const specDir = path.join(specsDir, '001-test-issue');
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(
      path.join(specDir, 'task_metadata.json'),
      JSON.stringify({ sourceType: 'linear', linearIssueId: 'issue1' }),
    );

    const changes: InboundChange[] = [
      {
        type: 'issue_canceled',
        issueIdentifier: 'LIN-1',
        issueId: 'issue1',
        issue: makeIssue({ state: { id: 's2', name: 'Canceled', type: 'canceled' } }),
      },
    ];
    const state: SyncState = {
      lastSyncAt: '2026-03-18T14:00:00Z',
      pollIntervalMs: 60000,
      verbosity: 'all',
      issueMap: {
        'LIN-1': {
          taskSpecNumber: '001',
          linearIssueId: 'issue1',
          lastSeenUpdatedAt: '2026-03-18T14:30:00Z',
          knownCommentIds: [],
          linearState: 'Todo',
          aperantStatus: 'backlog',
        },
      },
    };

    const result = await applyInboundChanges(changes, state, tmpDir, specsDir);

    expect(result.canceled).toBe(1);
    expect(state.issueMap['LIN-1'].archived).toBe(true);
    expect(state.issueMap['LIN-1'].aperantStatus).toBe('canceled');

    // Verify metadata was updated
    const meta = JSON.parse(fs.readFileSync(path.join(specDir, 'task_metadata.json'), 'utf-8'));
    expect(meta.linearSyncStatus).toBe('canceled');
  });

  it('appends new comments to context file', async () => {
    const specDir = path.join(specsDir, '001-test-issue');
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(
      path.join(specDir, 'task_metadata.json'),
      JSON.stringify({ sourceType: 'linear', linearIssueId: 'issue1' }),
    );

    const changes: InboundChange[] = [
      {
        type: 'new_comments',
        issueIdentifier: 'LIN-1',
        issueId: 'issue1',
        issue: makeIssue(),
        newComments: [
          {
            id: 'c2',
            body: 'Please handle edge case X',
            author: { id: 'u1', name: 'Alice', email: 'alice@test.com' },
            createdAt: '2026-03-18T15:15:00Z',
            updatedAt: '2026-03-18T15:15:00Z',
          },
        ],
      },
    ];
    const state: SyncState = {
      lastSyncAt: '2026-03-18T14:00:00Z',
      pollIntervalMs: 60000,
      verbosity: 'all',
      issueMap: {
        'LIN-1': {
          taskSpecNumber: '001',
          linearIssueId: 'issue1',
          lastSeenUpdatedAt: '2026-03-18T15:00:00Z',
          knownCommentIds: ['c1'],
          linearState: 'Todo',
          aperantStatus: 'backlog',
        },
      },
    };

    const result = await applyInboundChanges(changes, state, tmpDir, specsDir);

    expect(result.commentsAdded).toBe(1);
    expect(state.issueMap['LIN-1'].knownCommentIds).toContain('c2');

    const contextPath = path.join(specDir, 'linear_comments.md');
    expect(fs.existsSync(contextPath)).toBe(true);
    const content = fs.readFileSync(contextPath, 'utf-8');
    expect(content).toContain('Please handle edge case X');
    expect(content).toContain('Alice');
  });

  it('increments spec numbers correctly', async () => {
    // Pre-create a spec directory
    fs.mkdirSync(path.join(specsDir, '005-existing-task'), { recursive: true });

    const changes: InboundChange[] = [
      { type: 'new_issue', issueIdentifier: 'LIN-1', issueId: 'issue1', issue: makeIssue() },
    ];
    const state: SyncState = {
      lastSyncAt: '2026-03-18T14:00:00Z',
      pollIntervalMs: 60000,
      verbosity: 'all',
      issueMap: {},
    };

    await applyInboundChanges(changes, state, tmpDir, specsDir);

    expect(state.issueMap['LIN-1'].taskSpecNumber).toBe('006');
  });

  it('handles status_changed by updating linearState', async () => {
    const changes: InboundChange[] = [
      {
        type: 'status_changed',
        issueIdentifier: 'LIN-1',
        issueId: 'issue1',
        issue: makeIssue({ state: { id: 's2', name: 'In Progress', type: 'started' } }),
        previousValue: 'Todo',
        newValue: 'In Progress',
      },
    ];
    const state: SyncState = {
      lastSyncAt: '2026-03-18T14:00:00Z',
      pollIntervalMs: 60000,
      verbosity: 'all',
      issueMap: {
        'LIN-1': {
          taskSpecNumber: '001',
          linearIssueId: 'issue1',
          lastSeenUpdatedAt: '2026-03-18T14:30:00Z',
          knownCommentIds: [],
          linearState: 'Todo',
          aperantStatus: 'backlog',
        },
      },
    };

    const result = await applyInboundChanges(changes, state, tmpDir, specsDir);

    expect(result.statusLogged).toBe(1);
    expect(state.issueMap['LIN-1'].linearState).toBe('In Progress');
  });
});
