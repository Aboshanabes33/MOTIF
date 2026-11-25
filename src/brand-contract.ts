import {z} from 'zod';
export const BrandInput=z.object({name:z.string().trim().min(1).max(100),voice:z.string().trim().max(2000),colors:z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(8)}).strict();
export const Brand=BrandInput.extend({id:z.string().uuid(),createdAt:z.string().datetime(),updatedAt:z.string().datetime()});
export const Document=z.object({version:z.literal(1),brands:z.array(Brand).max(1000)}).strict();
export type Brand=z.infer<typeof Brand>;
