import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { LinearSyncEngine } from '../sync-engine';
import type { SyncEngineConfig } from '../types';

vi.mock('../linear-api', () => ({
  LinearGraphQLClient: class MockLinearGraphQLClient {
    fetchUpdatedIssues = vi
      .fn()
      .mockResolvedValue({ issues: [], rateLimitRemaining: 1400 });
    fetchIssueComments = vi.fn().mockResolvedValue([]);
    postComment = vi.fn().mockResolvedValue({ success: true });
    updateIssueState = vi.fn().mockResolvedValue({ success: true });
    lastRateLimitRemaining = 1400;
  },
}));

describe('LinearSyncEngine', () => {
  let tmpDir: string;
  let specsDir: string;
  let engine: LinearSyncEngine;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-test-'));
    specsDir = path.join(tmpDir, 'specs');
    fs.mkdirSync(specsDir, { recursive: true });

    const config: SyncEngineConfig = {
      projectPath: tmpDir,
      autoBuildPath: tmpDir,
      apiKey: 'test-key',
      teamId: 'team1',
      pollIntervalMs: 100_000, // Long interval so it doesn't auto-fire during tests
    };
    engine = new LinearSyncEngine(config, specsDir);
  });

  afterEach(async () => {
    await engine.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('starts and stops without error', async () => {
    await engine.start();
    expect(engine.isRunning).toBe(true);
    await engine.stop();
    expect(engine.isRunning).toBe(false);
  });

  it('initializes lastSyncAt on first start', async () => {
    await engine.start();
    const status = engine.getStatus();
    expect(status.lastSyncAt).not.toBeNull();
    await engine.stop();
  });

  it('persists state on stop', async () => {
    await engine.start();
    await engine.stop();
    const stateFile = path.join(tmpDir, 'linear', 'sync_state.json');
    expect(fs.existsSync(stateFile)).toBe(true);
  });

  it('returns correct status', () => {
    const status = engine.getStatus();
    expect(status.running).toBe(false);
    expect(status.issueCount).toBe(0);
    expect(status.pendingOutbound).toBe(0);
  });

  it('enqueues outbound events', () => {
    engine.enqueueOutbound({
      type: 'agent_progress',
      issueId: 'issue1',
      issueIdentifier: 'LIN-1',
      body: '[Aperant] test',
    });
    const status = engine.getStatus();
    expect(status.pendingOutbound).toBe(1);
  });

  it('filters outbound events based on verbosity', () => {
    // Create engine with milestones-only verbosity
    const config: SyncEngineConfig = {
      projectPath: tmpDir,
      autoBuildPath: tmpDir,
      apiKey: 'test-key',
      teamId: 'team1',
      pollIntervalMs: 100_000,
      verbosity: 'milestones',
    };
    const eng = new LinearSyncEngine(config, specsDir);

    // agent_progress is NOT a milestone event, should be filtered
    eng.enqueueOutbound({
      type: 'agent_progress',
      issueId: 'issue1',
      issueIdentifier: 'LIN-1',
      body: '[Aperant] test',
    });
    expect(eng.getStatus().pendingOutbound).toBe(0);

    // status_change is always allowed
    eng.enqueueOutbound({
      type: 'status_change',
      issueId: 'issue1',
      issueIdentifier: 'LIN-1',
      targetState: 'completed',
    });
    expect(eng.getStatus().pendingOutbound).toBe(1);
  });

  it('does not start twice', async () => {
    await engine.start();
    await engine.start(); // second call should be a no-op
    expect(engine.isRunning).toBe(true);
    await engine.stop();
  });

  it('stop is safe to call when not running', async () => {
    await engine.stop(); // should not throw
    expect(engine.isRunning).toBe(false);
  });
});
