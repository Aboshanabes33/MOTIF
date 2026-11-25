import {mkdir,lstat,readFile,writeFile,rename,unlink,open} from 'node:fs/promises';
import path from 'node:path';import {randomUUID} from 'node:crypto';import {z} from 'zod';
import {BrandInput,Brand,Document,type Brand as BrandType} from './brand-contract.js';
export class BrandStore {
 constructor(private dir:string){}
 private get file(){return path.join(this.dir,'brands-v1.json');}
 async list():Promise<BrandType[]> {try{const st=await lstat(this.file);if(!st.isFile()||st.size>4*1024*1024)throw new Error('Invalid brand store');return Document.parse(JSON.parse(await readFile(this.file,'utf8'))).brands;}catch(e:any){if(e.code==='ENOENT')return [];throw new Error('Brand storage is unreadable or unsupported. No data was overwritten.');}}
 async save(input:unknown,id?:string){
  const parsed=BrandInput.parse(input);return this.update(async brands=>{const now=new Date().toISOString();if(id){const index=brands.findIndex(b=>b.id===id);if(index<0)throw new Error('Brand no longer exists');brands[index]={...brands[index],...parsed,updatedAt:now};}else{if(brands.length>=1000)throw new Error('Brand limit reached');brands.push({...parsed,id:randomUUID(),createdAt:now,updatedAt:now});}return brands;});
 }
 async remove(id:string){z.string().uuid().parse(id);return this.update(async brands=>{if(!brands.some(b=>b.id===id))throw new Error('Brand no longer exists');return brands.filter(b=>b.id!==id);});}
 private async update(change:(brands:Brand[])=>Promise<BrandType[]>){
  await mkdir(this.dir,{recursive:true,mode:0o700});if((await lstat(this.dir)).isSymbolicLink())throw new Error('Linked storage not supported');
  const lock=await open(this.file+'.lock','wx',0o600);let temp='';
  try {const brands=await change(await this.list());const body=JSON.stringify(Document.parse({version:1,brands}),null,2);temp=this.file+'.'+randomUUID();await writeFile(temp,body,{flag:'wx',mode:0o600});
   // Keep the last valid metadata version for manual recovery. No automatic migration.
   try{const old=await readFile(this.file,'utf8');await writeFile(this.file+'.backup-'+randomUUID(),old,{mode:0o600,flag:'wx'});}catch(e:any){if(e.code!=='ENOENT')throw e;}
   await rename(temp,this.file);temp='';return await this.list();
  } finally{if(temp)await unlink(temp).catch(()=>{});await lock.close();await unlink(this.file+'.lock');}
 }
}
