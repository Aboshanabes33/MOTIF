import {readFile,writeFile,rename,mkdir,unlink,lstat} from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';
export type Provider='groq'|'local';
export type CryptoStore={available:()=>boolean;encrypt:(s:string)=>Buffer;decrypt:(b:Buffer)=>string};
export class TranscriptionSettings{
 private provider:Provider='groq';private loaded=false;
 constructor(private dir:string,private crypto:CryptoStore){}
 private async load(){if(this.loaded)return;try{const p=JSON.parse(await readFile(path.join(this.dir,'transcription.json'),'utf8'));if(p.provider==='local')this.provider='local';}catch(e:any){if(e.code!=='ENOENT')throw Error('Transcription settings unreadable');}this.loaded=true;}
 async status(){await this.load();let hasKey=false;try{const st=await lstat(path.join(this.dir,'groq-key.enc'));hasKey=st.isFile()&&!st.isSymbolicLink();}catch{}return {provider:this.provider,hasKey,secureStorage:this.crypto.available()};}
 private async atomic(file:string,body:Buffer|string){await mkdir(this.dir,{recursive:true,mode:0o700});if((await lstat(this.dir)).isSymbolicLink())throw Error('Linked secure storage unsupported');const temp=path.join(this.dir,file+'.'+randomUUID());try{await writeFile(temp,body,{flag:'wx',mode:0o600});await rename(temp,path.join(this.dir,file));}finally{await unlink(temp).catch(()=>{});}}
 async save(provider:Provider,key?:string){await this.load();if(key!==undefined){if(!this.crypto.available())throw Error('OS secure storage unavailable. Key not saved.');if(!/^[\x21-\x7e]{10,512}$/.test(key))throw Error('Invalid API key format');try{await this.atomic('groq-key.enc',this.crypto.encrypt(key));}catch{throw Error('Could not securely save API key');}}await this.atomic('transcription.json',JSON.stringify({provider}));this.provider=provider;return this.status();}
 async remove(){await unlink(path.join(this.dir,'groq-key.enc')).catch((e:any)=>{if(e.code!=='ENOENT')throw Error('Could not remove API key');});return this.status();}
 async key(){if(!this.crypto.available())throw Error('OS secure storage unavailable. Use local transcription or unlock secure storage.');try{const file=path.join(this.dir,'groq-key.enc');const st=await lstat(file);if(!st.isFile()||st.isSymbolicLink()||st.size>16384)throw Error();return this.crypto.decrypt(await readFile(file));}catch{throw Error('Groq API key unavailable. Save it in Transcription settings.');}}
}
