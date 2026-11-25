import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import { writeFile,rename }  from 'node:fs/promises';
import { Request, Reply } from './contract.js';
import { BrandStore } from './brands.js';
import { MediaWorkspace } from './media.js';
import { checkCapabilities,findMediaExecutable } from './capabilities.js';
import { detectAgents, installMcp } from './agents.js';
import { startService } from './service.js';

if(process.env.MOTIF_SMOKE==='1') app.setPath('userData',mkdtempSync(path.join(os.tmpdir(),'motif-electron-smoke-')));
app.enableSandbox();
void app.whenReady().then(async () => {
const media=new MediaWorkspace();
let approvingJob=false;
const runMedia=async(sourceId:string,kind:'render'|'transcribe'|'captions')=>{if(approvingJob)throw new Error('A job approval is already open');approvingJob=true;try{const approval=await dialog.showMessageBox(window,{type:'question',buttons:['Cancel','Run local job'],defaultId:0,cancelId:0,message:`Run ${kind} on this imported source?`,detail:'Only the selected project source ID is allowed. Outputs stay inside .motif/outputs. No provider request. Render is capped at 60 seconds of video. Transcription uses cached large-v3-q5_0 via whisper.cpp in bounded chunks; no download. Captions use the uncorrected transcript.'});if(approval.response!==1)throw new Error('Job not approved');return media.run(sourceId,kind,{ffmpeg:await findMediaExecutable('ffmpeg'),whisper:await findMediaExecutable('whisper-cli'),hyperframes:await findMediaExecutable('hyperframes')});}finally{approvingJob=false;}};
const service = await startService({state:()=>media.state(),run:runMedia,cancel:()=>media.cancel()});
const brands=new BrandStore(path.join(app.getPath('userData'),'motif-data'));
let capabilityCheck:Promise<unknown>|undefined;
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
  if(request.kind==='media-state')return Reply.parse({kind:'media',state:media.state()});
  if(request.kind==='project-select'){const answer=await dialog.showOpenDialog(window,{title:'Choose project folder. MOTIF will create .motif storage inside it.',properties:['openDirectory','createDirectory']});if(answer.canceled)throw new Error('Cancelled');return Reply.parse({kind:'media',state:await media.select(answer.filePaths[0])});}
  if(request.kind==='source-import'){const answer=await dialog.showOpenDialog(window,{title:'Copy a source video into project storage (up to 2 GiB)',properties:['openFile'],filters:[{name:'Video',extensions:['mp4','mov','mkv','webm']}]});if(answer.canceled)throw new Error('Cancelled');return Reply.parse({kind:'media',state:await media.importSource(answer.filePaths[0])});}
  if(request.kind==='media-run')return Reply.parse({kind:'media',state:await runMedia(request.sourceId,request.job)});
  if(request.kind==='media-cancel'){media.cancel();return Reply.parse({kind:'media',state:media.state()});}
  if(request.kind==='brands')return Reply.parse({kind:'brands',brands:await brands.list()});
  if(request.kind==='brand-save')return Reply.parse({kind:'brands',brands:await brands.save(request.brand,request.id)});
  if(request.kind==='brand-remove'){const answer=await dialog.showMessageBox(window,{type:'warning',buttons:['Cancel','Delete brand'],defaultId:0,cancelId:0,message:'Delete this local Brand?',detail:'Only metadata is removed. Source files and outputs are not touched.'});if(answer.response!==1)throw new Error('Delete cancelled');return Reply.parse({kind:'brands',brands:await brands.remove(request.id)});}
  if(request.kind==='capabilities'){capabilityCheck??=checkCapabilities().finally(()=>{capabilityCheck=undefined;});return Reply.parse({kind:'capabilities',capabilities:await capabilityCheck});}
  if (request.kind === 'agents') return Reply.parse({kind:'agents',agents:await detectAgents()});
  if (request.kind === 'window') { if(request.action==='minimize') window.minimize(); else if(request.action==='maximize') { if(window.isMaximized()) window.unmaximize();else window.maximize(); } else setImmediate(()=>window.close()); return {kind:'window'}; }
  if (request.kind === 'install') {
    if(installing) throw new Error('Setup already active'); installing=true;
    try {
    const approval=await dialog.showMessageBox(window,{type:'question',buttons:['Cancel','Add MCP'],defaultId:0,cancelId:0,message:`Add MOTIF to ${request.agent}?`,detail:'Close the agent before continuing. This adds a local project connector with native approval for media jobs, preserves other settings and saves a backup. Restart the agent afterward. It does not connect AI models.'});
    if(approval.response!==1) throw new Error('Setup cancelled');
    const connection=path.join(app.getPath('userData'),'motif-session.json');
    const credential=service.approveClient('desktop-registration');
    const pending=connection+'.'+Date.now();await writeFile(pending,JSON.stringify({url:service.url,token:credential.token}),{mode:0o600,flag:'wx'});await rename(pending,connection);
    const result=await installMcp(request.agent,{connection,command:process.execPath,script:path.join(path.dirname(fileURLToPath(import.meta.url)),'mcp-stdio.cjs')});
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
  void service.close().then(()=>media.shutdown()).finally(() => app.quit());
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
  const saved=await window.webContents.executeJavaScript("window.motif.request({kind:'brand-save',brand:{name:'Desktop verification Brand',voice:'Real local test metadata, created for this smoke test only.',colors:['#21574f','#eef5f3']}})");
  if(saved.kind!=='brands'||saved.brands.length!==1)throw new Error('Brand IPC save failed');
  await window.reload();
  await new Promise(resolve=>setTimeout(resolve,500));
  await window.webContents.executeJavaScript("document.querySelector('.setup-buttons button').click();document.querySelectorAll('.sidebar nav button')[1].click()");
  await new Promise(resolve=>setTimeout(resolve,250));
  await writeFile('/tmp/motif-brand-saved.png',(await window.webContents.capturePage()).toPNG());
  const restored=await brands.list();if(restored.length!==1)throw new Error('Brand reload failed');
  console.log('BRAND_SMOKE',JSON.stringify({saved:true,reloaded:true,id:restored[0].id}));
  const project=mkdtempSync(path.join(os.tmpdir(),'motif-media-ui-'));const source=path.join(project,'verification.mp4');execFileSync('/usr/bin/ffmpeg',['-v','error','-f','lavfi','-i','color=c=teal:s=160x120:d=0.5','-c:v','libx264','-threads','1',source]);await media.select(project);const imported=await media.importSource(source);await media.run(imported.sources[0].id,'render',{ffmpeg:'/usr/bin/ffmpeg'});
  await window.webContents.executeJavaScript("document.querySelectorAll('.sidebar nav button')[0].click()");await new Promise(resolve=>setTimeout(resolve,2200));await writeFile('/tmp/motif-media-real.png',(await window.webContents.capturePage()).toPNG());
  app.quit();
}

}).catch(error => { console.error(error); app.exit(1); });
