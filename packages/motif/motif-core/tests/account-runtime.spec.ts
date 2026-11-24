import { expect, it, vi } from 'vitest'
import { AccountRuntimes, accountNamespace, type VerifiedAccount } from '../src/account-runtime.ts'

const account = (subject: string): VerifiedAccount => ({ issuer: 'https://auth.example.test', subject, expiresAt: 2000 })
const runtime = (subject: string) => ({ owner: accountNamespace(account(subject)), id: 'runtime-' + subject,
  isolation: 'container' as const, privateHome: true as const, privateCredentials: true as const, privateProcesses: true as const, stop: vi.fn(async () => {}) })

it('binds opaque namespaces to issuer and subject, not email or paths', () => {
  expect(accountNamespace(account('a'))).not.toBe(accountNamespace(account('b')))
  expect(accountNamespace(account('a'))).not.toBe(accountNamespace({ ...account('a'), issuer: 'https://another.example.test' }))
  expect(() => accountNamespace({ ...account('a'), issuer: 'http://auth.example.test' })).toThrow()
})

it('routes two verified accounts only to their own isolated runtimes', async () => {
  const registry = new AccountRuntimes(async (token) => {
    if (!['a', 'b'].includes(token)) throw new Error('token content must not leak')
    return account(token)
  }, () => 1000)
  await registry.attach(runtime('a'))
  await registry.attach(runtime('b'))
  const a = await registry.acquire('a'), b = await registry.acquire('b')
  expect(a.runtimeId).toBe('runtime-a')
  expect(b.runtimeId).toBe('runtime-b')
  await registry.revoke(accountNamespace(account('a')))
  expect(a.signal.aborted).toBe(true)
  expect(() => a.assertCurrent()).toThrow()
  expect(() => b.assertCurrent()).not.toThrow()
  await expect(registry.acquire('a')).rejects.toThrow('No isolated runtime')
  await expect(registry.acquire('forged-owner-id')).rejects.toThrow('Authentication required')
  await registry.dispose()
})

it('denies expired sessions and fences in-flight leases after clock expiry', async () => {
  let now = 1000
  const registry = new AccountRuntimes(async () => account('a'), () => now)
  await registry.attach(runtime('a'))
  const lease = await registry.acquire('valid-at-first')
  now = 2001
  expect(() => lease.assertCurrent()).toThrow()
  await expect(registry.acquire('expired')).rejects.toThrow('expired')
  await registry.dispose()
})

it('rejects a folders-only runtime and waits for teardown on replacement', async () => {
  const registry = new AccountRuntimes(async () => account('a'), () => 1000)
  await expect(registry.attach({ ...runtime('a'), isolation: 'folder' as never })).rejects.toThrow('isolation')
  const first = runtime('a')
  await registry.attach(first)
  const lease = await registry.acquire('a')
  await expect(registry.attach(runtime('a'))).rejects.toThrow('fully revoked')
  await registry.revoke(first.owner)
  await registry.attach({ ...runtime('a'), id: 'replacement' })
  expect(first.stop).toHaveBeenCalledOnce()
  expect(lease.signal.aborted).toBe(true)
  expect((await registry.acquire('a')).runtimeId).toBe('replacement')
  await registry.dispose()
})

it('quarantines failed teardown and prevents reattachment during teardown', async () => {
  const registry = new AccountRuntimes(async () => account('a'), () => 1000)
  const failed = runtime('a')
  failed.stop = vi.fn(async () => { throw new Error('stop failed') })
  await registry.attach(failed)
  await expect(registry.revoke(failed.owner)).rejects.toThrow('stop failed')
  await expect(registry.attach(runtime('a'))).rejects.toThrow('fully revoked')
  await expect(registry.acquire('a')).rejects.toThrow('No isolated runtime')
})

it('fences all calls after registry disposal, including in-flight verification', async () => {
  let finish!: (value: VerifiedAccount) => void
  const registry = new AccountRuntimes(() => new Promise((resolve) => { finish = resolve }), () => 1000)
  await registry.attach(runtime('a'))
  const pending = registry.acquire('a')
  await registry.dispose()
  finish(account('a'))
  await expect(pending).rejects.toThrow('No isolated runtime')
  await expect(registry.attach(runtime('a'))).rejects.toThrow('fully revoked')
})
