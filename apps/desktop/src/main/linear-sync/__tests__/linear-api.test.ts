import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LinearGraphQLClient } from '../linear-api';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('LinearGraphQLClient', () => {
  let client: LinearGraphQLClient;

  beforeEach(() => {
    client = new LinearGraphQLClient('test-api-key');
    mockFetch.mockReset();
  });

  describe('fetchUpdatedIssues', () => {
    it('fetches issues updated since a given timestamp', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            issues: {
              nodes: [
                { id: 'issue1', identifier: 'LIN-1', title: 'Test', updatedAt: '2026-03-18T15:00:00Z', state: { id: 's1', name: 'Todo', type: 'backlog' }, priority: 0, priorityLabel: 'None', labels: { nodes: [] }, createdAt: '2026-03-18T14:00:00Z', url: 'https://linear.app/test/issue/LIN-1' }
              ]
            }
          }
        }),
        headers: new Map([['x-ratelimit-requests-remaining', '1400']]),
      });

      const result = await client.fetchUpdatedIssues('team1', '2026-03-18T14:00:00Z');
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].identifier).toBe('LIN-1');
      expect(result.rateLimitRemaining).toBe(1400);
    });
  });

  describe('postComment', () => {
    it('posts a comment to a Linear issue', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { commentCreate: { success: true, comment: { id: 'c1' } } }
        }),
        headers: new Map(),
      });

      const result = await client.postComment('issue1', '[Aperant] QA passed');
      expect(result.success).toBe(true);
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.variables.body).toBe('[Aperant] QA passed');
    });
  });

  describe('createIssue', () => {
    it('creates a new issue in Linear', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { issueCreate: { success: true, issue: { id: 'new1', identifier: 'LIN-99', url: 'https://linear.app/test/issue/LIN-99' } } }
        }),
        headers: new Map(),
      });

      const result = await client.createIssue('team1', 'New Task', 'Description here');
      expect(result.success).toBe(true);
      expect(result.issue?.identifier).toBe('LIN-99');
    });
  });

  describe('updateIssueState', () => {
    it('updates an issue workflow state', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { team: { states: { nodes: [
            { id: 'state1', name: 'Done', type: 'completed' },
            { id: 'state2', name: 'In Progress', type: 'started' },
          ] } } }
        }),
        headers: new Map(),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { issueUpdate: { success: true } }
        }),
        headers: new Map(),
      });

      const result = await client.updateIssueState('issue1', 'team1', 'completed');
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
