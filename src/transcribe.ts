import {bundledRoot} from './bundled-tools.js';
import {access,readFile,writeFile,readdir} from 'node:fs/promises';import path from 'node:path';
export const DEFAULT_MODEL='large-v3-q5_0';
export function modelPath(){const root=bundledRoot();if(root)return path.join(root,'models',`ggml-${DEFAULT_MODEL}.bin`);return path.join(process.env.HOME??process.env.USERPROFILE??'','.cache','whisper',`ggml-${DEFAULT_MODEL}.bin`);}
export async function requireModel(){try{await access(modelPath());}catch{throw new Error('Required large-v3-q5_0 model missing. Bundled builds require the bundled model; Lite/development uses ~/.cache/whisper. No download attempted.');}}
export async function transcribe(input:string,dir:string,source:string,ffmpeg:string,whisper:string,run:(exe:string,args:string[])=>Promise<void>){
 await run(ffmpeg,['-nostdin','-v','error','-protocol_whitelist','file,pipe','-i',input,'-t','60','-vn','-ac','1','-ar','16000','-f','segment','-segment_time','10',path.join(dir,'part-%02d.wav')]);
 const files=(await readdir(dir)).filter(f=>/^part-\d\d\.wav$/.test(f)).sort();if(files.length===0||files.length>6)throw new Error('Invalid bounded audio chunks');
 const segments:{start:number;end:number;text:string}[]=[];
 for(const [i,file] of files.entries()){
  const prefix=path.join(dir,`transcript-${i}`);
  await run(whisper,['-m',modelPath(),'-f',path.join(dir,file),'-l','auto','-t','1','-ng','-ac','500','-bs','1','-bo','1','-oj','-of',prefix]);
  const data=JSON.parse(await readFile(prefix+'.json','utf8'));
  if(!Array.isArray(data.transcription))throw new Error('Invalid whisper.cpp result');
  for(const s of data.transcription){if(typeof s.text!=='string'||!Number.isFinite(s.offsets?.from)||!Number.isFinite(s.offsets?.to))throw new Error('Invalid transcript segment');segments.push({start:i*10+s.offsets.from/1000,end:Math.min(60,i*10+s.offsets.to/1000),text:s.text});}
 }
 await writeFile(path.join(dir,source+'.json'),JSON.stringify({model:DEFAULT_MODEL,backend:'whisper.cpp',text:segments.map(s=>s.text).join(''),segments},null,2),{flag:'wx',mode:0o600});
}
