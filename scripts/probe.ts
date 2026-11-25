import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startService } from '../src/service.js';
export async function probe() {
  const service = await startService();
  const client = new Client({ name: 'motif-owner-probe', version: '0.0.0' });
  try {
    const unpaired = await fetch(service.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (unpaired.status !== 401) throw new Error('Unpaired client not rejected');
    // This local owner-side harness explicitly approves one client, no HTTP pairing bypass.
    const { token } = service.approveClient('owner-probe');
    await client.connect(new StreamableHTTPClientTransport(new URL(service.url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    const tools = await client.listTools();
    if (tools.tools.length !== 1 || tools.tools[0].name !== 'motif_status') throw new Error('Unexpected capability');
    const result = await client.callTool({ name: 'motif_status', arguments: {} });
    service.revokeAll();
    const revoked = await fetch(service.url, { headers: { Authorization: `Bearer ${token}` } });
    if (revoked.status !== 401) throw new Error('Revocation failed');
    return { unpairedStatus: unpaired.status, tool: tools.tools[0].name, result, revokedStatus: revoked.status };
  } finally { await client.close(); await service.close(); }
}
if (import.meta.url === new URL(process.argv[1], 'file:').href) console.log(JSON.stringify(await probe(), null, 2));
