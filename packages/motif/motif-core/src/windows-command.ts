/** Resolve npm's Windows batch launcher to its JavaScript entry, without cmd.exe. */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
export interface CommandLaunch { file: string; args: readonly string[] }
export function resolveWindowsCommand(command: string, args: readonly string[], options: {
  platform?: string
  env?: NodeJS.ProcessEnv
  exists?: (path: string) => boolean
  read?: (path: string) => string
} = {}): CommandLaunch {
  if((options.platform??process.platform)!=='win32')return { file:command,args }
  if(command.endsWith('.exe') || command.endsWith('.com'))return { file:command,args }
  const exists=options.exists??existsSync, read=options.read??(path=>readFileSync(path,'utf8'))
  const env=options.env??process.env
  const path=Object.entries(env).find(([key])=>key.toLowerCase()==='path')?.[1]??''
  const candidates=isAbsolute(command)||command.includes('\\')||command.includes('/')?[command]:path.split(';').filter(Boolean).map(dir=>join(dir,command))
  for(const candidate of candidates){
    if(/\.cmd$/i.test(candidate) && exists(candidate.replace(/\.cmd$/i,'.exe')))return { file:candidate.replace(/\.cmd$/i,'.exe'),args }
    if(!/\.[a-z0-9]+$/i.test(candidate) && exists(`${candidate}.exe`)) return { file:`${candidate}.exe`,args }
    const shim=/\.cmd$/i.test(candidate)?candidate:`${candidate}.cmd`
    if(!exists(shim))continue
    // Only recognize npm's fixed Node launcher form. Never execute shim text.
    const match=/%(?:dp0|~dp0)%?\\([^"\r\n]+\.(?:c?js|mjs))"?/i.exec(read(shim))
    if(!match)throw new Error('Unsupported Windows launcher; configure the tool JavaScript entry explicitly')
    const entry=resolve(dirname(shim),match[1] ?? '')
    if(!exists(entry))throw new Error('Windows launcher JavaScript entry is missing')
    return { file:process.execPath,args:[entry,...args] }
  }
  if(/\.(?:c?js|mjs)$/i.test(command))return { file:process.execPath,args:[command,...args] }
  throw new Error('Windows tool launcher was not found on PATH; configure its JavaScript entry')
}
