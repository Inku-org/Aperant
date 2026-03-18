import { describe, it, expect } from 'vitest';
import { diffIssues } from '../poller';
import type { SyncState, IssueMapping } from '../types';
import type { LinearIssue } from '../../../shared/types/integrations';

function makeIssue(overrides: Partial<LinearIssue> = {}): LinearIssue {
  return {
    id: 'issue1',
    identifier: 'LIN-1',
    title: 'Test Issue',
    state: { id: 's1', name: 'Todo', type: 'backlog' },
    priority: 0,
    priorityLabel: 'None',
    labels: [],
    createdAt: '2026-03-18T14:00:00Z',
    updatedAt: '2026-03-18T15:00:00Z',
    url: 'https://linear.app/test/issue/LIN-1',
    ...overrides,
  };
}

function makeState(issueMap: Record<string, IssueMapping> = {}): SyncState {
  return {
    lastSyncAt: '2026-03-18T14:00:00Z',
    pollIntervalMs: 60000,
    verbosity: 'all',
    issueMap,
  };
}

describe('diffIssues', () => {
  it('detects a new issue', () => {
    const changes = diffIssues([makeIssue()], makeState(), {});
    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('new_issue');
  });

  it('detects no changes for unchanged issue', () => {
    const changes = diffIssues(
      [makeIssue()],
      makeState({
        'LIN-1': {
          taskSpecNumber: '001',
          linearIssueId: 'issue1',
          lastSeenUpdatedAt: '2026-03-18T15:00:00Z',
          knownCommentIds: [],
          linearState: 'Todo',
          aperantStatus: 'backlog',
        },
      }),
      {},
    );
    expect(changes).toHaveLength(0);
  });

  it('detects canceled issue', () => {
    const changes = diffIssues(
      [makeIssue({ state: { id: 's2', name: 'Canceled', type: 'canceled' } })],
      makeState({
        'LIN-1': {
          taskSpecNumber: '001',
          linearIssueId: 'issue1',
          lastSeenUpdatedAt: '2026-03-18T14:30:00Z',
          knownCommentIds: [],
          linearState: 'Todo',
          aperantStatus: 'backlog',
        },
      }),
      {},
    );
    expect(changes.some(c => c.type === 'issue_canceled')).toBe(true);
  });

  it('detects new comments, filters Aperant comments', () => {
    const commentsByIssueId = {
      issue1: [
        {
          id: 'c1',
          body: 'old',
          author: { id: 'u1', name: 'User' },
          createdAt: '2026-03-18T14:00:00Z',
          updatedAt: '2026-03-18T14:00:00Z',
        },
        {
          id: 'c2',
          body: 'new comment',
          author: { id: 'u1', name: 'User' },
          createdAt: '2026-03-18T15:15:00Z',
          updatedAt: '2026-03-18T15:15:00Z',
        },
        {
          id: 'c3',
          body: '[Aperant] QA passed',
          author: { id: 'u2', name: 'Bot' },
          createdAt: '2026-03-18T15:20:00Z',
          updatedAt: '2026-03-18T15:20:00Z',
        },
      ],
    };
    const changes = diffIssues(
      [makeIssue({ updatedAt: '2026-03-18T15:30:00Z' })],
      makeState({
        'LIN-1': {
          taskSpecNumber: '001',
          linearIssueId: 'issue1',
          lastSeenUpdatedAt: '2026-03-18T15:00:00Z',
          knownCommentIds: ['c1'],
          linearState: 'Todo',
          aperantStatus: 'backlog',
        },
      }),
      commentsByIssueId,
    );
    const cc = changes.find(c => c.type === 'new_comments');
    expect(cc).toBeDefined();
    expect(cc!.newComments).toHaveLength(1);
    expect(cc!.newComments![0].id).toBe('c2');
  });

  it('detects title change', () => {
    const changes = diffIssues(
      [makeIssue({ title: 'Updated Title', updatedAt: '2026-03-18T15:30:00Z' })],
      makeState({
        'LIN-1': {
          taskSpecNumber: '001',
          linearIssueId: 'issue1',
          lastSeenUpdatedAt: '2026-03-18T15:00:00Z',
          knownCommentIds: [],
          linearState: 'Todo',
          aperantStatus: 'backlog',
          lastSeenTitle: 'Test Issue',
        },
      }),
      {},
    );
    expect(changes.some(c => c.type === 'title_changed')).toBe(true);
  });

  it('skips completed/canceled issues for new import', () => {
    const changes = diffIssues(
      [
        makeIssue({
          identifier: 'LIN-2',
          id: 'issue2',
          state: { id: 's3', name: 'Done', type: 'completed' },
        }),
      ],
      makeState(),
      {},
    );
    expect(changes).toHaveLength(0);
  });
});
