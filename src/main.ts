import {TranscriptionSettings} from './transcription-settings.js';
import {importAgentVideo} from './agent-import.js';
import { app, BrowserWindow, dialog, ipcMain,safeStorage } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { mkdtempSync,readFileSync } from 'node:fs';
import os from 'node:os';
import { writeFile,rename }  from 'node:fs/promises';
import { Request, Reply } from './contract.js';
import { BrandStore } from './brands.js';
import { MediaWorkspace } from './media.js';
import { checkCapabilities,findMediaExecutable } from './capabilities.js';
import { detectAgents, installMcp } from './agents.js';
import { startService } from './service.js';

const liteRuntime=JSON.parse(readFileSync(path.join(app.getAppPath(),'package.json'),'utf8')).motifRuntime==='lite';
if(app.isPackaged&&process.platform==='win32'&&!liteRuntime)process.env.MOTIF_BUNDLED_ROOT=path.join(process.resourcesPath,'motif-tools');
if(liteRuntime)delete process.env.MOTIF_BUNDLED_ROOT;
if(process.env.MOTIF_SMOKE==='1') app.setPath('userData',mkdtempSync(path.join(os.tmpdir(),'motif-electron-smoke-')));
app.enableSandbox();
void app.whenReady().then(async () => {
if(process.platform==='win32')app.setAppUserModelId('local.motif.desktop');
const media=new MediaWorkspace();
const transcription=new TranscriptionSettings(path.join(app.getPath('userData'),'motif-secrets'),{available:()=>safeStorage.isEncryptionAvailable()&&(process.platform!=='linux'||!['basic_text','unknown'].includes(safeStorage.getSelectedStorageBackend())),encrypt:s=>safeStorage.encryptString(s),decrypt:b=>safeStorage.decryptString(b)});
let approvingJob=false;
const runMedia=async(sourceId:string,kind:'render'|'transcribe'|'captions')=>{
 if(approvingJob)throw Error('A job approval is already open');approvingJob=true;
 try{const settings=await transcription.status();const groq=kind==='transcribe'&&settings.provider==='groq';const approval=await dialog.showMessageBox(window,{type:'question',buttons:['Cancel',groq?'Upload audio to Groq':'Run local job'],defaultId:0,cancelId:0,message:`Run ${kind} on this imported source?`,detail:groq?'First 60 seconds only. Audio leaves this device and is sent directly to Groq using whisper-large-v3 and your API key. Free-tier quotas/rate limits apply; your Groq account controls billing. No automatic retries or paid-plan upgrade. Transcript stays in the project.':'Local processing only. Render/transcription capped at 60 seconds. Local transcription needs cached large-v3-q5_0 and whisper.cpp. Captions use the uncorrected transcript.'});if(approval.response!==1)throw Error('Job not approved');return await media.run(sourceId,kind,{ffmpeg:await findMediaExecutable('ffmpeg'),whisper:groq?undefined:await findMediaExecutable('whisper-cli'),hyperframes:await findMediaExecutable('hyperframes')},groq?{key:await transcription.key()}:undefined);}finally{approvingJob=false;}
};
let approvingImport=false;
const service = await startService({state:()=>media.state(),run:runMedia,cancel:()=>media.cancel(),importVideo:async file=>{if(approvingImport)throw Error('Import approval already open');const project=media.state().project;if(!project)throw Error('Choose a project folder in MOTIF once before agent imports');approvingImport=true;try{return await importAgentVideo(file,async(file,bytes)=>{const answer=await dialog.showMessageBox(window,{type:'question',buttons:['Cancel','Copy video'],defaultId:0,cancelId:0,message:'Allow your agent to import this video?',detail:`${file}\n${bytes} bytes\nProject: ${project}\nA copy goes into the selected project. Original stays unchanged.`});return answer.response===1;},file=>{if(media.state().project!==project)throw Error('Project changed during approval; retry import');return media.importSource(file);});}finally{approvingImport=false;}}});
const brands=new BrandStore(path.join(app.getPath('userData'),'motif-data'));
let capabilityCheck:Promise<unknown>|undefined;
const page = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/index.html');
const pageURL = pathToFileURL(page).href;
const window = new BrowserWindow({ width: 1440, height: 900, minWidth: 760, minHeight: 620, frame: false, icon: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../build/icon.png'), webPreferences: {
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
  let request:Request;try{request=Request.parse(raw);}catch{throw Error('Invalid app request');}
  if(request.kind==='transcription-settings')return Reply.parse({kind:'transcription-settings',settings:await transcription.status()});
  if(request.kind==='transcription-save')return Reply.parse({kind:'transcription-settings',settings:await transcription.save(request.provider,request.key)});
  if(request.kind==='transcription-key-remove')return Reply.parse({kind:'transcription-settings',settings:await transcription.remove()});
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
    const approval=await dialog.showMessageBox(window,{type:'question',buttons:['Cancel','Add MCP'],defaultId:0,cancelId:0,message:`Add MOTIF to ${request.agent}?`,detail:'Close the agent before continuing. This adds a local project connector with native approval for media jobs (Groq transcription uploads audio), preserves other settings and saves a backup. Restart the agent afterward. It does not connect AI models.'});
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
  await window.webContents.executeJavaScript("document.querySelector('.brand-card button').click()");
  await new Promise(resolve=>setTimeout(resolve,150));
  await window.webContents.executeJavaScript("document.querySelector('[aria-label=Blue]').click()");
  await new Promise(resolve=>setTimeout(resolve,150));
  await window.webContents.executeJavaScript("document.querySelector('[aria-label=White]').click()");
  await new Promise(resolve=>setTimeout(resolve,150));
  await writeFile('/tmp/motif-brand-picker.png',(await window.webContents.capturePage()).toPNG());
  await window.webContents.executeJavaScript("document.querySelector('.brand-form button.primary').click()");
  await new Promise(resolve=>setTimeout(resolve,350));
  const colored=(await brands.list())[0];if(!colored.colors.includes('#2563eb')||!colored.colors.includes('#ffffff')||!colored.colors.includes('#21574f'))throw Error('Color picker did not preserve/save swatches');
  console.log('COLOR_PICKER_SMOKE',JSON.stringify({saved:true,colors:colored.colors}));
  await window.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(b=>b.textContent==='Transcription settings').click()");
  await new Promise(resolve=>setTimeout(resolve,200));
  await writeFile('/tmp/motif-groq-settings.png',(await window.webContents.capturePage()).toPNG());
  await window.webContents.executeJavaScript("[...document.querySelectorAll('.transcription-panel button')].find(b=>b.textContent==='Close').click()");

  const project=mkdtempSync(path.join(os.tmpdir(),'motif-media-ui-'));const source=path.join(project,'verification.mp4');execFileSync('/usr/bin/ffmpeg',['-v','error','-f','lavfi','-i','color=c=teal:s=160x120:d=0.5','-c:v','libx264','-threads','1',source]);await media.select(project);const imported=await media.importSource(source);await media.run(imported.sources[0].id,'render',{ffmpeg:'/usr/bin/ffmpeg'});
  await window.webContents.executeJavaScript("document.querySelectorAll('.sidebar nav button')[0].click()");await new Promise(resolve=>setTimeout(resolve,2200));await writeFile('/tmp/motif-media-real.png',(await window.webContents.capturePage()).toPNG());
  app.quit();
}

}).catch(error => { console.error(error); app.exit(1); });
