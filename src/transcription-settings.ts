import {readFile,writeFile,rename,mkdir,unlink,lstat,open} from 'node:fs/promises';import {constants} from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {parseEnv} from 'node:util';
export type Provider='groq'|'local';
export function backendEnvName(platform:NodeJS.Platform=process.platform){return platform==='win32'?'.env.windows':platform==='darwin'?'.env.macos':'.env.linux';}
// Read only this one fixed backend file. Never export its contents to process.env or child tools.
export async function readBackendKey(file:string){let handle:Awaited<ReturnType<typeof open>>|undefined;try{const st=await lstat(file);if(!st.isFile()||st.isSymbolicLink()||st.size>16384)throw Error();handle=await open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));const actual=await handle.stat();if(!actual.isFile()||actual.size>16384)throw Error();const body=await handle.readFile('utf8');if(Buffer.byteLength(body)>16384)throw Error();const key=parseEnv(body).GROQ_API_KEY;if(!key||!/^[\x21-\x7e]{10,512}$/.test(key))throw Error();return key;}catch{throw Error('Groq backend key unavailable or invalid. Set GROQ_API_KEY in the platform backend env file.');}finally{await handle?.close();}}
export class TranscriptionSettings{
 private provider:Provider='groq';private loaded=false;
 constructor(private dir:string,private envFile:string){}
 private async load(){if(this.loaded)return;try{const p=JSON.parse(await readFile(path.join(this.dir,'transcription.json'),'utf8'));if(p.provider==='local')this.provider='local';}catch(e:any){if(e.code!=='ENOENT')throw Error('Transcription settings unreadable');}this.loaded=true;}
 async status(){await this.load();let hasKey=false;try{await this.key();hasKey=true;}catch{}return {provider:this.provider,hasKey};}
 async save(provider:Provider){await this.load();await mkdir(this.dir,{recursive:true,mode:0o700});if((await lstat(this.dir)).isSymbolicLink())throw Error('Linked settings storage unsupported');const temp=path.join(this.dir,'transcription.'+randomUUID());try{await writeFile(temp,JSON.stringify({provider}),{flag:'wx',mode:0o600});await rename(temp,path.join(this.dir,'transcription.json'));}finally{await unlink(temp).catch(()=>{});}this.provider=provider;return this.status();}
 async key(){return readBackendKey(this.envFile);}
}
