type ListenerCallback = (...args: unknown[]) => void;

export interface WebBridge {
  invokeIpc: <T>(channel: string, ...args: unknown[]) => Promise<T>;
  sendIpc: (channel: string, ...args: unknown[]) => void;
  createIpcListener: <T extends unknown[]>(
    channel: string,
    callback: (...args: T) => void,
  ) => () => void;
}

export function createWebBridge(ws: WebSocket): WebBridge {
  const pendingRequests = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (reason: Error) => void;
    }
  >();
  const eventListeners = new Map<string, Set<ListenerCallback>>();

  // Handle incoming messages from server
  ws.onmessage = (event: MessageEvent) => {
    let msg: {
      type: string;
      id?: string;
      channel?: string;
      data?: unknown;
      error?: string;
      args?: unknown[];
    };
    try {
      msg = JSON.parse(
        typeof event.data === "string" ? event.data : event.data.toString(),
      );
    } catch {
      return;
    }

    if (msg.type === "response" && msg.id) {
      const pending = pendingRequests.get(msg.id);
      if (pending) {
        pendingRequests.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(msg.error));
        } else {
          pending.resolve(msg.data);
        }
      }
    } else if (msg.type === "event" && msg.channel) {
      const listeners = eventListeners.get(msg.channel);
      if (listeners) {
        for (const cb of listeners) {
          try {
            cb(...(msg.args ?? []));
          } catch (err) {
            console.error(
              `[web-bridge] Error in event listener for ${msg.channel}:`,
              err,
            );
          }
        }
      }
    }
  };

  return {
    invokeIpc<T>(channel: string, ...args: unknown[]): Promise<T> {
      const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      ws.send(JSON.stringify({ type: "invoke", id, channel, args }));
      return new Promise<T>((resolve, reject) => {
        pendingRequests.set(id, {
          resolve: resolve as (value: unknown) => void,
          reject,
        });
        // Timeout after 60 seconds
        setTimeout(() => {
          if (pendingRequests.has(id)) {
            pendingRequests.delete(id);
            reject(new Error(`IPC invoke timeout: ${channel}`));
          }
        }, 60_000);
      });
    },

    sendIpc(channel: string, ...args: unknown[]): void {
      ws.send(JSON.stringify({ type: "send", channel, args }));
    },

    createIpcListener<T extends unknown[]>(
      channel: string,
      callback: (...args: T) => void,
    ): () => void {
      if (!eventListeners.has(channel)) {
        eventListeners.set(channel, new Set());
      }
      const cb = callback as ListenerCallback;
      eventListeners.get(channel)!.add(cb);
      return () => {
        eventListeners.get(channel)?.delete(cb);
      };
    },
  };
}

/**
 * Initializes the web bridge and connects to the server.
 * Call this at app startup instead of Electron's preload.
 */
export function initWebBridge(): Promise<WebBridge> {
  return new Promise((resolve, reject) => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    // In dev mode, Vite serves the client on :5173 but the server runs on :3000
    const host =
      process.env.NODE_ENV === "development" || window.location.port === "5173"
        ? `${window.location.hostname}:3000`
        : window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      const bridge = createWebBridge(ws);
      resolve(bridge);
    };

    ws.onerror = () => {
      reject(new Error("WebSocket connection failed"));
    };

    // Auto-reconnect on close
    ws.onclose = () => {
      console.warn("[web-bridge] Connection lost. Reconnecting in 2s...");
      setTimeout(() => {
        initWebBridge().catch(console.error);
      }, 2000);
    };
  });
}
