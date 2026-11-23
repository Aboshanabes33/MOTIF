/** Public-network-only, bounded HTTP fetch. DNS is checked on the actual socket lookup. */
import { lookup } from 'node:dns'
import { isIP } from 'node:net'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
/** Conservative public address allow rule, including IPv4-mapped IPv6. */
export function isPublicAddress(address: string): boolean {
  const value=address.toLowerCase()
  if(value.includes(':')) {
    // Only ordinary global-unicast IPv6. Reject mapped, transition and local ranges.
    return /^[23][0-9a-f]{0,3}:/.test(value) && !value.startsWith('2001:db8:') && !value.startsWith('2001:0:') && !value.startsWith('2002:')
  }
  if(isIP(value)!==4)return false
  const [a,b]=value.split('.').map(Number) as [number,number]
  return a!==0&&a!==10&&a!==127&&a!==169&&a!==172&&a!==192&&a!==198&&a<224&&!(a===100&&b>=64&&b<=127)
}
export async function fetchPublicPage(input: URL, signal: AbortSignal): Promise<Response> {
  let url=input
  for(let redirects=0;redirects<=4;redirects++) {
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Only public HTTP(S) URLs without credentials are supported')
    const literal=url.hostname.replace(/^\[|\]$/g,'')
    if(isIP(literal)&&!isPublicAddress(literal))throw new Error('Private network addresses are not supported')
    const answer=await new Promise<{ status:number;headers:Record<string,string>;body:Buffer }>((resolve,reject)=>{
      const req=(url.protocol==='https:'?httpsRequest:httpRequest)(url,{
        signal,headers:{ accept:'text/html,application/xhtml+xml','accept-encoding':'identity' },
        lookup:(hostname,options,callback)=>{
          lookup(hostname,{ all:true },(error,addresses)=>{
            if(error){callback(error,'',4);return}
            if(!addresses.length||addresses.some(row=>!isPublicAddress(row.address))){callback(new Error('Private network addresses are not supported'),'',4);return}
            const first=addresses.at(0)
            if(first===undefined){callback(new Error('Private network addresses are not supported'),'',4);return}
            if((options as { all?:boolean }).all) (callback as unknown as (err:null,rows:typeof addresses)=>void)(null,addresses)
            else callback(null,first.address,first.family)
          })
        },
      },(res)=>{
        const status=res.statusCode??0,headers:Record<string,string>={}
        for(const [key,value] of Object.entries(res.headers))if(value!==undefined)headers[key]=Array.isArray(value)?value.join(','):value
        if(status>=300&&status<400){res.resume();resolve({ status,headers,body:Buffer.alloc(0) });return}
        if(Number(headers['content-length'])>512000){res.destroy();reject(new Error('Page is too large'));return}
        const chunks:Buffer[]=[];let size=0
        res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>512000){res.destroy(new Error('Page is too large'));return}chunks.push(chunk)})
        res.on('end',()=>resolve({ status,headers,body:Buffer.concat(chunks) }));res.on('error',reject)
      })
      req.on('error',reject);req.end()
    })
    if(answer.status>=300&&answer.status<400){
      if(!answer.headers.location)throw new Error('Redirect has no destination')
      url=new URL(answer.headers.location,url);continue
    }
    return new Response(new Uint8Array(answer.body),{ status:answer.status,headers:answer.headers })
  }
  throw new Error('Too many redirects')
}
