// @vitest-environment jsdom
/**
 * Composition coverage: apply() wires the Motif surfaces into the shell's
 * slots, registers the locale dictionaries, and the injected face maps each
 * injected action onto the Remote namespace. These tests run the real apply()
 * against a recording fake context, so a dead button or a dropped slot shows
 * up here instead of in the browser.
 */
import { describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'

interface SlotRegistration {
  name: string
  id: string
}

function fakeContext() {
  const injected: string[] = []
  const localeRegister = vi.fn()
  const remote = {
    snapshot: vi.fn(async () => ({ ok: true, value: { brands: [], connections: [] } })),
    installBackend: vi.fn(async (request: unknown) => ({ ok: true, value: request })),
    signIn: vi.fn(async (request: unknown) => ({ ok: true, value: request })),
    test: vi.fn(async (request: unknown) => ({ ok: true, value: request })),
    createBrand: vi.fn(async (request: unknown) => ({ ok: true, value: { workspaceId: 'ws-1', request } })),
  }
  const openWorkspace = vi.fn(async () => {})
  const ctx = {
    effect: (fn: () => void) => fn(),
    logger: { error: vi.fn() },
    locale: {
      register: localeRegister,
      bind: () => (key: string) => key,
    },
    slots: {
      inject: (slot: string, register: () => unknown) => { injected.push(slot); register() },
      register: (registration: SlotRegistration) => registration,
    },
    remote: { motif: remote },
    configForms: { developerTools: undefined },
    uiWorkspace: { openWorkspace },
  }
  return { ctx, injected, localeRegister, remote, openWorkspace }
}

describe('ui-motif apply()', () => {
  it('declares both namespace dependencies before mapping model actions', () => {
    expect(inject).toContain('remote.motif')
    expect(inject).toContain('remote.session')
  })
  it('registers the three locale dictionaries under the Motif namespace', () => {
    const { ctx, localeRegister } = fakeContext()
    apply(ctx as never)
    expect(localeRegister).toHaveBeenCalledTimes(1)
    const [namespace, dictionaries] = localeRegister.mock.calls[0] as [string, Record<string, object>]
    expect(namespace).toBe('settings.motif')
    expect(Object.keys(dictionaries).sort()).toEqual(['ar', 'en', 'zh'])
  })

  it('injects the default shell hero frame, both settings sections, and onboarding', () => {
    const { ctx, injected } = fakeContext()
    apply(ctx as never)
    // The blank-session home is the Brands page: the hero frame is registered.
    expect(injected.filter(slot => slot === 'conversation.hero.frame')).toHaveLength(1)
    expect(injected.filter(slot => slot === 'settings.section')).toHaveLength(3)
    expect(injected.filter(slot => slot === 'settings.onboarding')).toHaveLength(1)
  })

  it('the injected face maps every action onto the Remote namespace', async () => {
    const { ctx, remote, openWorkspace } = fakeContext()
    let face: (() => Record<string, unknown>) | undefined
    const slots = ctx.slots as { inject: (slot: string, register: () => { id: string; inject?: () => Record<string, unknown> }) => void }
    slots.inject = (slot, register) => {
      if (slot === 'settings.section') {
        const registration = register()
        if (registration.id === 'motif-brands') face = registration.inject
      }
    }
    apply(ctx as never)
    expect(face).toBeDefined()
    const injectedFace = face!() as {
      load: () => Promise<unknown>
      install: (backend: string) => Promise<unknown>
      signIn: (backend: string) => Promise<unknown>
      test: (backend: string) => Promise<unknown>
      createBrand: (request: unknown) => Promise<unknown>
      openBrand: (id: string) => void
    }
    await injectedFace.load()
    expect(remote.snapshot).toHaveBeenCalledTimes(1)
    await injectedFace.install('claude-code')
    expect(remote.installBackend).toHaveBeenCalledWith({ backend: 'claude-code' })
    await injectedFace.signIn('codex')
    expect(remote.signIn).toHaveBeenCalledWith({ backend: 'codex' })
    await injectedFace.test('claude-code')
    expect(remote.test).toHaveBeenCalledWith({ backend: 'claude-code' })
    await injectedFace.createBrand({ name: 'Acme' })
    expect(remote.createBrand).toHaveBeenCalledWith({ name: 'Acme' })
    injectedFace.openBrand('ws-7')
    expect(openWorkspace).toHaveBeenCalledWith('ws-7')
  })

  it('turns a failed Remote result into a rejection instead of a silent noop', async () => {
    const { ctx, remote } = fakeContext()
    remote.snapshot.mockResolvedValueOnce({ ok: false, error: { message: 'host unreachable' } } as never)
    let face: (() => { load: () => Promise<unknown> }) | undefined
    type SlotsInject = { inject: (slot: string, register: () => { id: string; inject?: () => { load: () => Promise<unknown> } }) => void }
    const slots = ctx.slots as SlotsInject
    slots.inject = (slot, register) => {
      if (slot === 'settings.section') {
        const registration = register()
        if (registration.id === 'motif-brands') face = registration.inject
      }
    }
    apply(ctx as never)
    await expect(face!().load()).rejects.toThrow('host unreachable')
  })
})
