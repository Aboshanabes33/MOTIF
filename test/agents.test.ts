import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,chmod,symlink} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {detectAgents,installMcp,addEntry} from '../src/agents.js';
import TOML from '@iarna/toml';
import {parse} from 'jsonc-parser';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
test('real executable detection and real config writes preserve settings/backups, reject duplicate',async()=>{
 const home=await mkdtemp(path.join(os.tmpdir(),'motif-agent-'));
 try {
  const bin=path.join(home,'bin');await mkdir(bin);await writeFile(path.join(bin,'codex'),'not executed');await chmod(path.join(bin,'codex'),0o700);
  const env={home,platform:process.platform,env:{PATH:bin}};
  const found=await detectAgents(env);assert.equal(found.find(a=>a.id==='codex')!.detected,true);assert.equal(found.find(a=>a.id==='opencode')!.detected,false);
  const codex=path.join(home,'.codex/config.toml');await mkdir(path.dirname(codex));const original='# preserved\nmodel = "existing"\n[mcp_servers.other]\ncommand = "other"\n';await writeFile(codex,original);
  const result=await installMcp('codex',{command:process.execPath,script:path.resolve('dist-electron/mcp-stdio.cjs')},env);
  assert.equal(await readFile(result.backup!,'utf8'),original);const saved=await readFile(codex,'utf8');assert.ok(saved.startsWith(original));assert.ok(TOML.parse(saved).mcp_servers);
  await assert.rejects(installMcp('codex',{command:'node',script:'/server'},env));assert.equal(await readFile(codex,'utf8'),saved);
  const opendir=path.join(home,'.config/opencode');await mkdir(opendir,{recursive:true});const file=path.join(opendir,'opencode.jsonc');await writeFile(file,'{\n// keep this comment\n"theme":"existing",\n"mcp":{"servers":{"other":{"type":"local","command":["other"]}}}\n}');
  await installMcp('opencode',{command:process.execPath,script:path.resolve('dist-electron/mcp-stdio.cjs')},env);
  const text=await readFile(file,'utf8');assert.ok(text.includes('// keep this comment'));const doc=parse(text);assert.equal(doc.theme,'existing');assert.deepEqual(doc.mcp.servers.other.command,['other']);assert.equal(doc.mcp.servers.motif.environment.ELECTRON_RUN_AS_NODE,'1');
 }finally{await rm(home,{recursive:true,force:true});}
});
test('malformed config and symlink refuse without corrupting existing file',async()=>{
 const home=await mkdtemp(path.join(os.tmpdir(),'motif-unsafe-'));const env={home,platform:process.platform,env:{PATH:''}};
 try{await mkdir(path.join(home,'.codex'));const file=path.join(home,'.codex/config.toml');await writeFile(file,'[broken');await assert.rejects(installMcp('codex',{command:'node',script:'/x'},env));assert.equal(await readFile(file,'utf8'),'[broken');await rm(file);await writeFile(path.join(home,'outside'),'safe');await symlink(path.join(home,'outside'),file);await assert.rejects(installMcp('codex',{command:'node',script:'/x'},env));assert.equal(await readFile(path.join(home,'outside'),'utf8'),'safe');}finally{await rm(home,{recursive:true,force:true});}
});
test('Claude JSON registration preserves unrelated clients',()=>{const doc=JSON.parse(addEntry('claude-desktop','{"mcpServers":{"other":{"command":"other"}},"theme":"dark"}',{command:'electron',args:['/bridge.cjs'],env:{ELECTRON_RUN_AS_NODE:'1'}}));assert.equal(doc.theme,'dark');assert.equal(doc.mcpServers.other.command,'other');assert.equal(doc.mcpServers.motif.env.ELECTRON_RUN_AS_NODE,'1');});
test('actual bundled stdio connector initializes and calls only status through Electron Node mode',async()=>{
 const client=new Client({name:'motif-real-stdio-probe',version:'1'});
 const transport=new StdioClientTransport({command:path.resolve('node_modules/electron/dist/electron'),args:[path.resolve('dist-electron/mcp-stdio.cjs')],env:{ELECTRON_RUN_AS_NODE:'1'},stderr:'pipe'});
 try{await client.connect(transport);const tools=await client.listTools();assert.deepEqual(tools.tools.map(t=>t.name),['motif_status']);const r=await client.callTool({name:'motif_status',arguments:{}});assert.ok(JSON.stringify(r).includes('not implemented'));}finally{await client.close();}
});
