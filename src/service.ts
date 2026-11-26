import express, { type ErrorRequestHandler } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import {z} from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

export async function startService(media?:{state:()=>unknown;run:(id:string,kind:'render'|'transcribe'|'captions')=>Promise<unknown>;cancel:()=>void;importVideo?:(file:string)=>Promise<unknown>}) {
  const clients = new Map<string, { name: string; expires: number }>();
  const hash = (token: string) => createHash('sha256').update(token).digest('hex');
  const app = express();
  app.disable('x-powered-by');
  let expectedHost = '';
  app.use((req, res, next) => {
    if (req.headers.host !== expectedHost || req.headers.origin !== undefined) { res.sendStatus(403); return; }
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization ?? '');
    const client = match && clients.get(hash(match[1]));
    if (!client || client.expires <= Date.now()) { res.sendStatus(401); return; }
    next();
  });
  app.use(express.json({ limit: '8kb', strict: true }));
  app.post('/mcp', async (req, res) => {
    const mcp = new McpServer({ name: 'motif-phase0', version: '0.0.0' });
    mcp.registerTool('motif_status', { description: 'Read the name of this architecture spike', inputSchema: {} }, async () => ({ content: [{ type: 'text', text: 'MOTIF Phase 0' }] }));
    if(media){
      mcp.registerTool('motif_workspace',{description:'Read owner-selected project state and managed source IDs. No arbitrary paths.',inputSchema:{}},async()=>({content:[{type:'text',text:JSON.stringify(media.state())}]}));
      if(media.importVideo)mcp.registerTool('motif_import_video',{description:'Copy an agent-accessible local video into the selected MOTIF project. Requires exact absolute local path and owner confirmation. Cloud-only attachments/URLs are not accessible; never guess attachment paths. MOTIF must be running. Does not receive chat messages.',inputSchema:{filePath:z.string().min(1).max(4096)}},async({filePath})=>({content:[{type:'text',text:JSON.stringify(await media.importVideo!(filePath))}]}));
      mcp.registerTool('motif_render',{description:'Create a bounded 60-second 720p H264 derivative from an already owner-imported source ID. Requires project folder selected in MOTIF.',inputSchema:{sourceId:z.string().uuid()}},async({sourceId})=>({content:[{type:'text',text:JSON.stringify(await media.run(sourceId,'render'))}]}));
      mcp.registerTool('motif_transcribe',{description:'Transcribe owner-imported source using a pre-cached large-v3-q5_0 Whisper.cpp model with ten-second chunks; no download. CPU-only.',inputSchema:{sourceId:z.string().uuid()}},async({sourceId})=>({content:[{type:'text',text:JSON.stringify(await media.run(sourceId,'transcribe'))}]}));
      mcp.registerTool('motif_captions',{description:'Burn latest real transcript into a bounded source with local HyperFrames. Transcript may contain errors. Native approval required.',inputSchema:{sourceId:z.string().uuid()}},async({sourceId})=>({content:[{type:'text',text:JSON.stringify(await media.run(sourceId,'captions'))}]}));
      mcp.registerTool('motif_cancel',{description:'Cancel the active project media job',inputSchema:{}},async()=>{media.cancel();return {content:[{type:'text',text:'Cancellation requested'}]};});
    }
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close(); void mcp.close(); });
    try { await mcp.connect(transport); await transport.handleRequest(req, res, req.body); }
    catch { if (!res.headersSent) res.sendStatus(500); }
  });
  app.all('/mcp', (_req, res) => res.sendStatus(405));
  const safeError: ErrorRequestHandler = (error, _req, res, _next) => {
    res.sendStatus(error?.type === 'entity.too.large' ? 413 : 400);
  };
  app.use(safeError);
  const listener = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
    server.once('error', reject);
  });
  listener.requestTimeout = 5000;
  listener.headersTimeout = 5000;
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('No loopback address');
  expectedHost = `127.0.0.1:${address.port}`;
  return {
    url: `http://${expectedHost}/mcp`,
    // Owner-only API, never exposed over HTTP or to renderer. Native approval precedes call.
    approveClient(name: string) {
      if (!/^[a-zA-Z0-9 _-]{1,64}$/.test(name) || clients.size >= 16) throw new Error('Invalid client or capacity');
      const token = randomBytes(32).toString('base64url');
      clients.set(hash(token), { name, expires: Date.now() + 15 * 60 * 1000 });
      return { token, expiresInSeconds: 900 };
    },
    revokeAll() { clients.clear(); },
    status() { return { kind: 'status' as const, name: 'MOTIF Phase 0' as const, pairedClients: [...clients.values()].filter(c => c.expires > Date.now()).length }; },
    async close() { clients.clear(); listener.closeAllConnections(); await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve())); },
  };
}
