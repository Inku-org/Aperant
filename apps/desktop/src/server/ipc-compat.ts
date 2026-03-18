import type { WebSocket } from "ws";

interface FakeEvent {
  sender: { send: (...args: unknown[]) => void };
}

type HandleHandler = (event: FakeEvent, ...args: unknown[]) => Promise<unknown>;
type OnHandler = (event: FakeEvent, ...args: unknown[]) => void;

export interface IpcCompat {
  /** Drop-in replacement for Electron's ipcMain */
  ipcMain: {
    handle: (channel: string, handler: HandleHandler) => void;
    on: (channel: string, handler: OnHandler) => void;
    removeHandler: (channel: string) => void;
  };
  /** Creates a fake getMainWindow that returns a webContents stub */
  getMainWindow: () => {
    webContents: { send: (channel: string, ...args: unknown[]) => void };
  } | null;
  /** Dispatch an invoke-style call (request-response) */
  dispatch: (channel: string, args: unknown[]) => Promise<unknown>;
  /** Dispatch a send-style call (fire-and-forget) */
  dispatchFireAndForget: (channel: string, args: unknown[]) => void;
  /** Broadcast an event to all connected WS clients */
  broadcast: (channel: string, ...args: unknown[]) => void;
  /** Track connected clients */
  addClient: (ws: WebSocket) => void;
  removeClient: (ws: WebSocket) => void;
}

export function createIpcCompat(): IpcCompat {
  const handleHandlers = new Map<string, HandleHandler>();
  const onHandlers = new Map<string, OnHandler>();
  const clients = new Set<WebSocket>();

  const fakeEvent: FakeEvent = {
    sender: { send: () => {} },
  };

  function broadcast(channel: string, ...args: unknown[]): void {
    const message = JSON.stringify({ type: "event", channel, args });
    for (const client of clients) {
      try {
        client.send(message);
      } catch {
        // Client disconnected, will be cleaned up
      }
    }
  }

  return {
    ipcMain: {
      handle(channel: string, handler: HandleHandler) {
        handleHandlers.set(channel, handler);
      },
      on(channel: string, handler: OnHandler) {
        onHandlers.set(channel, handler);
      },
      removeHandler(channel: string) {
        handleHandlers.delete(channel);
      },
    },

    getMainWindow() {
      return {
        isDestroyed: () => false,
        webContents: {
          send: broadcast,
          isDestroyed: () => false,
        },
      };
    },

    async dispatch(channel: string, args: unknown[]): Promise<unknown> {
      const handler = handleHandlers.get(channel);
      if (!handler) return undefined;
      return handler(fakeEvent, ...args);
    },

    dispatchFireAndForget(channel: string, args: unknown[]): void {
      const handler = onHandlers.get(channel);
      if (handler) {
        try {
          const result = handler(fakeEvent, ...args);
          // If the handler returns a promise, catch errors
          if (result && typeof (result as any).catch === 'function') {
            (result as any).catch((err: unknown) => {
              console.error(`[ipc-compat] Fire-and-forget handler error on ${channel}:`, err instanceof Error ? err.message : err);
            });
          }
        } catch (err) {
          console.error(`[ipc-compat] Fire-and-forget handler error on ${channel}:`, err instanceof Error ? err.message : err);
        }
      }
      // Also check handle handlers for channels registered with handle but called via send
      const handleHandler = handleHandlers.get(channel);
      if (handleHandler) {
        handleHandler(fakeEvent, ...args).catch((err) => {
          console.error(`[ipc-compat] Fire-and-forget (handle) error on ${channel}:`, err instanceof Error ? err.message : err);
        });
      }
    },

    broadcast,

    addClient(ws: WebSocket) {
      clients.add(ws);
    },

    removeClient(ws: WebSocket) {
      clients.delete(ws);
    },
  };
}
