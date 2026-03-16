// Stub for electron imports in the web build.
// Vite's resolve.alias maps 'electron' → this file so any accidental
// electron imports compile without errors and degrade gracefully.

export const ipcRenderer = {
  invoke: () => Promise.resolve(undefined),
  send: () => {},
  on: () => () => {},
  removeListener: () => {},
};

export const contextBridge = {
  exposeInMainWorld: () => {},
};

export const shell = {
  openExternal: (url: string) => {
    window.open(url, '_blank');
    return Promise.resolve();
  },
};

export default { ipcRenderer, contextBridge, shell };
