import { initWebBridge } from "./web-bridge";

// Set platform globals (DGX Spark runs Linux)
(window as any).platform = {
  isWindows: false,
  isMacOS: false,
  isLinux: true,
  isUnix: true,
};
(window as any).DEBUG = false;
(window as any).BUILD_TARGET = "web";

async function bootstrap() {
  try {
    // Connect WebSocket bridge
    const bridge = await initWebBridge();

    // Set global bridge so ipc-utils.ts and electron-stub can detect web mode
    (globalThis as any).__webBridge = bridge;

    // Create the real electronAPI using the preload factory BEFORE the renderer loads.
    // This prevents browser-mock.ts from installing mock data — it checks
    // `window.electronAPI !== undefined` and skips if it already exists.
    const { createElectronAPI } = await import("../preload/api");
    (window as any).electronAPI = createElectronAPI();

    // Dynamically import the renderer entry AFTER the bridge is ready.
    // renderer/main.tsx executes createRoot() as a side effect on import,
    // so by the time it runs, all IPC calls will route through the WS bridge.
    await import("../renderer/main");
  } catch (err) {
    document.body.innerHTML = `
      <div style="padding: 2rem; font-family: system-ui; color: #ef4444;">
        <h1>Connection Failed</h1>
        <p>Could not connect to the Auto Claude server. Make sure the server is running.</p>
        <pre>${err}</pre>
        <button onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}

bootstrap();
