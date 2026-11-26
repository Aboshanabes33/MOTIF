const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("motifDesktop", {
  isElectron: true,
  platform: process.platform,
  minimize: () => ipcRenderer.invoke("motif:win:minimize"),
  maximize: () => ipcRenderer.invoke("motif:win:maximize"),
  isMaximized: () => ipcRenderer.invoke("motif:win:isMaximized"),
  close: () => ipcRenderer.invoke("motif:win:close"),
  onMaximizeChange: (cb) => {
    const handler = (_event, maximized) => cb(Boolean(maximized));
    ipcRenderer.on("motif:win:maximized", handler);
    return () => ipcRenderer.removeListener("motif:win:maximized", handler);
  },
  openExternal: (url) => ipcRenderer.invoke("motif:openExternal", String(url || "")),
  getAppInfo: () => ipcRenderer.invoke("motif:appInfo"),
});
