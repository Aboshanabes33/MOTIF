import { describe,expect,it } from 'vitest'
import { isPublicAddress,fetchPublicPage } from '../src/public-page.ts'
describe('public page network boundary',()=>{
  it.each(['127.0.0.1','10.0.0.1','169.254.169.254','172.16.0.1','192.168.1.1','0.0.0.0','100.64.0.1','224.0.0.1','::1','fc00::1','::ffff:127.0.0.1','2001:db8::1'])('rejects nonpublic destinations',(address:string)=>expect(isPublicAddress(address)).toBe(false))
  it.each(['8.8.8.8','1.1.1.1','2606:4700:4700::1111'])('accepts ordinary public addresses',(address:string)=>expect(isPublicAddress(address)).toBe(true))
  it('refuses private literal URLs without opening a request',async()=>{
    await expect(fetchPublicPage(new URL('http://127.0.0.1/secrets'),new AbortController().signal)).rejects.toThrow(/Private/)
  })
})
