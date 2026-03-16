/**
 * Node.js ESM loader hooks that intercept `import ... from 'electron'`
 * and return our shim instead of trying to load the real Electron module.
 *
 * Registered via `module.register()` in the server entry point.
 * Runs in a separate loader thread — communicates with the main thread
 * only via the hooks interface.
 *
 * See: https://nodejs.org/api/module.html#customization-hooks
 */

const ELECTRON_URL = "electron://shim";

/**
 * Resolve hook — redirect bare 'electron' specifier to our virtual URL.
 */
export function resolve(
  specifier: string,
  context: { parentURL?: string; conditions?: string[] },
  nextResolve: (
    specifier: string,
    context: unknown,
  ) => Promise<{ url: string; format?: string }>,
):
  | Promise<{ url: string; shortCircuit?: boolean; format?: string }>
  | { url: string; shortCircuit?: boolean; format?: string } {
  if (specifier === "electron") {
    return { url: ELECTRON_URL, shortCircuit: true, format: "module" };
  }
  // Intercept electron-updater — it tries to import from electron internals
  if (specifier === "electron-updater") {
    return {
      url: "electron-updater://shim",
      shortCircuit: true,
      format: "module",
    };
  }
  // Also intercept @electron-toolkit/* imports
  if (specifier.startsWith("@electron-toolkit/")) {
    return {
      url: `electron-toolkit://shim/${specifier}`,
      shortCircuit: true,
      format: "module",
    };
  }
  return nextResolve(specifier, context);
}

/**
 * Load hook — when our virtual URL is requested, return inline JS that
 * re-exports everything from the globally stashed shim object.
 */
export function load(
  url: string,
  context: { format?: string; conditions?: string[] },
  nextLoad: (
    url: string,
    context: unknown,
  ) => Promise<{ source: string | Buffer; format: string }>,
):
  | Promise<{ source: string | Buffer; format: string; shortCircuit?: boolean }>
  | { source: string | Buffer; format: string; shortCircuit?: boolean } {
  if (url === ELECTRON_URL) {
    // The main thread stores the shim on globalThis.__electronShim before
    // registering this loader. However, loader hooks run in a separate
    // thread and don't share globalThis. So we emit a self-contained module.
    const source = `
const noop = () => {};
const noopObj = new Proxy({}, { get: () => noop });
const userDataDir = (typeof process !== 'undefined' && (process.env.HOME || process.env.USERPROFILE))
  ? (process.env.HOME || process.env.USERPROFILE) + '/.auto-claude'
  : '/root/.auto-claude';

const app = {
  getPath: (name) => {
    const home = process.env.HOME || process.env.USERPROFILE || '/root';
    const paths = {
      userData: userDataDir,
      home,
      appData: home + '/.config',
      temp: process.env.TMPDIR || process.env.TEMP || '/tmp',
      desktop: home + '/Desktop',
      documents: home + '/Documents',
      logs: userDataDir + '/logs',
    };
    return paths[name] || process.cwd();
  },
  getName: () => 'aperant',
  getVersion: () => process.env.npm_package_version || '0.0.0-web',
  getAppPath: () => process.cwd(),
  getLocaleCountryCode: () => 'US',
  isPackaged: false,
  whenReady: () => Promise.resolve(),
  on: noop,
  once: noop,
  quit: () => process.exit(0),
  exit: (code) => process.exit(code ?? 0),
  getLocale: () => (process.env.LANG?.split('.')[0]) || 'en-US',
  requestSingleInstanceLock: () => true,
  setName: noop,
  name: 'aperant',
  commandLine: { appendSwitch: noop },
  setAppUserModelId: noop,
  dock: { setIcon: noop, bounce: () => -1, setBadge: noop },
};

class FakeBrowserWindow {
  webContents = {
    send: noop,
    on: noop,
    once: noop,
    openDevTools: noop,
    session: { setSpellCheckerLanguages: noop, availableSpellCheckerLanguages: ['en-US'] },
    setWindowOpenHandler: noop,
    replaceMisspelling: noop,
  };
  loadURL() {}
  loadFile() {}
  on() { return this; }
  once() { return this; }
  show() {}
  hide() {}
  close() {}
  destroy() {}
  isDestroyed() { return false; }
  setTitle() {}
  getBounds() { return { x: 0, y: 0, width: 1920, height: 1080 }; }
  setBounds() {}
  getSize() { return [1920, 1080]; }
  setSize() {}
  static getAllWindows() { return []; }
  static getFocusedWindow() { return null; }
}

const shell = {
  openExternal: () => Promise.resolve(),
  showItemInFolder: noop,
  openPath: () => Promise.resolve(''),
};

const dialog = {
  showOpenDialog: () => Promise.resolve({ canceled: true, filePaths: [] }),
  showSaveDialog: () => Promise.resolve({ canceled: true, filePath: undefined }),
  showMessageBox: () => Promise.resolve({ response: 0 }),
  showErrorBox: noop,
};

const nativeTheme = {
  shouldUseDarkColors: true,
  themeSource: 'system',
  on: noop,
  off: noop,
  removeListener: noop,
  removeAllListeners: noop,
};

class FakeNotification {
  show() {}
  close() {}
  on() { return this; }
}

const clipboard = {
  writeText: noop,
  readText: () => '',
  writeHTML: noop,
  readHTML: () => '',
};

const screen = {
  getPrimaryDisplay: () => ({
    workAreaSize: { width: 1920, height: 1080 },
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    scaleFactor: 1,
  }),
  getAllDisplays: () => [],
};

const Menu = {
  buildFromTemplate: () => ({ popup: noop, items: [] }),
  setApplicationMenu: noop,
};
const MenuItem = class FakeMenuItem { constructor(opts) {} };

const emptyImage = { isEmpty: () => true, toDataURL: () => '', toPNG: () => Buffer.alloc(0) };
const nativeImage = {
  createFromPath: () => emptyImage,
  createFromBuffer: () => emptyImage,
  createEmpty: () => emptyImage,
};

class FakeTray {
  setToolTip() {}
  setContextMenu() {}
  on() { return this; }
  destroy() {}
}

const globalShortcut = {
  register: () => true,
  unregister: noop,
  unregisterAll: noop,
  isRegistered: () => false,
};

const systemPreferences = { getMediaAccessStatus: () => 'granted' };
const powerMonitor = { on: noop, removeListener: noop };
const safeStorage = {
  isEncryptionAvailable: () => false,
  encryptString: (s) => Buffer.from(s),
  decryptString: (b) => b.toString(),
};
const net = { request: () => ({ on: noop, end: noop }) };
const session = {
  defaultSession: {
    webRequest: { onHeadersReceived: noop },
    clearCache: () => Promise.resolve(),
    setSpellCheckerLanguages: noop,
    availableSpellCheckerLanguages: ['en-US'],
  },
};
const desktopCapturer = { getSources: () => Promise.resolve([]) };

// ipcMain stub — the real one is swapped in at runtime via CJS cache
// For ESM imports that land here, provide a basic stub
const ipcMain = {
  handle: noop,
  on: noop,
  removeHandler: noop,
  removeAllListeners: noop,
};

const BrowserWindow = FakeBrowserWindow;
const Notification = FakeNotification;
const Tray = FakeTray;

// autoUpdater stub (some code or electron-updater internals may import this from 'electron')
const autoUpdater = {
  autoDownload: false,
  autoInstallOnAppQuit: false,
  allowPrerelease: false,
  channel: 'latest',
  currentVersion: { version: '0.0.0-web' },
  on: noop,
  once: noop,
  removeListener: noop,
  removeAllListeners: noop,
  checkForUpdates: () => Promise.resolve(null),
  downloadUpdate: () => Promise.resolve([]),
  quitAndInstall: noop,
  setFeedURL: noop,
  getFeedURL: () => '',
  logger: null,
};

// contentTracing stub
const contentTracing = {
  startRecording: () => Promise.resolve(),
  stopRecording: () => Promise.resolve(''),
  getCategories: () => Promise.resolve([]),
  getTraceBufferUsage: () => Promise.resolve({ value: 0, percentage: 0 }),
};

// crashReporter stub
const crashReporter = {
  start: noop,
  getLastCrashReport: () => null,
  getUploadedReports: () => [],
  getParameters: () => ({}),
};

// protocol stub
const protocol = {
  registerSchemesAsPrivileged: noop,
  registerFileProtocol: noop,
  registerHttpProtocol: noop,
  registerStringProtocol: noop,
  registerBufferProtocol: noop,
  registerStreamProtocol: noop,
  interceptFileProtocol: noop,
  handle: noop,
  unhandle: noop,
  isProtocolHandled: () => Promise.resolve(false),
};

// webContents stub
const webContents = {
  getAllWebContents: () => [],
  getFocusedWebContents: () => null,
  fromId: () => null,
};

export {
  app, BrowserWindow, shell, dialog, nativeTheme, clipboard, screen,
  Menu, MenuItem, nativeImage, globalShortcut, systemPreferences,
  powerMonitor, safeStorage, net, session, desktopCapturer, ipcMain,
  Notification, Tray, autoUpdater, contentTracing, crashReporter,
  protocol, webContents,
};

// Default export with all properties (for \`import electron from 'electron'\`)
export default {
  app, BrowserWindow, shell, dialog, nativeTheme, clipboard, screen,
  Menu, MenuItem, nativeImage, globalShortcut, systemPreferences,
  powerMonitor, safeStorage, net, session, desktopCapturer, ipcMain,
  Notification, Tray, autoUpdater, contentTracing, crashReporter,
  protocol, webContents,
};
`;
    return { source, format: "module", shortCircuit: true };
  }

  // Stub for electron-updater
  if (url === "electron-updater://shim") {
    const source = `
const noop = () => {};
export const autoUpdater = {
  autoDownload: false,
  autoInstallOnAppQuit: false,
  allowPrerelease: false,
  channel: 'latest',
  currentVersion: { version: '0.0.0-web' },
  on: noop,
  once: noop,
  removeListener: noop,
  removeAllListeners: noop,
  checkForUpdates: () => Promise.resolve(null),
  downloadUpdate: () => Promise.resolve([]),
  quitAndInstall: noop,
  setFeedURL: noop,
  getFeedURL: () => '',
  logger: null,
};
export class AppUpdater { constructor() {} }
export class NsisUpdater extends AppUpdater {}
export class MacUpdater extends AppUpdater {}
export default autoUpdater;
`;
    return { source, format: "module", shortCircuit: true };
  }

  // Stub for @electron-toolkit/* imports
  if (url.startsWith("electron-toolkit://shim/")) {
    const source = `
const noop = () => {};
export const is = { dev: true, production: false, macOS: process.platform === 'darwin', windows: process.platform === 'win32', linux: process.platform === 'linux' };
export const electronApp = { setAppUserModelId: noop, setAutoLaunch: noop };
export const optimizer = { watchWindowShortcuts: noop };
export default { is, electronApp, optimizer };
`;
    return { source, format: "module", shortCircuit: true };
  }

  return nextLoad(url, context);
}
