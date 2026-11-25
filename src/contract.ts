import { z } from 'zod';
export const AgentId = z.enum(['claude-desktop','codex','opencode']);
const Agent = z.object({id:AgentId,name:z.string(),detected:z.boolean(),evidence:z.string(),config:z.string(),supported:z.boolean()}).strict();
export const Request = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('status') }).strict(),
  z.object({ kind:z.literal('agents') }).strict(),
  z.object({ kind:z.literal('install'), agent:AgentId }).strict(),
  z.object({ kind:z.literal('window'), action:z.enum(['minimize','maximize','close']) }).strict(),
  z.object({ kind: z.literal('pair') }).strict(),
]);
export type Request = z.infer<typeof Request>;
export const Reply = z.discriminatedUnion('kind', [
  z.object({kind:z.literal('agents'),agents:z.array(Agent)}).strict(),
  z.object({kind:z.literal('installed'),file:z.string(),backup:z.string().optional()}).strict(),
  z.object({kind:z.literal('window')}).strict(),
  z.object({ kind: z.literal('status'), name: z.literal('MOTIF Phase 0'), pairedClients: z.number().int().nonnegative() }).strict(),
  z.object({ kind: z.literal('pair'), saved: z.boolean() }).strict(),
]);
export type Reply = z.infer<typeof Reply>;
export interface MotifBridge { request(request: Request): Promise<Reply> }
