import { describe, it, expect } from 'vitest';
import {
  formatAgentProgress,
  formatQAResult,
  formatPRLink,
  formatSpecReady,
  formatAgentError,
} from '../outbound-handlers';

describe('outbound-handlers', () => {
  it('formats agent progress', () => {
    const body = formatAgentProgress('LIN-42', 'planning', 'Breaking down requirements', 2, 5);
    expect(body).toContain('[Aperant]');
    expect(body).toContain('Planning');
    expect(body).toContain('2/5');
  });

  it('formats QA pass', () => {
    const body = formatQAResult('LIN-42', true, []);
    expect(body).toContain('[Aperant]');
    expect(body).toContain('passed');
  });

  it('formats QA fail with issues', () => {
    const body = formatQAResult('LIN-42', false, ['Missing error handling', 'No tests']);
    expect(body).toContain('failed');
    expect(body).toContain('Missing error handling');
  });

  it('formats PR link', () => {
    const body = formatPRLink('LIN-42', 'https://github.com/org/repo/pull/123', 'feat/lin-42');
    expect(body).toContain('https://github.com/org/repo/pull/123');
    expect(body).toContain('feat/lin-42');
  });

  it('formats spec ready', () => {
    const body = formatSpecReady('LIN-42', 'Implement OAuth2', ['Setup provider', 'Add login']);
    expect(body).toContain('OAuth2');
    expect(body).toContain('Setup provider');
  });

  it('formats agent error', () => {
    const body = formatAgentError('LIN-42', 'coding', 'Build failed: TS error in auth.ts:42');
    expect(body).toContain('Coding');
    expect(body).toContain('TS error');
  });
});
