/**
 * Persistence layer for Linear sync state and outbound queue.
 * Uses atomic writes (write to tmp file, then rename) to prevent corruption.
 */

import fs from 'fs';
import path from 'path';
import type { SyncState, OutboundQueueState } from './types';
import {
  LINEAR_SYNC_DIR,
  SYNC_STATE_FILE,
  OUTBOUND_QUEUE_FILE,
  DEFAULT_POLL_INTERVAL_MS,
} from './constants';

export function getDefaultSyncState(): SyncState {
  return {
    lastSyncAt: null,
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    verbosity: 'all',
    issueMap: {},
  };
}

export function getDefaultOutboundQueue(): OutboundQueueState {
  return {
    pending: [],
    deadLetter: [],
  };
}

function getSyncDir(autoBuildPath: string): string {
  return path.join(autoBuildPath, LINEAR_SYNC_DIR);
}

function ensureSyncDir(autoBuildPath: string): string {
  const dir = getSyncDir(autoBuildPath);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Atomic write: write to temp file, then rename */
function atomicWriteJSON(filePath: string, data: unknown): void {
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

export function loadSyncState(autoBuildPath: string): SyncState {
  const filePath = path.join(getSyncDir(autoBuildPath), SYNC_STATE_FILE);
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return { ...getDefaultSyncState(), ...JSON.parse(raw) };
  } catch {
    return getDefaultSyncState();
  }
}

export function saveSyncState(autoBuildPath: string, state: SyncState): void {
  const dir = ensureSyncDir(autoBuildPath);
  atomicWriteJSON(path.join(dir, SYNC_STATE_FILE), state);
}

export function loadOutboundQueue(autoBuildPath: string): OutboundQueueState {
  const filePath = path.join(getSyncDir(autoBuildPath), OUTBOUND_QUEUE_FILE);
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return { ...getDefaultOutboundQueue(), ...JSON.parse(raw) };
  } catch {
    return getDefaultOutboundQueue();
  }
}

export function saveOutboundQueue(autoBuildPath: string, queue: OutboundQueueState): void {
  const dir = ensureSyncDir(autoBuildPath);
  atomicWriteJSON(path.join(dir, OUTBOUND_QUEUE_FILE), queue);
}
