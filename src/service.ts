import express, { type ErrorRequestHandler } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

export async function startService() {
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
