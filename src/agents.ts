import { access, lstat, mkdir, open, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { parse as parseJsonc, modify, applyEdits, type ParseError } from 'jsonc-parser';
import { readdir, stat } from 'node:fs/promises';
import TOML from '@iarna/toml';
export const agentIds = ['claude-desktop', 'codex', 'opencode'] as const;
export type AgentId = typeof agentIds[number];
export interface Agent { id: AgentId; name: string; detected: boolean; evidence: string; config: string; configDetected: boolean; supported: boolean }
interface Environment { home: string; platform: NodeJS.Platform; env: NodeJS.ProcessEnv }
const current = (): Environment => ({ home: os.homedir(), platform: process.platform, env: process.env });
async function isFile(file: string) { try { return (await lstat(file)).isFile(); } catch { return false; } }
async function executable(file: string, platform: NodeJS.Platform) { try { await access(file, platform === 'win32' ? constants.F_OK : constants.X_OK); return (await stat(file)).isFile(); } catch { return false; } }
export async function detectAgents(e = current()): Promise<Agent[]> {
  const roaming = e.env.APPDATA ?? path.join(e.home, 'AppData/Roaming');
  const local = e.env.LOCALAPPDATA ?? path.join(e.home, 'AppData/Local');
  const claude = e.platform === 'darwin' ? ['/Applications/Claude.app/Contents/MacOS/Claude', path.join(e.home,'Applications/Claude.app/Contents/MacOS/Claude')] : e.platform === 'win32' ? [path.join(local,'AnthropicClaude/Claude.exe')] : [];
  const result: Agent[] = [];
  for (const id of agentIds) {
    const candidates = id === 'claude-desktop' ? claude : (e.env.PATH ?? '').split(path.delimiter).filter(Boolean).flatMap(dir => (e.platform === 'win32' ? ['.exe','.cmd','.bat',''] : ['']).map(ext => path.join(dir,id+ext)));
    let found = '';
    for (const file of candidates) if (await executable(file,e.platform)) { found = file; break; }
    let msix = false;
    if(id==='claude-desktop' && e.platform==='win32' && !found) {
      const packages=path.join(local,'Packages');
      const names=await readdir(packages).catch(()=>[] as string[]);
      msix=names.some(n=>/^(Claude_pzs8sxrjxfjjc|AnthropicPBC\.Claude_fnn82j28hfe8t)$/.test(n));
    }
    let config = id === 'claude-desktop' ? path.join(e.platform === 'darwin' ? path.join(e.home,'Library/Application Support') : roaming,'Claude/claude_desktop_config.json') : id === 'codex' ? path.join(e.env.CODEX_HOME ?? path.join(e.home,'.codex'),'config.toml') : path.join(e.env.XDG_CONFIG_HOME ?? path.join(e.home,'.config'),'opencode/opencode.json');
    if(id==='claude-desktop' && msix){
      const candidates=['Claude_pzs8sxrjxfjjc','AnthropicPBC.Claude_fnn82j28hfe8t'].map(n=>path.join(local,'Packages',n,'LocalCache/Roaming/Claude/claude_desktop_config.json'));
      for(const candidate of candidates) if(await isFile(candidate)){config=candidate;break;}
    }
    const configExists = await isFile(config);
    result.push({ id, name: id === 'claude-desktop' ? 'Claude Desktop' : id === 'codex' ? 'Codex' : 'OpenCode', detected: !!found, evidence: found ? `Executable found: ${found}` : msix ? 'Windows packaged Claude data found. Installation/config redirection needs native verification; automatic write disabled.' : configExists ? 'Configuration exists; installation not verified' : 'Not detected in known locations. Select manually if installed elsewhere.', config, configDetected:configExists, supported: !msix && (id !== 'claude-desktop' || e.platform !== 'linux') });
  }
  return result;
}
function object(value: unknown): value is Record<string, any> { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function addEntry(id: AgentId, source: string, entry: {command: string; args: string[]; env: Record<string,string>}) {
  if (id === 'codex') {
    const doc = TOML.parse(source);
    if (doc.mcp_servers && !object(doc.mcp_servers)) throw new Error('Invalid MCP table');
    const servers = (doc.mcp_servers ?? {}) as Record<string,unknown>;
    if (Object.prototype.hasOwnProperty.call(servers,'motif')) throw new Error('MOTIF already exists. Remove or review it in the client before adding again.');
    // Append a new isolated table: preserve comments and all original keys verbatim.
    return source + '\n\n[mcp_servers.motif]\ncommand = '+JSON.stringify(entry.command)+'\nargs = '+JSON.stringify(entry.args)+'\nenv = { ELECTRON_RUN_AS_NODE = "1" }\n';
  }
  const errors: ParseError[] = [];
  const doc = source.trim() ? parseJsonc(source,errors,{allowTrailingComma:true}) : {};
  if (errors.length || !object(doc)) throw new Error('Invalid existing JSON/JSONC. No changes made.');
  const keys = id === 'claude-desktop' ? ['mcpServers','motif'] : ['mcp','servers','motif'];
  let parent = doc;
  for (const key of keys.slice(0,-1)) { if (parent[key] !== undefined && !object(parent[key])) throw new Error('Invalid MCP configuration shape'); parent = parent[key] ?? {}; }
  if (parent.motif !== undefined) throw new Error('MOTIF already exists. Review existing configuration first.');
  if(id==='opencode' && object(doc.mcp) && Object.keys(doc.mcp).some(key => !['servers','timeout'].includes(key))) throw new Error('Legacy or unknown OpenCode MCP layout. Update/review your client config first.');
  const value = id === 'claude-desktop' ? entry : {type:'local',command:[entry.command,...entry.args],environment:entry.env};
  const input = source.trim() ? source : '{}\n';
  return applyEdits(input,modify(input,keys,value,{formattingOptions:{insertSpaces:true,tabSize:2,eol:'\n'}}));
}
export async function installMcp(id: AgentId, launch: {command:string;script:string}, e = current()) {
  const agent = (await detectAgents(e)).find(a => a.id === id)!;
  if (!agent.supported) throw new Error('Claude Desktop auto-configuration is not supported for this OS/install variant. No file was changed.');
  // Prefer existing JSONC rather than silently creating a higher-precedence OpenCode file.
  let file = agent.config;
  if (id === 'opencode' && await isFile(file+'c')) { if (await isFile(file)) throw new Error('Both OpenCode config files exist. Resolve ambiguity first.'); file += 'c'; }
  const dir = path.dirname(file);
  await mkdir(dir,{recursive:true,mode:0o700});
  // Reject linked config directories/files; never overwrite through a symlink.
  let component = path.parse(dir).root;
  for (const segment of dir.slice(component.length).split(path.sep).filter(Boolean)) { component=path.join(component,segment); if ((await lstat(component)).isSymbolicLink()) throw new Error('Symlink configuration directories are not supported.'); }
  await realpath(dir);
  const lock = file+'.motif-lock';
  const handle = await open(lock,'wx',0o600);
  let temp = '';
  try {
    let source = ''; let exists = false;
    try { const st=await lstat(file); if(!st.isFile() || st.isSymbolicLink() || st.size>1024*1024) throw new Error('Unsafe configuration file'); source=await readFile(file,'utf8');exists=true; }
    catch(error:any) { if(error.code!=='ENOENT') throw error; }
    const next = addEntry(id,source,{command:launch.command,args:[launch.script],env:{ELECTRON_RUN_AS_NODE:'1'}});
    const backup = exists ? file+'.motif-backup-'+randomUUID() : undefined;
    if (backup) await writeFile(backup,source,{flag:'wx',mode:0o600});
    temp=file+'.motif-'+randomUUID();await writeFile(temp,next,{flag:'wx',mode:0o600});
    // Refuse concurrent external edits discovered before commit. Not a hostile-process lock.
    if (exists ? await readFile(file,'utf8')!==source : await isFile(file)) throw new Error('Config changed during setup. Retry after closing the client.');
    await rename(temp,file);temp='';
    if(await readFile(file,'utf8')!==next) throw new Error('Config readback failed');
    return {file,backup};
  } finally { if(temp) await unlink(temp).catch(()=>{}); await handle.close();await unlink(lock); }
}
