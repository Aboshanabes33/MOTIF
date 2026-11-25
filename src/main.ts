import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { Request, Reply } from './contract.js';
import { detectAgents, installMcp } from './agents.js';
import { startService } from './service.js';

app.enableSandbox();
void app.whenReady().then(async () => {
const service = await startService();
const page = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/index.html');
const pageURL = pathToFileURL(page).href;
const window = new BrowserWindow({ width: 1440, height: 900, minWidth: 760, minHeight: 620, frame: false, webPreferences: {
  preload: path.join(path.dirname(fileURLToPath(import.meta.url)), 'preload.cjs'),
  nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true,
} });
window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
window.webContents.on('will-navigate', event => event.preventDefault());
window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
window.webContents.session.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith(pathToFileURL(path.dirname(page) + path.sep).href) }));
let pairing = false;
let installing = false;
ipcMain.handle('motif:request', async (event, raw: unknown) => {
  if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== pageURL) throw new Error('Untrusted sender');
  const request = Request.parse(raw);
  if (request.kind === 'agents') return Reply.parse({kind:'agents',agents:await detectAgents()});
  if (request.kind === 'window') { if(request.action==='minimize') window.minimize(); else if(request.action==='maximize') { if(window.isMaximized()) window.unmaximize();else window.maximize(); } else setImmediate(()=>window.close()); return {kind:'window'}; }
  if (request.kind === 'install') {
    if(installing) throw new Error('Setup already active'); installing=true;
    try {
    const approval=await dialog.showMessageBox(window,{type:'question',buttons:['Cancel','Add MCP'],defaultId:0,cancelId:0,message:`Add MOTIF to ${request.agent}?`,detail:'Close the agent before continuing. This adds a local read-only status connector, preserves other settings and saves a backup. Restart the agent afterward. It does not connect AI models or enable media tools.'});
    if(approval.response!==1) throw new Error('Setup cancelled');
    const result=await installMcp(request.agent,{command:process.execPath,script:path.join(path.dirname(fileURLToPath(import.meta.url)),'mcp-stdio.cjs')});
    return Reply.parse({kind:'installed',...result});
    } finally { installing=false; }
  }
  if (request.kind === 'status') return Reply.parse(service.status());
  if (pairing) throw new Error('Pairing already open');
  pairing = true;
  try {
    const approval = await dialog.showMessageBox(window, { type: 'question', buttons: ['Cancel', 'Approve'], defaultId: 0, cancelId: 0,
      message: 'Pair a local MCP client for 15 minutes?', detail: 'The client can only read the MOTIF Phase 0 name. Save the credential file privately and configure your client manually. No automatic install.' });
    if (approval.response !== 1) return Reply.parse({ kind: 'pair', saved: false });
    const destination = await dialog.showSaveDialog(window, { title: 'Save private MCP client configuration', defaultPath: 'motif-client.json' });
    if (destination.canceled || !destination.filePath) return Reply.parse({ kind: 'pair', saved: false });
    const credential = service.approveClient('local-owner-client');
    // Exclusive creation: never overwrite a file or follow an existing symlink.
    await writeFile(destination.filePath, JSON.stringify({ url: service.url, token: credential.token, expiresInSeconds: credential.expiresInSeconds }, null, 2), { flag: 'wx', mode: 0o600 });
    return Reply.parse({ kind: 'pair', saved: true });
  } finally { pairing = false; }
});
let quitting = false;
app.on('before-quit', event => {
  if (quitting) return;
  event.preventDefault(); quitting = true;
  ipcMain.removeHandler('motif:request');
  void service.close().finally(() => app.quit());
});
app.on('window-all-closed', () => app.quit());

await window.loadFile(page);
if (process.env.MOTIF_SMOKE === '1') {
  const result = await window.webContents.executeJavaScript(`(async () => ({nodeAbsent: typeof require === 'undefined' && typeof process === 'undefined', status: await window.motif.request({kind:'status'}), invalidRejected: await window.motif.request({kind:'shell',command:'whoami'}).then(()=>false,()=>true)}))()`);
  if (!result.nodeAbsent || !result.invalidRejected || result.status.name !== 'MOTIF Phase 0') throw new Error('Electron smoke failed');
  await new Promise(resolve=>setTimeout(resolve,250));
  await writeFile('/tmp/motif-onboarding.png',(await window.webContents.capturePage()).toPNG());
  await window.webContents.executeJavaScript("document.querySelector('.setup-buttons button').click()");
  await new Promise(resolve => setTimeout(resolve, 150));
  console.log('ELECTRON_SMOKE', JSON.stringify(result));
  await writeFile('/tmp/motif-phase0.png', (await window.webContents.capturePage()).toPNG());
  app.quit();
}

}).catch(error => { console.error(error); app.exit(1); });
