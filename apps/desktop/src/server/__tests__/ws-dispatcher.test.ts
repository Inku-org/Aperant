import { describe, it, expect, vi } from 'vitest';
import { createWsDispatcher } from '../ws-dispatcher';
import type { IpcCompat } from '../ipc-compat';

function mockIpcCompat(): IpcCompat {
  return {
    ipcMain: { handle: vi.fn(), on: vi.fn(), removeHandler: vi.fn() },
    getMainWindow: vi.fn(),
    dispatch: vi.fn().mockResolvedValue({ success: true, data: 'result' }),
    dispatchFireAndForget: vi.fn(),
    broadcast: vi.fn(),
    addClient: vi.fn(),
    removeClient: vi.fn(),
  };
}

describe('WsDispatcher', () => {
  it('handles invoke messages and sends response', async () => {
    const compat = mockIpcCompat();
    const dispatcher = createWsDispatcher(compat);
    const mockSend = vi.fn();
    const mockWs = { send: mockSend } as any;

    await dispatcher.handleMessage(mockWs, JSON.stringify({
      type: 'invoke',
      id: 'req-123',
      channel: 'task:list',
      args: ['project-1'],
    }));

    expect(compat.dispatch).toHaveBeenCalledWith('task:list', ['project-1']);
    expect(mockSend).toHaveBeenCalledWith(JSON.stringify({
      type: 'response',
      id: 'req-123',
      data: { success: true, data: 'result' },
    }));
  });

  it('handles send messages without response', async () => {
    const compat = mockIpcCompat();
    const dispatcher = createWsDispatcher(compat);
    const mockWs = { send: vi.fn() } as any;

    await dispatcher.handleMessage(mockWs, JSON.stringify({
      type: 'send',
      channel: 'task:start',
      args: ['task-1'],
    }));

    expect(compat.dispatchFireAndForget).toHaveBeenCalledWith('task:start', ['task-1']);
    expect(mockWs.send).not.toHaveBeenCalled();
  });

  it('sends error response for failed invoke', async () => {
    const compat = mockIpcCompat();
    (compat.dispatch as any).mockRejectedValue(new Error('handler failed'));
    const dispatcher = createWsDispatcher(compat);
    const mockSend = vi.fn();
    const mockWs = { send: mockSend } as any;

    await dispatcher.handleMessage(mockWs, JSON.stringify({
      type: 'invoke',
      id: 'req-456',
      channel: 'task:list',
      args: [],
    }));

    const response = JSON.parse(mockSend.mock.calls[0][0]);
    expect(response.type).toBe('response');
    expect(response.id).toBe('req-456');
    expect(response.error).toBe('handler failed');
  });

  it('ignores malformed messages', async () => {
    const compat = mockIpcCompat();
    const dispatcher = createWsDispatcher(compat);
    const mockWs = { send: vi.fn() } as any;

    await dispatcher.handleMessage(mockWs, 'not json');
    await dispatcher.handleMessage(mockWs, JSON.stringify({ type: 'unknown' }));
    expect(compat.dispatch).not.toHaveBeenCalled();
  });
});
