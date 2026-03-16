import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import http from 'http';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createIpcCompat } from '../ipc-compat';
import { createWsDispatcher } from '../ws-dispatcher';

describe('Server integration', () => {
  let server: http.Server;
  let wss: WebSocketServer;
  const PORT = 9876;
  const compat = createIpcCompat();
  const dispatcher = createWsDispatcher(compat);

  beforeAll(async () => {
    // Register a test handler
    compat.ipcMain.handle('test:echo', async (_, message: string) => {
      return { success: true, data: message };
    });

    const app = express();
    server = http.createServer(app);
    wss = new WebSocketServer({ server });

    wss.on('connection', (ws) => {
      compat.addClient(ws);
      ws.on('message', (raw) => {
        dispatcher.handleMessage(ws, raw.toString());
      });
      ws.on('close', () => compat.removeClient(ws));
    });

    await new Promise<void>((resolve) => server.listen(PORT, resolve));
  });

  afterAll(() => {
    wss.close();
    server.close();
  });

  it('handles invoke round-trip over WebSocket', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    const responsePromise = new Promise<any>((resolve) => {
      ws.on('message', (data) => {
        resolve(JSON.parse(data.toString()));
      });
    });

    ws.send(JSON.stringify({
      type: 'invoke',
      id: 'test-1',
      channel: 'test:echo',
      args: ['hello world'],
    }));

    const response = await responsePromise;
    expect(response).toEqual({
      type: 'response',
      id: 'test-1',
      data: { success: true, data: 'hello world' },
    });

    ws.close();
  });

  it('broadcasts events to connected clients', async () => {
    const ws1 = new WebSocket(`ws://localhost:${PORT}`);
    const ws2 = new WebSocket(`ws://localhost:${PORT}`);
    await Promise.all([
      new Promise<void>((resolve) => ws1.on('open', resolve)),
      new Promise<void>((resolve) => ws2.on('open', resolve)),
    ]);

    // Small delay for server to register clients
    await new Promise((r) => setTimeout(r, 100));

    const msg1 = new Promise<any>((resolve) => {
      ws1.on('message', (data) => resolve(JSON.parse(data.toString())));
    });
    const msg2 = new Promise<any>((resolve) => {
      ws2.on('message', (data) => resolve(JSON.parse(data.toString())));
    });

    compat.broadcast('task:progress', 'task-1', { step: 5 });

    const [r1, r2] = await Promise.all([msg1, msg2]);
    expect(r1).toEqual({ type: 'event', channel: 'task:progress', args: ['task-1', { step: 5 }] });
    expect(r2).toEqual({ type: 'event', channel: 'task:progress', args: ['task-1', { step: 5 }] });

    ws1.close();
    ws2.close();
  });
});
