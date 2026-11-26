import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {readFile,lstat} from 'node:fs/promises';
import {z} from 'zod';
async function main(){
 const connection=process.argv[2];
 const server=new McpServer({name:'motif-local',version:'0.2.0'});
 if(!connection){server.registerTool('motif_status',{description:'Read MOTIF connector availability',inputSchema:{}},async()=>({content:[{type:'text',text:'Standalone connector only. Live workspace not connected; media tools are not implemented in this mode.'}]}));}
 else{
  const st=await lstat(connection);if(!st.isFile()||st.size>4096)throw new Error('Invalid connection descriptor');
  const descriptor=z.object({url:z.string().url(),token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict().parse(JSON.parse(await readFile(connection,'utf8')));
  const url=new URL(descriptor.url);if(url.hostname!=='127.0.0.1'||url.protocol!=='http:'||url.pathname!=='/mcp'||url.username||url.password)throw new Error('Invalid local endpoint');
  const client=new Client({name:'motif-stdio-adapter',version:'0.2.0'});
  await client.connect(new StreamableHTTPClientTransport(url,{requestInit:{headers:{Authorization:`Bearer ${descriptor.token}`}}}));
  // Fixed allowlist only. No dynamic arbitrary tool forwarding.
  for(const kind of ['motif_status','motif_workspace','motif_cancel'] as const)server.registerTool(kind,{description:kind==='motif_cancel'?'Cancel active MOTIF project job':`Read ${kind} from the owner-selected MOTIF workspace`,inputSchema:{}},async()=>await client.callTool({name:kind,arguments:{}}) as any);
  for(const kind of ['motif_render','motif_transcribe','motif_captions'] as const)server.registerTool(kind,{description:`Request ${kind} of an imported source ID. Owner native confirmation required. Transcription uses selected provider: default Groq uploads audio off-device, local Whisper optional. No arbitrary paths or shell.`,inputSchema:{sourceId:z.string().uuid()}},async(args)=>await client.callTool({name:kind,arguments:args}) as any);
  server.registerTool('motif_import_video',{description:'Import exact agent-accessible local absolute video path. Never guess cloud attachment paths. Owner confirmation required; MOTIF must be running with project selected.',inputSchema:{filePath:z.string().min(1).max(4096)}},async args=>await client.callTool({name:'motif_import_video',arguments:args}) as any);
  process.stdin.once('end',()=>{void client.close();});
 }
 await server.connect(new StdioServerTransport());
}
void main().catch(()=>{process.stderr.write('MOTIF connection failed. Open MOTIF, refresh registration if expired, and restart the client.\n');process.exit(1);});
