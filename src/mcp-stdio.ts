import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
const server=new McpServer({name:'motif-local',version:'0.1.0'});
server.registerTool('motif_status',{description:'Read MOTIF local connector capability. No files, shell, AI or media execution.',inputSchema:{}},async()=>({content:[{type:'text',text:'MOTIF local connector ready. Workspace and media tools are not implemented.'}]}));
void server.connect(new StdioServerTransport()).catch(()=>process.exit(1));
