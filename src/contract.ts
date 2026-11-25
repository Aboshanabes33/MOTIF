import { z } from 'zod';
export const Request = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('status') }).strict(),
  z.object({ kind: z.literal('pair') }).strict(),
]);
export type Request = z.infer<typeof Request>;
export const Reply = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('status'), name: z.literal('MOTIF Phase 0'), pairedClients: z.number().int().nonnegative() }).strict(),
  z.object({ kind: z.literal('pair'), saved: z.boolean() }).strict(),
]);
export type Reply = z.infer<typeof Reply>;
export interface MotifBridge { request(request: Request): Promise<Reply> }
