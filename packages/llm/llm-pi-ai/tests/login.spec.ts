import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AuthorizationService from '@deepseek-ai/dsh-authorization'
import type { AuthorizationInteraction, AuthorizationNotice, AuthorizationPrompt } from '@deepseek-ai/dsh-authorization'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import { credentialKey, type CredentialKey } from '@deepseek-ai/dsh-credentials'
import { HarnessError, LlmError } from '@deepseek-ai/dsh-llm'
import type { AuthEvent, AuthInteraction, AuthPrompt, AuthType, Credential, LoginOptions } from '@earendil-works/pi-ai'

const login = vi.hoisted(() => vi.fn())

// The whole of what this module does with pi-ai is run one provider's login
// against a collection built with the harness store, so the collection is the
// boundary worth observing; a real login would open a browser.
vi.mock('../src/models.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../src/models.ts')>(),
  createModels: () => ({ setProvider: () => {}, login }),
}))

const { credentialStoreFrom, authContextFrom, recordKeyFor } = await import('../src/auth.ts')
const { catalogProvider } = await import('../src/catalog.ts')
const { registerPiAiFlows } = await import('../src/login.ts')

const CODEX = recordKeyFor('openai-codex')
const OPENAI = recordKeyFor('openai')
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const dirs: string[] = []

/** A context with the record store, the seam, and every pi-ai login flow. */
async function harness(dshHome?: string): Promise<{ ctx: Context; home: string }> {
  const dir = dshHome ?? await mkdtemp(join(tmpdir(), 'dsh-pi-login-'))
  if (dshHome === undefined) dirs.push(dir)
  vi.stubEnv('DSH_HOME', dir)
  const ctx = new Context()
  await ctx.plugin(LocalCredentialProvider, { path: join(dir, '.credentials.yaml'), watch: false })
  await ctx.plugin(AuthorizationService)
  registerPiAiFlows(ctx, { credentials: credentialStoreFrom(ctx), authContext: authContextFrom(ctx) })
  return { ctx, home: dir }
}

/** An interaction recording everything a flow says, answering every question. */
function surface(answer = 'typed'): AuthorizationInteraction & {
  notices: AuthorizationNotice[]
  prompts: AuthorizationPrompt[]
} {
  const notices: AuthorizationNotice[] = []
  const prompts: AuthorizationPrompt[] = []
  return {
    notices,
    prompts,
    notify: (notice) => { notices.push(notice) },
    prompt: (prompt) => {
      prompts.push(prompt)
      return Promise.resolve(answer)
    },
  }
}

/** Drive one attempt, letting the mocked login talk back through `converse`. */
async function attempt(
  ctx: Context,
  converse: (interaction: AuthInteraction) => Promise<void>,
  request: { key?: CredentialKey; method?: string } = {},
): Promise<ReturnType<typeof surface>> {
  const ui = surface()
  login.mockImplementation(async (providerId: string, _type: AuthType, interaction: AuthInteraction) => {
    await converse(interaction)
    const granted: Credential = { type: 'oauth', access: 'at', refresh: 'rt', expires: 1 }
    await credentialStoreFrom(ctx).modify(providerId, () => Promise.resolve(granted))
    return granted
  })
  await expect(ctx.authorization.begin({
    key: request.key ?? CODEX,
    interaction: ui,
    ...request.method === undefined ? {} : { method: request.method },
  })).resolves.toEqual({ status: 'authorized' })
  return ui
}

afterEach(async () => {
  login.mockReset()
  vi.unstubAllEnvs()
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('pi-ai login flows', () => {
  it('offers one flow per installed provider, with the methods that provider ships', async () => {
    const { ctx } = await harness()
    const offered = ctx.authorization.list()

    // The OAuth-only provider is exactly the case this exists for: nothing
    // else could ever configure it.
    expect(offered.find(entry => entry.key === CODEX)?.methods)
      .toEqual([{ id: 'oauth', label: expect.stringContaining('ChatGPT') as string }])
    // A provider offering both keeps both, the subscription login first.
    expect(offered.find(entry => entry.key === recordKeyFor('anthropic'))?.methods.map(one => one.id))
      .toEqual(['oauth', 'api-key'])
    // A key-only provider still gets a flow, because pi-ai collects the key
    // through its own prompt rather than leaving it to the settings form.
    expect(offered.find(entry => entry.key === recordKeyFor('deepseek'))?.methods.map(one => one.id))
      .toEqual(['api-key'])
    // OpenAI offers Sign in with ChatGPT (OAuth) first, followed by API key.
    expect(catalogProvider('openai')?.auth.oauth?.loginLabel).toBe('Sign in with ChatGPT')
    expect(offered.find(entry => entry.key === OPENAI)?.methods).toEqual([
      { id: 'oauth', label: 'Sign in with ChatGPT' },
      { id: 'api-key', label: expect.any(String) as string },
    ])
  })

  it('runs the pi-ai auth type the chosen method names', async () => {
    const { ctx } = await harness()

    await attempt(ctx, () => Promise.resolve())
    expect(login).toHaveBeenLastCalledWith('openai-codex', 'oauth', expect.anything(), {
      getDeviceId: expect.any(Function) as () => string,
      agentName: 'Motif',
    })

    await attempt(ctx, () => Promise.resolve(), { key: recordKeyFor('anthropic'), method: 'api-key' })
    expect(login).toHaveBeenLastCalledWith('anthropic', 'api_key', expect.anything(), {
      getDeviceId: expect.any(Function) as () => string,
      agentName: 'Motif',
    })

    await attempt(ctx, () => Promise.resolve(), { key: OPENAI, method: 'oauth' })
    expect(login).toHaveBeenLastCalledWith('openai', 'oauth', expect.anything(), {
      getDeviceId: expect.any(Function) as () => string,
      agentName: 'Motif',
    })
  })

  it('supplies a stable Motif installation UUID across calls and runs without reading DeepSeek account identity', async () => {
    const { ctx, home } = await harness()
    const deepseekDeviceId = '11111111-1111-4111-8111-111111111111'
    await ctx.credentials.modifyRecord(
      credentialKey('deepseek-account-platform', 'device'),
      () => Promise.resolve({ kind: 'grant', payload: { id: deepseekDeviceId } }),
    )
    const getDeviceIdentity = vi.fn(() => Promise.resolve({ deviceId: deepseekDeviceId, osVersion: 'test' }))
    ctx.provide('deepseekAccount', { getDeviceIdentity } as never)

    const seenInRun1: string[] = []
    login.mockImplementationOnce(async (providerId: string, _type: AuthType, _interaction: AuthInteraction, options?: LoginOptions) => {
      expect(options?.agentName).toBe('Motif')
      seenInRun1.push(options!.getDeviceId!(), options!.getDeviceId!())
      const granted: Credential = { type: 'oauth', access: 'at-1', refresh: 'rt-1', expires: 1 }
      await credentialStoreFrom(ctx).modify(providerId, () => Promise.resolve(granted))
      return granted
    })
    await expect(ctx.authorization.begin({ key: OPENAI, method: 'oauth', interaction: surface() }))
      .resolves.toEqual({ status: 'authorized' })

    expect(seenInRun1[0]).toMatch(UUID_PATTERN)
    expect(seenInRun1[1]).toBe(seenInRun1[0])
    expect(seenInRun1[0]).not.toBe(deepseekDeviceId)
    expect(getDeviceIdentity).not.toHaveBeenCalled()

    // Second run on a fresh Context sharing the same Motif home reuses the persisted UUID.
    const { ctx: ctx2 } = await harness(home)
    let seenInRun2: string | undefined
    login.mockImplementationOnce(async (providerId: string, _type: AuthType, _interaction: AuthInteraction, options?: LoginOptions) => {
      expect(options?.agentName).toBe('Motif')
      seenInRun2 = options?.getDeviceId?.()
      const granted: Credential = { type: 'oauth', access: 'at-2', refresh: 'rt-2', expires: 2 }
      await credentialStoreFrom(ctx2).modify(providerId, () => Promise.resolve(granted))
      return granted
    })
    await expect(ctx2.authorization.begin({ key: OPENAI, method: 'oauth', interaction: surface() }))
      .resolves.toEqual({ status: 'authorized' })

    expect(seenInRun2).toBe(seenInRun1[0])
    const persisted = await readFile(join(home, 'state', 'llm-pi-ai', 'installation-id'), 'utf8')
    expect(persisted.trim()).toBe(seenInRun1[0])
  })

  it('fails loudly instead of inventing a throwaway UUID when the persisted installation ID is corrupt', async () => {
    const { ctx, home } = await harness()
    const idFile = join(home, 'state', 'llm-pi-ai', 'installation-id')
    await mkdir(join(home, 'state', 'llm-pi-ai'), { recursive: true })
    await writeFile(idFile, 'not-a-uuid\n')

    await expect(ctx.authorization.begin({ key: OPENAI, method: 'oauth', interaction: surface() }))
      .rejects.toSatisfy((error: unknown) => (
        error instanceof HarnessError
        && error instanceof LlmError
        && error.code === 'AUTH'
        && error.message.includes('invalid installation ID')
      ))
    expect(login).not.toHaveBeenCalled()
    await expect(readFile(idFile, 'utf8')).resolves.toBe('not-a-uuid\n')
  })

  it('commits what the login produced, where the adapter reads it back', async () => {
    const { ctx } = await harness()

    await attempt(ctx, () => Promise.resolve())

    await expect(ctx.credentials.readRecord(CODEX)).resolves.toEqual({
      kind: 'grant',
      payload: { type: 'oauth', access: 'at', refresh: 'rt', expires: 1 },
    })
  })

  it('restates every pi-ai login event in the neutral vocabulary', async () => {
    const { ctx } = await harness()
    const events: AuthEvent[] = [
      { type: 'info', message: 'Read this first', links: [{ url: 'https://help.example' }] },
      { type: 'info', message: 'Nothing to open' },
      { type: 'auth_url', url: 'https://auth.example/start', instructions: 'Approve in the tab' },
      { type: 'auth_url', url: 'https://auth.example/plain' },
      { type: 'device_code', userCode: 'WXYZ-1234', verificationUri: 'https://device.example' },
      { type: 'progress', message: 'Exchanging the code' },
      // pi-ai's event union is open; an unrecognised member must still show
      // the human that something is happening.
      { type: 'quantum-handshake' } as unknown as AuthEvent,
    ]

    const ui = await attempt(ctx, (interaction) => {
      for (const event of events) interaction.notify(event)
      return Promise.resolve()
    })

    expect(ui.notices).toEqual([
      { message: 'Read this first', url: 'https://help.example' },
      { message: 'Nothing to open' },
      { message: 'Approve in the tab', url: 'https://auth.example/start' },
      { message: 'Open this page to continue signing in.', url: 'https://auth.example/plain' },
      {
        message: 'Enter this code on the verification page to finish signing in.',
        url: 'https://device.example',
        code: 'WXYZ-1234',
      },
      { message: 'Exchanging the code' },
      { message: 'Signing in…' },
    ])
  })

  it('restates every pi-ai prompt, carrying the per-prompt withdrawal signal', async () => {
    const { ctx } = await harness()
    const withdraw = new AbortController()
    const prompts: AuthPrompt[] = [
      { type: 'text', message: 'Your workspace', placeholder: 'acme' },
      { type: 'secret', message: 'Paste the key' },
      { type: 'secret', message: 'Paste the token', placeholder: 'sk-…' },
      { type: 'select', message: 'Which account?', options: [{ id: 'a', label: 'Work' }] },
      // The manual-code question a browser callback can win the race against.
      { type: 'manual_code', message: 'Paste the code', signal: withdraw.signal },
    ]

    const ui = await attempt(ctx, async (interaction) => {
      for (const prompt of prompts) await interaction.prompt(prompt)
    })

    expect(ui.prompts).toEqual([
      { kind: 'text', message: 'Your workspace', placeholder: 'acme' },
      { kind: 'secret', message: 'Paste the key' },
      { kind: 'secret', message: 'Paste the token', placeholder: 'sk-…' },
      { kind: 'select', message: 'Which account?', options: [{ id: 'a', label: 'Work' }] },
      { kind: 'text', message: 'Paste the code', signal: withdraw.signal },
    ])
  })

  it('hands the flow the attempt-wide cancellation signal', async () => {
    const { ctx } = await harness()
    let seen: AbortSignal | undefined
    const controller = new AbortController()
    login.mockImplementation((_id: string, _type: AuthType, interaction: AuthInteraction) => {
      seen = interaction.signal
      controller.abort()
      return new Promise(() => {})
    })

    await expect(ctx.authorization.begin({
      key: CODEX,
      interaction: surface(),
      signal: controller.signal,
    })).resolves.toEqual({ status: 'cancelled' })
    expect(seen?.aborted).toBe(true)
  })
})
