/**
 * Handlers for inbound changes detected by the poller.
 * Applies Linear changes to local Aperant task specs and sync state.
 */

import fs from 'fs';
import path from 'path';
import type { InboundChange, SyncState } from './types';

interface ApplyResult {
  created: number;
  canceled: number;
  commentsAdded: number;
  metadataUpdated: number;
  statusLogged: number;
}

/** Find a spec directory by its numeric prefix */
function findSpecDir(specsDir: string, specNumber: string): string | null {
  if (!fs.existsSync(specsDir)) return null;
  const entries = fs.readdirSync(specsDir);
  const match = entries.find(e => e.startsWith(`${specNumber}-`));
  return match ? path.join(specsDir, match) : null;
}

/** Determine the next available spec number */
function getNextSpecNumber(specsDir: string): string {
  if (!fs.existsSync(specsDir)) return '001';
  const entries = fs.readdirSync(specsDir);
  let maxNum = 0;
  for (const entry of entries) {
    const numMatch = entry.match(/^(\d+)-/);
    if (numMatch) {
      const num = parseInt(numMatch[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return String(maxNum + 1).padStart(3, '0');
}

/** Create a new task spec directory from a Linear issue */
function createTaskFromIssue(specsDir: string, change: InboundChange): string {
  const specNumber = getNextSpecNumber(specsDir);
  const safeName = change.issue.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  const specDir = path.join(specsDir, `${specNumber}-${safeName}`);
  fs.mkdirSync(specDir, { recursive: true });

  fs.writeFileSync(
    path.join(specDir, 'task_metadata.json'),
    JSON.stringify(
      {
        sourceType: 'linear',
        linearIssueId: change.issueId,
        linearIdentifier: change.issueIdentifier,
        linearUrl: change.issue.url,
        category: 'feature',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(specDir, 'requirements.json'),
    JSON.stringify(
      {
        title: change.issue.title,
        description: change.issue.description ?? '',
        source: 'linear',
        linearIdentifier: change.issueIdentifier,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(specDir, 'implementation_plan.json'),
    JSON.stringify({ status: 'pending', subtasks: [] }, null, 2),
  );

  return specNumber;
}

/** Append new comments to the linear_comments.md file in the spec directory */
function appendComments(specDir: string, change: InboundChange): void {
  if (!change.newComments?.length) return;
  const contextPath = path.join(specDir, 'linear_comments.md');
  let existing = fs.existsSync(contextPath)
    ? fs.readFileSync(contextPath, 'utf-8')
    : `# Linear Comments for ${change.issueIdentifier}\n\n`;

  const newContent = change.newComments
    .map(c => {
      const date = new Date(c.createdAt).toISOString().slice(0, 16).replace('T', ' ');
      return `### ${c.author.name} — ${date}\n\n${c.body}\n`;
    })
    .join('\n---\n\n');

  fs.writeFileSync(contextPath, `${existing}\n---\n\n${newContent}`, 'utf-8');
}

/**
 * Apply a batch of inbound changes to local task specs and sync state.
 */
export async function applyInboundChanges(
  changes: InboundChange[],
  state: SyncState,
  autoBuildPath: string,
  specsDir: string,
): Promise<ApplyResult> {
  const result: ApplyResult = {
    created: 0,
    canceled: 0,
    commentsAdded: 0,
    metadataUpdated: 0,
    statusLogged: 0,
  };

  for (const change of changes) {
    switch (change.type) {
      case 'new_issue': {
        const specNumber = createTaskFromIssue(specsDir, change);
        state.issueMap[change.issueIdentifier] = {
          taskSpecNumber: specNumber,
          linearIssueId: change.issueId,
          lastSeenUpdatedAt: change.issue.updatedAt,
          lastSeenTitle: change.issue.title,
          knownCommentIds: [],
          linearState: change.issue.state.name,
          aperantStatus: 'backlog',
        };
        result.created++;
        break;
      }

      case 'issue_canceled':
      case 'issue_deleted': {
        const mapping = state.issueMap[change.issueIdentifier];
        if (mapping) {
          mapping.archived = true;
          mapping.aperantStatus = 'canceled';
          mapping.lastSeenUpdatedAt = change.issue.updatedAt;

          const specDir = findSpecDir(specsDir, mapping.taskSpecNumber);
          if (specDir) {
            const metaPath = path.join(specDir, 'task_metadata.json');
            if (fs.existsSync(metaPath)) {
              const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
              meta.linearSyncStatus = 'canceled';
              fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
            }
          }
        }
        result.canceled++;
        break;
      }

      case 'new_comments': {
        const mapping = state.issueMap[change.issueIdentifier];
        if (mapping && change.newComments) {
          const specDir = findSpecDir(specsDir, mapping.taskSpecNumber);
          if (specDir) appendComments(specDir, change);

          for (const c of change.newComments) {
            if (!mapping.knownCommentIds.includes(c.id)) {
              mapping.knownCommentIds.push(c.id);
            }
          }
          mapping.lastSeenUpdatedAt = change.issue.updatedAt;
          result.commentsAdded += change.newComments.length;
        }
        break;
      }

      case 'title_changed':
      case 'description_changed':
      case 'labels_changed':
      case 'assignee_changed': {
        const mapping = state.issueMap[change.issueIdentifier];
        if (mapping) {
          mapping.lastSeenUpdatedAt = change.issue.updatedAt;
          mapping.linearState = change.issue.state.name;
          mapping.lastSeenTitle = change.issue.title;
          result.metadataUpdated++;
        }
        break;
      }

      case 'status_changed': {
        const mapping = state.issueMap[change.issueIdentifier];
        if (mapping) {
          mapping.linearState = change.issue.state.name;
          mapping.lastSeenUpdatedAt = change.issue.updatedAt;
          result.statusLogged++;
        }
        break;
      }
    }
  }

  return result;
}
