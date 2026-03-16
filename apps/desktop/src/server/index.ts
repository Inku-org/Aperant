/**
 * Web server entry point for Auto Claude.
 * Replaces the Electron shell with Express + WebSocket.
 *
 * Boot sequence:
 * 1. Patch the Node.js require cache so `require('electron')` returns our shim
 * 2. Load environment variables
 * 3. Import ipc-compat (drop-in for ipcMain.handle/on)
 * 4. Dynamically import AgentManager and IPC handlers (they pull in 'electron')
 * 5. Start Express (static SPA) + WebSocket server
 */

// ─────────────────────────────────────────────────────────────────────────────
// Step 0: Polyfill CommonJS require for ESM compat (mirrors main/index.ts)
// ─────────────────────────────────────────────────────────────────────────────
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { register } from "node:module";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..", "..");

// Register ESM loader hooks to intercept `import ... from 'electron'`
// This must happen before any dynamic imports of main-process code.
register("./electron-esm-hooks.ts", import.meta.url);

// Fake process.versions.electron so @sentry/electron doesn't crash
// when calling parseSemver(process.versions.electron)
if (!process.versions.electron) {
  (process.versions as any).electron = "0.0.0";
}

const require_ = createRequire(import.meta.url);
// Make require globally available (some modules expect it, same as main/index.ts)
globalThis.require = require_ as unknown as NodeRequire;

// ─────────────────────────────────────────────────────────────────────────────
// Step 1: Electron shim — must be installed BEFORE any handler imports
// ─────────────────────────────────────────────────────────────────────────────
import { createIpcCompat } from "./ipc-compat.js";
const ipcCompat = createIpcCompat();

/**
 * Comprehensive Electron module shim.
 *
 * IPC handler files do `import { ipcMain } from 'electron'` at the top level.
 * By patching the require cache we make those imports resolve to our compat layer.
 *
 * Covers every export observed in the codebase (grep of `from 'electron'`):
 * - ipcMain, app, BrowserWindow, shell, dialog, session, screen, Menu, MenuItem
 * - nativeImage, nativeTheme, Notification, clipboard, Tray, globalShortcut
 * - systemPreferences, powerMonitor, safeStorage, net, desktopCapturer
 */
const userDataDir = path.join(
  process.env.HOME || process.env.USERPROFILE || "/root",
  ".auto-claude",
);

const electronShim: Record<string, unknown> = {
  // ── Core IPC ──────────────────────────────────────────────────────────────
  ipcMain: ipcCompat.ipcMain,

  // ── app ───────────────────────────────────────────────────────────────────
  app: {
    getPath: (name: string) => {
      const paths: Record<string, string> = {
        userData: userDataDir,
        home: process.env.HOME || process.env.USERPROFILE || "/root",
        appData: path.join(
          process.env.HOME || process.env.USERPROFILE || "/root",
          ".config",
        ),
        temp: path.join(require_("os").tmpdir()),
        desktop: path.join(
          process.env.HOME || process.env.USERPROFILE || "/root",
          "Desktop",
        ),
        documents: path.join(
          process.env.HOME || process.env.USERPROFILE || "/root",
          "Documents",
        ),
        logs: path.join(userDataDir, "logs"),
      };
      return paths[name] || appRoot;
    },
    getName: () => "aperant",
    getVersion: () => process.env.npm_package_version || "0.0.0-web",
    getAppPath: () => appRoot,
    getLocaleCountryCode: () => "US",
    isPackaged: false,
    whenReady: () => Promise.resolve(),
    on: () => {},
    once: () => {},
    quit: () => process.exit(0),
    exit: (code?: number) => process.exit(code ?? 0),
    getLocale: () => process.env.LANG?.split(".")[0] || "en-US",
    requestSingleInstanceLock: () => true,
    setName: () => {},
    name: "aperant",
    commandLine: { appendSwitch: () => {} },
    setAppUserModelId: () => {},
    dock: { setIcon: () => {}, bounce: () => -1, setBadge: () => {} },
  },

  // ── BrowserWindow ─────────────────────────────────────────────────────────
  BrowserWindow: class FakeBrowserWindow {
    webContents = {
      send: (..._args: unknown[]) => {},
      on: () => {},
      once: () => {},
      openDevTools: () => {},
      session: {
        setSpellCheckerLanguages: () => {},
        availableSpellCheckerLanguages: ["en-US"],
      },
      setWindowOpenHandler: () => {},
      replaceMisspelling: () => {},
    };
    loadURL() {}
    loadFile() {}
    on() {
      return this;
    }
    once() {
      return this;
    }
    show() {}
    hide() {}
    close() {}
    destroy() {}
    isDestroyed() {
      return false;
    }
    setTitle() {}
    getBounds() {
      return { x: 0, y: 0, width: 1920, height: 1080 };
    }
    setBounds() {}
    getSize() {
      return [1920, 1080];
    }
    setSize() {}
    static getAllWindows() {
      return [];
    }
    static getFocusedWindow() {
      return null;
    }
  },

  // ── shell ─────────────────────────────────────────────────────────────────
  shell: {
    openExternal: (_url: string) => Promise.resolve(),
    showItemInFolder: () => {},
    openPath: (_p: string) => Promise.resolve(""),
  },

  // ── dialog ────────────────────────────────────────────────────────────────
  dialog: {
    showOpenDialog: () => Promise.resolve({ canceled: true, filePaths: [] }),
    showSaveDialog: () =>
      Promise.resolve({ canceled: true, filePath: undefined }),
    showMessageBox: () => Promise.resolve({ response: 0 }),
    showErrorBox: (_title: string, _content: string) => {},
  },

  // ── nativeTheme ───────────────────────────────────────────────────────────
  nativeTheme: {
    shouldUseDarkColors: true,
    themeSource: "system",
    on: () => {},
    off: () => {},
    removeListener: () => {},
    removeAllListeners: () => {},
  },

  // ── Notification ──────────────────────────────────────────────────────────
  Notification: class FakeNotification {
    show() {}
    close() {}
    on() {
      return this;
    }
  },

  // ── clipboard ─────────────────────────────────────────────────────────────
  clipboard: {
    writeText: () => {},
    readText: () => "",
    writeHTML: () => {},
    readHTML: () => "",
  },

  // ── screen ────────────────────────────────────────────────────────────────
  screen: {
    getPrimaryDisplay: () => ({
      workAreaSize: { width: 1920, height: 1080 },
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      scaleFactor: 1,
    }),
    getAllDisplays: () => [],
  },

  // ── Menu / MenuItem ───────────────────────────────────────────────────────
  Menu: {
    buildFromTemplate: () => ({ popup: () => {}, items: [] }),
    setApplicationMenu: () => {},
  },
  MenuItem: class FakeMenuItem {
    constructor(_opts?: unknown) {}
  },

  // ── nativeImage ───────────────────────────────────────────────────────────
  nativeImage: {
    createFromPath: () => ({
      isEmpty: () => true,
      toDataURL: () => "",
      toPNG: () => Buffer.alloc(0),
    }),
    createFromBuffer: () => ({
      isEmpty: () => true,
      toDataURL: () => "",
      toPNG: () => Buffer.alloc(0),
    }),
    createEmpty: () => ({
      isEmpty: () => true,
      toDataURL: () => "",
      toPNG: () => Buffer.alloc(0),
    }),
  },

  // ── Tray ──────────────────────────────────────────────────────────────────
  Tray: class FakeTray {
    setToolTip() {}
    setContextMenu() {}
    on() {
      return this;
    }
    destroy() {}
  },

  // ── globalShortcut ────────────────────────────────────────────────────────
  globalShortcut: {
    register: () => true,
    unregister: () => {},
    unregisterAll: () => {},
    isRegistered: () => false,
  },

  // ── systemPreferences ─────────────────────────────────────────────────────
  systemPreferences: {
    getMediaAccessStatus: () => "granted",
  },

  // ── powerMonitor ──────────────────────────────────────────────────────────
  powerMonitor: {
    on: () => {},
    removeListener: () => {},
  },

  // ── safeStorage ───────────────────────────────────────────────────────────
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },

  // ── net ───────────────────────────────────────────────────────────────────
  net: {
    request: () => ({ on: () => {}, end: () => {} }),
  },

  // ── session ───────────────────────────────────────────────────────────────
  session: {
    defaultSession: {
      webRequest: { onHeadersReceived: () => {} },
      clearCache: () => Promise.resolve(),
      setSpellCheckerLanguages: () => {},
      availableSpellCheckerLanguages: ["en-US"],
    },
  },

  // ── desktopCapturer ───────────────────────────────────────────────────────
  desktopCapturer: {
    getSources: () => Promise.resolve([]),
  },
};

// Patch the require cache so `require('electron')` and named imports resolve
// to our shim. This is the CJS interception strategy — since electron-vite
// compiles main-process code to CJS, this catches all handler imports.
try {
  const electronPath = require_.resolve("electron");
  require_.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: electronShim,
    children: [],
    paths: [],
    path: path.dirname(electronPath),
  } as unknown as NodeModule;
} catch {
  // `electron` not installed (e.g., CI without desktop deps).
  // Create a virtual module entry that maps the bare specifier.
  // Handler code will still get our shim via the Module._resolveFilename hook below.
}

// Fallback: monkey-patch Module._resolveFilename so that any resolution of
// 'electron' that bypasses the cache still returns something we control.
// This is defensive — the cache patch above handles the common case.
import Module from "node:module";
const origResolveFilename = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (
  request: string,
  parent: unknown,
  isMain: boolean,
  options: unknown,
) {
  if (request === "electron") {
    // Return a path that exists in the cache
    try {
      return require_.resolve("electron");
    } catch {
      // If electron isn't installed at all, we still need a cache key
      const virtualPath = path.join(
        appRoot,
        "node_modules",
        "electron",
        "index.js",
      );
      if (!require_.cache[virtualPath]) {
        require_.cache[virtualPath] = {
          id: virtualPath,
          filename: virtualPath,
          loaded: true,
          exports: electronShim,
          children: [],
          paths: [],
          path: path.dirname(virtualPath),
        } as unknown as NodeModule;
      }
      return virtualPath;
    }
  }
  return origResolveFilename.call(this, request, parent, isMain, options);
};

// Also make the shim available globally for edge cases
(globalThis as any).__electronShim = electronShim;

// ─────────────────────────────────────────────────────────────────────────────
// Step 2: Load environment variables
// ─────────────────────────────────────────────────────────────────────────────
import { config } from "dotenv";
import { existsSync } from "node:fs";

const possibleEnvPaths = [
  path.join(appRoot, ".env"),
  path.join(appRoot, ".env.local"),
  path.resolve(process.cwd(), "apps/desktop/.env"),
];

for (const envPath of possibleEnvPaths) {
  if (existsSync(envPath)) {
    config({ path: envPath });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3: Boot Express + WebSocket
// ─────────────────────────────────────────────────────────────────────────────
import express from "express";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import http from "node:http";
import { createWsDispatcher } from "./ws-dispatcher.js";

// Parse CLI flags
const args = process.argv.slice(2);
function getFlag(name: string, fallback: string): string {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}
const PORT = parseInt(getFlag("--port", process.env.PORT || "3000"), 10);
const HOST = getFlag("--host", process.env.HOST || "0.0.0.0");

async function main(): Promise<void> {
  console.log("[web] Starting Auto Claude web server...");
  console.log(`[web] userData dir: ${userDataDir}`);

  // ── Import AgentManager (after electron shim is active) ─────────────────
  let agentManager: any;
  try {
    const { AgentManager } = await import("../main/agent/agent-manager.js");
    agentManager = new AgentManager();
    console.log("[web] AgentManager initialized");
  } catch (err) {
    console.warn(
      "[web] AgentManager failed to initialize, continuing without it:",
      (err as Error).message,
    );
    agentManager = {
      killAll: async () => {},
      configure: () => {},
    };
  }

  // ── Register IPC handlers (mirrors main/index.ts setupIpcHandlers call) ─
  try {
    const { setupIpcHandlers } = await import("../main/ipc-setup.js");
    // Pass null for terminalManager — terminals not supported in web mode.
    // getMainWindow returns the ipcCompat fake window (webContents.send -> broadcast).
    setupIpcHandlers(agentManager, null as any, ipcCompat.getMainWindow as any);
    console.log("[web] IPC handlers registered");
  } catch (err) {
    console.warn(
      "[web] Some IPC handlers failed to register:",
      (err as Error).message,
    );
    // Try the modular handlers directly as fallback
    try {
      const handlers = await import("../main/ipc-handlers/index.js");
      const setupFn = handlers.setupIpcHandlers || (handlers as any).default;
      if (setupFn) {
        setupFn(agentManager, null, ipcCompat.getMainWindow);
        console.log("[web] IPC handlers registered (via fallback)");
      }
    } catch (fallbackErr) {
      console.warn(
        "[web] Fallback IPC handler registration also failed:",
        (fallbackErr as Error).message,
      );
    }
  }

  // ── Express app ─────────────────────────────────────────────────────────
  const app = express();
  const server = http.createServer(app);

  // JSON body parsing for any REST endpoints we may add later
  app.use(express.json());

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      version: electronShim.app && (electronShim.app as any).getVersion(),
    });
  });

  // Serve the built SPA. In production the renderer output lives next to us.
  const staticDir = path.join(__dirname, "..", "renderer");
  if (existsSync(staticDir)) {
    app.use(express.static(staticDir));

    // SPA fallback — any non-API, non-WS request serves index.html
    // Express 5 / path-to-regexp v8 requires '{*path}' instead of '*'
    app.get("{*path}", (_req, res) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });
  } else {
    console.warn(
      `[web] Static directory not found at ${staticDir} — SPA not served`,
    );
    app.get("/", (_req, res) => {
      res.send(
        "Auto Claude web server running. Build the renderer to serve the UI.",
      );
    });
  }

  // ── WebSocket server ────────────────────────────────────────────────────
  const wss = new WebSocketServer({ server, path: "/ws" });
  const dispatcher = createWsDispatcher(ipcCompat);

  wss.on("connection", (ws: WebSocket) => {
    console.log("[web] Client connected");
    ipcCompat.addClient(ws);

    ws.on("message", (raw: Buffer | string) => {
      const message = typeof raw === "string" ? raw : raw.toString();
      dispatcher.handleMessage(ws, message);
    });

    ws.on("close", () => {
      console.log("[web] Client disconnected");
      ipcCompat.removeClient(ws);
    });

    ws.on("error", (err: Error) => {
      console.error("[web] WebSocket error:", err.message);
      ipcCompat.removeClient(ws);
    });
  });

  // ── Start listening ─────────────────────────────────────────────────────
  server.listen(PORT, HOST, () => {
    console.log(`[web] Auto Claude running at http://${HOST}:${PORT}`);
    console.log(`[web] WebSocket endpoint: ws://${HOST}:${PORT}/ws`);
  });

  // ── Graceful shutdown ───────────────────────────────────────────────────
  const shutdown = async () => {
    console.log("[web] Shutting down...");
    try {
      if (agentManager?.killAll) await agentManager.killAll();
    } catch (err) {
      console.warn("[web] Error during agent cleanup:", (err as Error).message);
    }
    wss.close();
    server.close(() => {
      console.log("[web] Server closed");
      process.exit(0);
    });
    // Force exit after 5s if graceful close hangs
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[web] Fatal error:", err);
  process.exit(1);
});
