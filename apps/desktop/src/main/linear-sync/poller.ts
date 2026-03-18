/**
 * Inbound poller for the Linear sync engine.
 * Fetches issues from Linear, diffs against local state, produces InboundChange[].
 */

import type { LinearIssue, LinearComment } from '../../shared/types/integrations';
import type { SyncState, InboundChange } from './types';
import { APERANT_COMMENT_PREFIX } from './constants';
import { LinearGraphQLClient } from './linear-api';

/**
 * Diff fetched issues against local sync state.
 * @param commentsByIssueId - Comments keyed by Linear issue ID
 */
export function diffIssues(
  issues: LinearIssue[],
  state: SyncState,
  commentsByIssueId: Record<string, LinearComment[]>,
): InboundChange[] {
  const changes: InboundChange[] = [];

  for (const issue of issues) {
    const existing = state.issueMap[issue.identifier];

    // New issue — skip if already completed or canceled
    if (!existing) {
      if (issue.state.type === 'completed' || issue.state.type === 'canceled') continue;
      changes.push({ type: 'new_issue', issueIdentifier: issue.identifier, issueId: issue.id, issue });
      continue;
    }

    // Skip archived mappings
    if (existing.archived) continue;

    // No update since last seen
    if (existing.lastSeenUpdatedAt === issue.updatedAt) continue;

    // Canceled issue
    if (issue.state.type === 'canceled') {
      changes.push({ type: 'issue_canceled', issueIdentifier: issue.identifier, issueId: issue.id, issue });
      continue;
    }

    // Title change
    if (existing.lastSeenTitle && existing.lastSeenTitle !== issue.title) {
      changes.push({
        type: 'title_changed',
        issueIdentifier: issue.identifier,
        issueId: issue.id,
        issue,
        previousValue: existing.lastSeenTitle,
        newValue: issue.title,
      });
    }

    // Status change
    if (existing.linearState !== issue.state.name) {
      changes.push({
        type: 'status_changed',
        issueIdentifier: issue.identifier,
        issueId: issue.id,
        issue,
        previousValue: existing.linearState,
        newValue: issue.state.name,
      });
    }

    // New comments (filter out Aperant-posted comments)
    const issueComments = commentsByIssueId[issue.id] ?? [];
    const newComments = issueComments.filter(
      c => !existing.knownCommentIds.includes(c.id) && !c.body.startsWith(APERANT_COMMENT_PREFIX),
    );
    if (newComments.length > 0) {
      changes.push({
        type: 'new_comments',
        issueIdentifier: issue.identifier,
        issueId: issue.id,
        issue,
        newComments,
      });
    }
  }

  return changes;
}

/**
 * Run a single poll cycle: fetch updated issues, diff against state, return changes.
 */
export async function pollOnce(
  client: LinearGraphQLClient,
  teamId: string,
  projectId: string | undefined,
  state: SyncState,
): Promise<{ changes: InboundChange[]; rateLimitRemaining: number | null }> {
  if (!state.lastSyncAt) {
    return { changes: [], rateLimitRemaining: null };
  }

  const { issues, rateLimitRemaining } = await client.fetchUpdatedIssues(teamId, state.lastSyncAt, projectId);

  // Only fetch comments for tracked issues that have actually been updated
  const trackedUpdatedIssues = issues.filter(
    i => state.issueMap[i.identifier] && state.issueMap[i.identifier].lastSeenUpdatedAt !== i.updatedAt,
  );

  const commentsByIssueId: Record<string, LinearComment[]> = {};
  for (const issue of trackedUpdatedIssues) {
    commentsByIssueId[issue.id] = await client.fetchIssueComments(issue.id);
  }

  const changes = diffIssues(issues, state, commentsByIssueId);
  return { changes, rateLimitRemaining };
}
