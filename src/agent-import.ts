import path from 'node:path';import {lstat,realpath} from 'node:fs/promises';
// A local tool call is not a chat-message subscription. Only local absolute video paths.
export async function validateAgentVideo(file:string){
 if(!path.isAbsolute(file)||/[\x00-\x1f]/.test(file)||/^[/\\]{2}/.test(file)||/^[a-z]+:\/\//i.test(file)||file.split(/[\\/]/).includes('..')||process.platform==='win32'&&file.slice(2).includes(':'))throw Error('Use an absolute local video path, not a URL, network share or traversal');
 if(!/\.(mp4|mov|mkv|webm)$/i.test(file))throw Error('Only MP4, MOV, MKV and WebM are supported');
 let current=path.parse(file).root;for(const part of file.slice(current.length).split(path.sep).filter(Boolean)){current=path.join(current,part);if((await lstat(current)).isSymbolicLink())throw Error('Linked paths are not supported');}
 const st=await lstat(file);if(!st.isFile()||st.size===0||st.size>2*1024**3)throw Error('Use a nonempty regular video under2GiB');
 return {file:await realpath(file),bytes:st.size};
}
export async function importAgentVideo(file:string,approve:(file:string,bytes:number)=>Promise<boolean>,copy:(file:string)=>Promise<unknown>){const checked=await validateAgentVideo(file);if(!await approve(checked.file,checked.bytes))throw Error('Import not approved');await validateAgentVideo(checked.file);return copy(checked.file);}
