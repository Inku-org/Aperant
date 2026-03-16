import { describe, it, expect, vi } from 'vitest';
import { createIpcCompat } from '../ipc-compat';

describe('IpcCompat', () => {
  it('registers and calls handle handlers', async () => {
    const compat = createIpcCompat();
    const handler = vi.fn().mockResolvedValue({ success: true, data: 'hello' });

    compat.ipcMain.handle('test:channel', handler);

    const result = await compat.dispatch('test:channel', ['arg1', 'arg2']);
    expect(handler).toHaveBeenCalledWith(expect.anything(), 'arg1', 'arg2');
    expect(result).toEqual({ success: true, data: 'hello' });
  });

  it('registers and calls on handlers', () => {
    const compat = createIpcCompat();
    const handler = vi.fn();

    compat.ipcMain.on('test:fire', handler);

    compat.dispatchFireAndForget('test:fire', ['arg1']);
    expect(handler).toHaveBeenCalledWith(expect.anything(), 'arg1');
  });

  it('broadcasts events to all connected clients', () => {
    const compat = createIpcCompat();
    const mockSend1 = vi.fn();
    const mockSend2 = vi.fn();

    compat.addClient({ send: mockSend1 } as any);
    compat.addClient({ send: mockSend2 } as any);

    compat.broadcast('task:progress', 'taskId123', { step: 1 });

    const expected = JSON.stringify({
      type: 'event',
      channel: 'task:progress',
      args: ['taskId123', { step: 1 }],
    });
    expect(mockSend1).toHaveBeenCalledWith(expected);
    expect(mockSend2).toHaveBeenCalledWith(expected);
  });

  it('removes disconnected clients from broadcast list', () => {
    const compat = createIpcCompat();
    const mockClient = { send: vi.fn() };

    compat.addClient(mockClient as any);
    compat.removeClient(mockClient as any);

    compat.broadcast('test:event', 'data');
    expect(mockClient.send).not.toHaveBeenCalled();
  });

  it('returns undefined for unregistered channels', async () => {
    const compat = createIpcCompat();
    const result = await compat.dispatch('nonexistent:channel', []);
    expect(result).toBeUndefined();
  });
});
