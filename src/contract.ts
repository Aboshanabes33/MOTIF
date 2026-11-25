import { z } from 'zod';
import { BrandInput, Brand } from './brand-contract.js';
export const AgentId = z.enum(['claude-desktop','codex','opencode']);
const Agent = z.object({id:AgentId,name:z.string(),detected:z.boolean(),evidence:z.string(),config:z.string(),configDetected:z.boolean(),supported:z.boolean()}).strict();
const Media=z.object({project:z.string().nullable(),sources:z.array(z.object({id:z.string().uuid(),name:z.string(),file:z.string().uuid()})),jobs:z.array(z.object({id:z.string().uuid(),sourceId:z.string().uuid(),kind:z.enum(['render','transcribe','captions']),state:z.enum(['running','succeeded','failed','cancelled']),startedAt:z.string(),finishedAt:z.string().optional(),output:z.string().optional(),error:z.string().optional()}))});
export const Request = z.discriminatedUnion('kind', [
 z.object({kind:z.literal('project-select')}).strict(),
 z.object({kind:z.literal('source-import')}).strict(),
 z.object({kind:z.literal('media-state')}).strict(),
 z.object({kind:z.literal('media-run'),sourceId:z.string().uuid(),job:z.enum(['render','transcribe','captions'])}).strict(),
 z.object({kind:z.literal('media-cancel')}).strict(),
  z.object({kind:z.literal('brands')}).strict(),
  z.object({kind:z.literal('brand-save'),brand:BrandInput,id:z.string().uuid().optional()}).strict(),
  z.object({kind:z.literal('brand-remove'),id:z.string().uuid()}).strict(),
  z.object({kind:z.literal('capabilities')}).strict(),
  z.object({ kind: z.literal('status') }).strict(),
  z.object({ kind:z.literal('agents') }).strict(),
  z.object({ kind:z.literal('install'), agent:AgentId }).strict(),
  z.object({ kind:z.literal('window'), action:z.enum(['minimize','maximize','close']) }).strict(),
  z.object({ kind: z.literal('pair') }).strict(),
]);
export type Request = z.infer<typeof Request>;
export const Reply = z.discriminatedUnion('kind', [
 z.object({kind:z.literal('media'),state:Media}).strict(),
  z.object({kind:z.literal('brands'),brands:z.array(Brand)}).strict(),
  z.object({kind:z.literal('capabilities'),capabilities:z.array(z.object({id:z.string(),name:z.string(),available:z.boolean(),detail:z.string()}).strict())}).strict(),
  z.object({kind:z.literal('agents'),agents:z.array(Agent)}).strict(),
  z.object({kind:z.literal('installed'),file:z.string(),backup:z.string().optional()}).strict(),
  z.object({kind:z.literal('window')}).strict(),
  z.object({ kind: z.literal('status'), name: z.literal('MOTIF Phase 0'), pairedClients: z.number().int().nonnegative() }).strict(),
  z.object({ kind: z.literal('pair'), saved: z.boolean() }).strict(),
]);
export type Reply = z.infer<typeof Reply>;
export interface MotifBridge { request(request: Request): Promise<Reply> }
