import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain, shell } from "electron";
import { startMotifServer } from "../server/motif-server.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, "..");

let mainWindow = null;
let backendServer = null;

function resolveUnpackedPath(...segments) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app.asar.unpacked", ...segments);
  }
  return path.join(APP_ROOT, ...segments);
}

function getDataDir() {
  if (process.env.MOTIF_DATA) return path.resolve(process.env.MOTIF_DATA);
  return path.join(app.getPath("userData"), "workspace");
}

function getIconPath() {
  const file = process.platform === "win32" ? "icon.ico" : "icon.png";
  return path.join(APP_ROOT, "build", file);
}

async function createMainWindow(targetUrl) {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    title: "MOTIF",
    backgroundColor: "#0c2729",
    icon: getIconPath(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("maximize", () => {
    mainWindow?.webContents.send("motif:win:maximized", true);
  });

  mainWindow.on("unmaximize", () => {
    mainWindow?.webContents.send("motif:win:maximized", false);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(targetUrl);
}

function registerIpc(mcpScriptPath, dataDir) {
  ipcMain.handle("motif:win:minimize", () => {
    mainWindow?.minimize();
  });

  ipcMain.handle("motif:win:maximize", () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
      return false;
    }
    mainWindow.maximize();
    return true;
  });

  ipcMain.handle("motif:win:isMaximized", () => {
    return Boolean(mainWindow?.isMaximized());
  });

  ipcMain.handle("motif:win:close", () => {
    mainWindow?.close();
  });

  ipcMain.handle("motif:openExternal", async (_event, url) => {
    if (typeof url === "string" && /^https?:\/\//i.test(url)) {
      await shell.openExternal(url);
    }
  });

  ipcMain.handle("motif:appInfo", () => ({
    version: app.getVersion(),
    mcpPath: mcpScriptPath,
    dataDir,
    platform: process.platform,
  }));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    const dataDir = getDataDir();
    const mcpScriptPath = resolveUnpackedPath("mcp", "motif-mcp.mjs");
    const staticDir = path.join(APP_ROOT, "dist-web");

    registerIpc(mcpScriptPath, dataDir);

    const devUrl = process.env.MOTIF_DEV_URL;
    if (devUrl) {
      await createMainWindow(devUrl);
      return;
    }

    // Fixed port so the WorkOS sign-in redirect URI stays http://127.0.0.1:8795. If it is taken, fall back to a
    // random port (sign-in will then not work until the other program is closed).
    const serverOptions = { host: "127.0.0.1", dataDir, staticDir, mcpScriptPath, runtime: "electron" };
    const preferredPort = Number(process.env.MOTIF_PORT || 8795);
    try {
      backendServer = await startMotifServer({ ...serverOptions, port: preferredPort });
    } catch (err) {
      if (preferredPort === 0) throw err;
      backendServer = await startMotifServer({ ...serverOptions, port: 0 });
    }

    await createMainWindow(backendServer.url);
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("before-quit", async () => {
    if (backendServer) {
      const srv = backendServer;
      backendServer = null;
      await srv.close().catch(() => {});
    }
  });
}
