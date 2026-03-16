// Stub for electron imports in the web build.
// Vite's resolve.alias maps 'electron' → this file so any accidental
// electron imports compile without errors and degrade gracefully.
//
// ipcRenderer.invoke/send/on route through the WebSocket bridge
// (set on globalThis.__webBridge by main.tsx after connection).

type ListenerCallback = (...args: unknown[]) => void;
const eventListeners = new Map<string, Set<ListenerCallback>>();

export const ipcRenderer = {
  invoke: (channel: string, ...args: unknown[]): Promise<unknown> => {
    const bridge = (globalThis as any).__webBridge;
    if (bridge) {
      return bridge.invokeIpc(channel, ...args);
    }
    console.warn(
      `[electron-stub] ipcRenderer.invoke('${channel}') called before bridge ready`,
    );
    return Promise.resolve(undefined);
  },
  send: (channel: string, ...args: unknown[]): void => {
    const bridge = (globalThis as any).__webBridge;
    if (bridge) {
      bridge.sendIpc(channel, ...args);
    }
  },
  on: (
    channel: string,
    callback: (_event: unknown, ...args: unknown[]) => void,
  ): (() => void) => {
    const bridge = (globalThis as any).__webBridge;
    if (bridge) {
      // Bridge callback doesn't include the event arg, so wrap it
      const wrappedCb = (...args: unknown[]) => callback({}, ...args);
      if (!eventListeners.has(channel)) {
        eventListeners.set(channel, new Set());
      }
      eventListeners.get(channel)!.add(wrappedCb);
      return bridge.createIpcListener(channel, wrappedCb);
    }
    return () => {};
  },
  off: (_channel: string, _callback: unknown): void => {},
  removeListener: (_channel: string, _callback: unknown): void => {},
  removeAllListeners: (_channel: string): void => {},
  setMaxListeners: (_n: number): void => {},
};

export const contextBridge = {
  exposeInMainWorld: (_key: string, _api: unknown): void => {},
};

export const shell = {
  openExternal: (url: string) => {
    window.open(url, "_blank");
    return Promise.resolve();
  },
};

export default { ipcRenderer, contextBridge, shell };
