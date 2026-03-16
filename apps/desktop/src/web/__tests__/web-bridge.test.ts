import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWebBridge, type WebBridge } from '../web-bridge';

// Mock WebSocket
class MockWebSocket {
  static OPEN = 1;
  readyState = MockWebSocket.OPEN;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onopen: (() => void) | null = null;
  sent: string[] = [];

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
  }

  // Simulate receiving a message from server
  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

describe('WebBridge', () => {
  let ws: MockWebSocket;
  let bridge: WebBridge;

  beforeEach(() => {
    ws = new MockWebSocket();
    bridge = createWebBridge(ws as any);
  });

  it('sends invoke message and resolves when response arrives', async () => {
    const promise = bridge.invokeIpc('task:list', 'project-1');

    expect(ws.sent).toHaveLength(1);
    const sent = JSON.parse(ws.sent[0]);
    expect(sent.type).toBe('invoke');
    expect(sent.channel).toBe('task:list');
    expect(sent.args).toEqual(['project-1']);

    // Simulate server response
    ws.simulateMessage({ type: 'response', id: sent.id, data: { success: true, data: ['task1'] } });

    const result = await promise;
    expect(result).toEqual({ success: true, data: ['task1'] });
  });

  it('sends fire-and-forget messages', () => {
    bridge.sendIpc('task:start', 'task-1');

    expect(ws.sent).toHaveLength(1);
    const sent = JSON.parse(ws.sent[0]);
    expect(sent.type).toBe('send');
    expect(sent.channel).toBe('task:start');
    expect(sent.args).toEqual(['task-1']);
  });

  it('registers and fires event listeners', () => {
    const callback = vi.fn();
    const cleanup = bridge.createIpcListener('task:progress', callback);

    ws.simulateMessage({ type: 'event', channel: 'task:progress', args: ['task-1', { step: 2 }] });

    expect(callback).toHaveBeenCalledWith('task-1', { step: 2 });

    cleanup();
    ws.simulateMessage({ type: 'event', channel: 'task:progress', args: ['task-2', { step: 3 }] });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('rejects invoke promises on error response', async () => {
    const promise = bridge.invokeIpc('bad:channel');

    const sent = JSON.parse(ws.sent[0]);
    ws.simulateMessage({ type: 'response', id: sent.id, error: 'not found' });

    await expect(promise).rejects.toThrow('not found');
  });
});
