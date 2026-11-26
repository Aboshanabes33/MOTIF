import {transcribeGroq} from './groq.js';
import {bundledArgs,bundledEnv} from './bundled-tools.js';
import {requireModel,transcribe} from './transcribe.js';
import {mkdir,readFile,writeFile,rename,open,lstat,unlink,copyFile,access} from 'node:fs/promises';import {constants} from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {spawn} from 'node:child_process';import {z} from 'zod';
const Source=z.object({id:z.string().uuid(),name:z.string(),file:z.string().uuid()});
const Job=z.object({id:z.string().uuid(),sourceId:z.string().uuid(),kind:z.enum(['render','transcribe','captions']),state:z.enum(['running','succeeded','failed','cancelled']),startedAt:z.string(),finishedAt:z.string().optional(),output:z.string().optional(),error:z.string().optional()});
const Doc=z.object({version:z.literal(1),sources:z.array(Source),jobs:z.array(Job)});
export type MediaState={project:string|null;sources:z.infer<typeof Source>[];jobs:z.infer<typeof Job>[]};
export type CloudTranscription={key:string;fetcher?:typeof fetch};
export class MediaWorkspace {
 private abort:AbortController|null=null; private done:Promise<unknown>|null=null;
 private root:string|null=null;private doc:z.infer<typeof Doc>={version:1,sources:[],jobs:[]};private active:ReturnType<typeof spawn>|null=null;private starting=false;private lock:Awaited<ReturnType<typeof open>>|null=null;
 state():MediaState{return {project:this.root,sources:this.doc.sources,jobs:this.doc.jobs};}
 private base(){if(!this.root)throw new Error('Choose a project folder in MOTIF first');return path.join(this.root,'.motif');}
 private async persist(){const base=this.base();const file=path.join(base,'workspace.json');const temp=file+'.'+randomUUID();await writeFile(temp,JSON.stringify(Doc.parse(this.doc),null,2),{flag:'wx',mode:0o600});await rename(temp,file);}
 async select(root:string){
  if(this.starting||this.active)throw new Error('Stop the running job before changing projects');
  if((await lstat(root)).isSymbolicLink())throw new Error('Linked project roots are unsupported');
  const base=path.join(root,'.motif');await mkdir(base,{recursive:true,mode:0o700});if((await lstat(base)).isSymbolicLink())throw new Error('Linked project storage is unsupported');
  for(const dir of ['sources','outputs']){await mkdir(path.join(base,dir),{mode:0o700,recursive:true});if((await lstat(path.join(base,dir))).isSymbolicLink())throw new Error('Linked storage is unsupported');}
  const lock=await open(path.join(base,'workspace.lock'),'wx',0o600);
  let doc:z.infer<typeof Doc>={version:1,sources:[],jobs:[]};
  try {try{const file=path.join(base,'workspace.json');const st=await lstat(file);if(!st.isFile()||st.size>4*1024*1024)throw new Error('Invalid workspace');doc=Doc.parse(JSON.parse(await readFile(file,'utf8')));}catch(e:any){if(e.code!=='ENOENT')throw e;}}
  catch(e){await lock.close();await unlink(path.join(base,'workspace.lock'));throw e;}
  await this.close();this.root=root;this.lock=lock;this.doc=doc;
  for(const job of this.doc.jobs)if(job.state==='running'){job.state='failed';job.error='Interrupted before completion';job.finishedAt=new Date().toISOString();}
  await this.persist();return this.state();
 }
 async importSource(file:string){
  const base=this.base();if(this.starting||this.active)throw new Error('Wait for the active job before importing');if(this.doc.sources.length>=1000)throw new Error('Source limit reached');
  const st=await lstat(file);if(!st.isFile()||st.isSymbolicLink()||st.size>2*1024**3||st.size===0)throw new Error('Select a regular nonempty video under 2 GiB');
  if(!/\.(mp4|mov|mkv|webm)$/i.test(file))throw new Error('Supported source extensions: MP4, MOV, MKV, WebM');
  const id=randomUUID();const dest=path.join(base,'sources',id);
  await copyFile(file,dest,constants.COPYFILE_EXCL);
  const source={id,name:path.basename(file),file:id};this.doc.sources.push(source);try{await this.persist();}catch(e){this.doc.sources.pop();await unlink(dest);throw e;}return this.state();
 }
 async run(sourceId:string,kind:'render'|'transcribe'|'captions',executables:{ffmpeg?:string;whisper?:string;hyperframes?:string},cloud?:CloudTranscription){if(this.starting||this.active)throw new Error('One job at a time');this.starting=true;try{this.done=this.runJob(sourceId,kind,executables,cloud);return await this.done;}finally{this.starting=false;this.done=null;}}
 private async runJob(sourceId:string,kind:'render'|'transcribe'|'captions',executables:{ffmpeg?:string;whisper?:string;hyperframes?:string},cloud?:CloudTranscription){
  z.string().uuid().parse(sourceId);if(this.active)throw new Error('One job at a time');const base=this.base();const source=this.doc.sources.find(s=>s.id===sourceId);if(!source)throw new Error('Unknown source ID');
  if(this.doc.jobs.length>=1000)throw new Error('Job history limit reached');
  const executable=kind==='render'?executables.ffmpeg:kind==='transcribe'?executables.whisper:executables.hyperframes;if(!executable&&!(kind==='transcribe'&&cloud))throw new Error('Required tool is unavailable');
  if(kind==='transcribe'){if(!cloud)await requireModel();if(!executables.ffmpeg)throw new Error('FFmpeg is required to extract bounded audio');}
  const input=path.join(base,'sources',source.file);if(!(await lstat(input)).isFile()||(await lstat(input)).isSymbolicLink())throw new Error('Invalid managed source');
    let captionData:{segments:{start:number;end:number;text:string}[]}|undefined;
  if(kind==='captions'){const transcript=[...this.doc.jobs].reverse().find(j=>j.sourceId===sourceId&&j.kind==='transcribe'&&j.state==='succeeded');if(!transcript?.output)throw new Error('Run transcription first');captionData=z.object({segments:z.array(z.object({start:z.number().nonnegative().max(60),end:z.number().positive().max(60),text:z.string().max(500)}).refine(s=>s.end>s.start)).min(1).max(200)}).parse(JSON.parse(await readFile(path.join(base,'outputs',transcript.id,source.file+'.json'),'utf8')));}
  const id=randomUUID();const outputDir=path.join(base,'outputs',id);await mkdir(outputDir,{mode:0o700}).catch(e=>{this.starting=false;throw e;});
  const job:z.infer<typeof Job>={id,sourceId,kind,state:'running',startedAt:new Date().toISOString()};this.doc.jobs.push(job);try{await this.persist();}catch(e){this.starting=false;throw e;}
  const output=path.join(outputDir,'output.mp4');
  // Fixed bounded arguments, no shell or agent-supplied executable/path/filter/URL.
  let timer:ReturnType<typeof setTimeout>|undefined;let error='';let cancelled=false;
  this.abort=new AbortController();
  try{
  if(kind==='captions'){await copyFile(input,path.join(outputDir,'source.mp4'),constants.COPYFILE_EXCL);const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));const duration=Math.max(...captionData!.segments.map(s=>s.end));const captions=captionData!.segments.map(s=>`<div class="clip caption" data-start="${s.start}" data-duration="${s.end-s.start}" dir="rtl">${esc(s.text)}</div>`).join('');await writeFile(path.join(outputDir,'index.html'),`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#16403c}#motif{width:640px;height:360px;position:relative;overflow:hidden}video{width:100%;height:100%;object-fit:contain}.caption{position:absolute;bottom:24px;left:24px;right:24px;text-align:center;background:#071819e6;border-radius:12px;padding:12px;color:white;font:24px Arial;line-height:1.4;direction:rtl}</style></head><body><div id="motif" data-composition-id="motif" data-width="640" data-height="360" data-start="0" data-duration="${duration}" data-no-timeline><video id="source" src="./source.mp4" data-start="0" data-duration="${duration}" data-has-audio="true" playsinline></video>${captions}</div></body></html>`,{flag:'wx',mode:0o600});}
  const args=kind==='captions'?['render',outputDir,'--output',output,'--fps','12','--workers','1','--quality','draft','--low-memory-mode','--no-browser-gpu']:kind==='render'?['-nostdin','-v','error','-protocol_whitelist','file,pipe','-i',input,'-t','60','-vf','scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2','-c:v','libx264','-threads','2','-preset','ultrafast','-c:a','aac','-y',output]:[];
  const run=async(exe:string,arguments_:string[])=>{this.abort?.signal.throwIfAborted();const child=spawn(exe,bundledArgs(exe,arguments_),{shell:false,windowsHide:true,stdio:['ignore','ignore','pipe'],env:{...bundledEnv(),OMP_NUM_THREADS:'1',MKL_NUM_THREADS:'1'}});this.active=child;this.starting=false;
   timer=setTimeout(()=>{error='Job timed out';child.kill();setTimeout(()=>child.kill('SIGKILL'),2000).unref();},120000);
   child.stderr?.on('data',data=>{error=(error+data.toString()).slice(-2000);});
   try{await new Promise<void>((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>{cancelled=signal==='SIGTERM';if(code===0)resolve();else reject(new Error(cancelled?'Cancelled':error||'Tool failed'));});});}finally{clearTimeout(timer);this.active=null;this.starting=true;}
  };
  if(kind==='transcribe'){if(cloud)await transcribeGroq(input,outputDir,source.file,executables.ffmpeg!,cloud.key,run,this.abort.signal,cloud.fetcher);else await transcribe(input,outputDir,source.file,executables.ffmpeg!,executable!,run);}else await run(executable!,args);
   const result=kind!=='transcribe'?output:path.join(outputDir,source.file+'.json');const st=await lstat(result);if(!st.isFile()||st.size===0)throw new Error('No output produced');job.state='succeeded';job.output=path.relative(base,result);
  }catch(e){job.state=cancelled||this.abort?.signal.aborted?'cancelled':'failed';job.error=e instanceof Error?e.message.slice(-500):'Job failed';}
  finally{clearTimeout(timer);this.active=null;this.abort=null;job.finishedAt=new Date().toISOString();await this.persist();}return this.state();
 }
 cancel(){if(!this.active&&!this.abort)throw new Error('No active job');this.abort?.abort();this.active?.kill();}
 async shutdown(){this.abort?.abort();if(this.active){this.active.kill('SIGTERM');await new Promise<void>(resolve=>{const child=this.active!;const timeout=setTimeout(()=>{child.kill('SIGKILL');resolve();},3000);child.once('close',()=>{clearTimeout(timeout);resolve();});});}await this.done;await this.close();}
 async close(){if(this.active)throw new Error('Active job must finish before shutdown');if(this.lock){const file=path.join(this.base(),'workspace.lock');await this.lock.close();await unlink(file);this.lock=null;}this.root=null;}
}
