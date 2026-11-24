import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { apply as applyGateway, inject } from '@deepseek-ai/dsh-api-gateway/client'
import motifRemote from '@deepseek-ai/dsh-motif-core/remote'
import { apply as applyAssembly } from '../src/client/index.ts'

describe('Motif production Remote assembly', () => {
  it('includes the generated Motif contribution in the real assembly', async () => {
    const mount = vi.fn(async () => async () => {})
    const dispose = await applyAssembly({ remote: { $mount: mount } } as never)
    expect(mount).toHaveBeenCalledWith(motifRemote)
    await dispose()
  })

  it('mounts every generated Motif method on the real gateway without Service collisions', async () => {
    const ctx = new Context()
    await ctx.plugin(TypertRegistry)
    const call = vi.fn(async () => ({ ok: true, value: { brands: [], connections: [] } }))
    ctx.provide('connection', {
      interactions: 'answer', isLoopback: true,
      generation: { getSnapshot: () => undefined, subscribe: () => () => {} },
      state: { getSnapshot: () => undefined, subscribe: () => () => {} },
      reconnect: () => {}, rpc: { call },
      registerGenerationSource: () => () => {}, start: () => ({ stop: () => {} }),
    } as never)
    const gateway = ctx.plugin({ inject, apply: applyGateway })
    await gateway
    const dispose = await ctx.remote.$mount(motifRemote)
    expect(ctx.get('remote.motif')).toBeDefined()
    await expect(ctx.remote.motif.snapshot()).resolves.toMatchObject({ ok: true })
    expect(typeof ctx.remote.motif.installBackend).toBe('function')
    await dispose()
    await gateway.dispose()
  })
})
