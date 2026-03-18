import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadSyncState, saveSyncState, loadOutboundQueue, saveOutboundQueue, getDefaultSyncState, getDefaultOutboundQueue } from '../sync-state';

describe('sync-state', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linear-sync-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('loadSyncState', () => {
    it('returns default state when file does not exist', () => {
      const state = loadSyncState(tmpDir);
      expect(state.lastSyncAt).toBeNull();
      expect(state.pollIntervalMs).toBe(60_000);
      expect(state.verbosity).toBe('all');
      expect(state.issueMap).toEqual({});
    });

    it('loads existing state from disk', () => {
      const existing = {
        lastSyncAt: '2026-03-18T14:30:00Z',
        pollIntervalMs: 30000,
        verbosity: 'milestones',
        issueMap: { 'LIN-42': { taskSpecNumber: '003', lastSeenUpdatedAt: '2026-03-18T14:25:00Z', knownCommentIds: [], linearState: 'In Progress', aperantStatus: 'building' } }
      };
      fs.mkdirSync(path.join(tmpDir, 'linear'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'linear', 'sync_state.json'), JSON.stringify(existing));
      const state = loadSyncState(tmpDir);
      expect(state.lastSyncAt).toBe('2026-03-18T14:30:00Z');
      expect(state.issueMap['LIN-42'].taskSpecNumber).toBe('003');
    });
  });

  describe('saveSyncState', () => {
    it('creates directory and writes state', () => {
      const state = getDefaultSyncState();
      state.lastSyncAt = '2026-03-18T15:00:00Z';
      saveSyncState(tmpDir, state);
      const raw = fs.readFileSync(path.join(tmpDir, 'linear', 'sync_state.json'), 'utf-8');
      expect(JSON.parse(raw).lastSyncAt).toBe('2026-03-18T15:00:00Z');
    });

    it('uses atomic write (write to tmp then rename)', () => {
      const state = getDefaultSyncState();
      saveSyncState(tmpDir, state);
      const raw = fs.readFileSync(path.join(tmpDir, 'linear', 'sync_state.json'), 'utf-8');
      expect(() => JSON.parse(raw)).not.toThrow();
    });
  });

  describe('outbound queue', () => {
    it('returns default empty queue when file does not exist', () => {
      const queue = loadOutboundQueue(tmpDir);
      expect(queue.pending).toEqual([]);
      expect(queue.deadLetter).toEqual([]);
    });

    it('persists and loads queue', () => {
      const queue = getDefaultOutboundQueue();
      queue.pending.push({ id: '1', type: 'status_change', issueId: 'id1', issueIdentifier: 'LIN-1', retries: 0, createdAt: '2026-03-18T15:00:00Z' });
      saveOutboundQueue(tmpDir, queue);
      const loaded = loadOutboundQueue(tmpDir);
      expect(loaded.pending).toHaveLength(1);
      expect(loaded.pending[0].issueIdentifier).toBe('LIN-1');
    });
  });
});
