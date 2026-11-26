import {bundledExecutable,bundledArgs,bundledEnv,bundledRoot} from './bundled-tools.js';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {access,stat} from 'node:fs/promises';import {constants} from 'node:fs';import path from 'node:path';
const exec=promisify(execFile);
export interface Capability {id:string;name:string;available:boolean;detail:string}
export async function checkCapabilities(env:NodeJS.ProcessEnv=process.env):Promise<Capability[]> {
 const definitions=[{id:'ffmpeg',name:'FFmpeg',args:['-version']},{id:'ffprobe',name:'FFprobe',args:['-version']},{id:'whisper-cli',name:'Whisper.cpp',args:['--help']},{id:'hyperframes',name:'HyperFrames',args:['--version']}];
 return Promise.all(definitions.map(async tool=>{
  let executable=bundledExecutable(tool.id)??'';
  if(!executable&&!bundledRoot())for(const dir of (env.PATH??'').split(path.delimiter).filter(Boolean)){
   const candidate=path.join(dir,tool.id+(process.platform==='win32'?'.exe':''));
   try{await access(candidate,process.platform==='win32'?constants.F_OK:constants.X_OK);if((await stat(candidate)).isFile()){executable=candidate;break;}}catch{}
  }
  if(!executable)return {id:tool.id,name:tool.name,available:false,detail:'Required executable missing from bundled runtime or development PATH. No installation attempted.'};
  try{const r=await exec(executable,bundledArgs(executable,tool.args),{timeout:8000,maxBuffer:128*1024,windowsHide:true,env:bundledEnv(env)});return {id:tool.id,name:tool.name,available:true,detail:(r.stdout||r.stderr).split('\n').find(line=>line.trim())?.slice(0,240)||'Command completed successfully'};}
  catch{return {id:tool.id,name:tool.name,available:false,detail:'Executable found but health check failed or timed out. No media job was run.'};}
 }));
}

export async function findMediaExecutable(id:'ffmpeg'|'whisper-cli'|'hyperframes'):Promise<string|undefined>{const included=bundledExecutable(id);if(included||bundledRoot())return included;for(const dir of (process.env.PATH??'').split(path.delimiter).filter(Boolean)){const file=path.join(dir,id+(process.platform==='win32'?'.exe':''));try{await access(file,process.platform==='win32'?constants.F_OK:constants.X_OK);if((await stat(file)).isFile())return file;}catch{}}}
