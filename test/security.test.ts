import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { readApprovedFile } from '../src/roots.js';
import { Request, Reply } from '../src/contract.js';
import { startService } from '../src/service.js';
import { probe } from '../scripts/probe.js';

test('real MCP client pairs, invokes sole harmless tool, and loses access on revoke', async () => {
  const result = await probe(); assert.equal(result.unpairedStatus, 401); assert.equal(result.revokedStatus, 401);
  assert.deepEqual(result.result.content, [{type:'text', text:'MOTIF Phase 0'}]);
});
test('reject browser origins, DNS rebinding, bad tokens, oversized payloads and unknown paths', async () => {
  const service = await startService();
  try {
    const {token} = service.approveClient('test');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    for (const extra of [{Origin:'http://evil.invalid'}, {Origin:'null'}]) {
      assert.equal((await fetch(service.url, {method:'POST',headers:{...headers,...extra},body:'{}'})).status,403);
    }
    assert.equal(await new Promise<number>(resolve => { const req=http.request(service.url,{method:'POST',headers:{...headers,Host:'evil.invalid'}},res=>{res.resume();resolve(res.statusCode!);});req.end('{}'); }),403);
    assert.equal((await fetch(service.url,{headers:{Authorization:`Bearer ${'x'.repeat(43)}`}})).status,401);
    assert.equal((await fetch(service.url,{method:'POST',headers,body:JSON.stringify({data:'a'.repeat(9000)})})).status,413);
    assert.equal((await fetch(service.url.replace('/mcp','/pair'),{method:'POST',headers,body:'{}'})).status,404);
    assert.equal((await fetch(service.url,{headers})).status,405);
    assert.throws(()=>service.approveClient('../shell'));
  } finally { await service.close(); }
});
test('IPC schema fails closed on commands, paths and extra fields', () => {
  assert.deepEqual(Request.parse({kind:'status'}),{kind:'status'});
  for (const value of [null,{kind:'shell',command:'pwd'},{kind:'status',path:'/etc/passwd'},{kind:'pair',token:'invented'}]) assert.equal(Request.safeParse(value).success,false);
  assert.equal(Reply.safeParse({kind:'status',name:'wrong',pairedClients:0}).success,false);
});
test('root reader allows real file and rejects traversal, absolute, directories and symlinks', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(),'motif-roots-'));
  try {
    const root = path.join(dir,'approved'); await mkdir(root); await writeFile(path.join(root,'ok.txt'),'real file');
    await writeFile(path.join(dir,'secret'),'private');
    await symlink(path.join(dir,'secret'),path.join(root,'escape'));
    await symlink(dir,path.join(root,'escape-dir'));
    assert.equal((await readApprovedFile(root,'ok.txt')).toString(),'real file');
    for (const value of ['../secret','/etc/passwd','a/../../secret','..\\secret','escape','escape-dir/secret','.','./ok.txt','ok.txt:secret','bad\0file']) await assert.rejects(readApprovedFile(root,value));
  } finally { await rm(dir,{recursive:true,force:true}); }
});
