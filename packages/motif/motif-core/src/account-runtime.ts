/** Internal tenancy boundary. No network listener, process launcher or RPC is registered here. */
import { createHash } from 'node:crypto'

/** Identity returned by a trusted token verifier, not renderer-provided claims. */
export interface VerifiedAccount {
  readonly issuer: string
  readonly subject: string
  readonly expiresAt: number
}

/** Isolation facts attested by the future deployment provisioner. Folders alone do not qualify. */
export interface IsolatedAccountRuntime {
  readonly owner: string
  readonly id: string
  readonly isolation: 'container' | 'vm' | 'os-user'
  readonly privateHome: true
  readonly privateCredentials: true
  readonly privateProcesses: true
  stop(): Promise<void>
}

/** Opaque, issuer-bound namespace. Never use an email or an unverified owner argument. */
export function accountNamespace(identity: VerifiedAccount): string {
  const issuer = new URL(identity.issuer)
  if (issuer.protocol !== 'https:' || issuer.username || issuer.password || issuer.search || issuer.hash || !identity.subject || identity.subject.length > 512) throw new Error('Invalid verified account')
  return 'account_' + createHash('sha256').update(JSON.stringify([issuer.href, identity.subject])).digest('hex')
}

/** An operation-local lease fences requests after expiry, sign-out or runtime replacement. */
export interface AccountRuntimeLease {
  readonly runtimeId: string
  readonly signal: AbortSignal
  assertCurrent(): void
  release(): void
}

/**
 * Trusted control-plane scaffold. It accepts tokens only via its verifier and
 * denies all access until an isolated runtime is attached by trusted Host code.
 * This is not a JWT verifier or a production tenancy implementation.
 */
export class AccountRuntimes {
  private readonly runtimes = new Map<string, IsolatedAccountRuntime>()
  private readonly leases = new Map<string, Set<AbortController>>()
  private readonly stopping = new Map<string, Promise<void>>()
  private disposed = false

  constructor(private readonly verify: (token: string) => Promise<VerifiedAccount>, private readonly clock = Date.now) {}

  /** Trusted provisioning path only; never expose attach through a user Remote. */
  async attach(runtime: IsolatedAccountRuntime): Promise<void> {
    if (!/^account_[a-f0-9]{64}$/.test(runtime.owner) || !runtime.id || !['container', 'vm', 'os-user'].includes(runtime.isolation)
      || runtime.privateHome !== true || runtime.privateCredentials !== true || runtime.privateProcesses !== true) throw new Error('Runtime isolation is required')
    if (this.disposed || this.runtimes.has(runtime.owner) || this.stopping.has(runtime.owner)) throw new Error('Runtime must be fully revoked before attachment')
    this.runtimes.set(runtime.owner, runtime)
  }

  /** Verify anew on every operation. No caller-supplied account id or runtime id is accepted. */
  async acquire(token: string): Promise<AccountRuntimeLease> {
    if (this.disposed) throw new Error('Runtime registry is closed')
    let identity: VerifiedAccount
    try { identity = await this.verify(token) } catch { throw new Error('Authentication required') }
    if (!Number.isSafeInteger(identity.expiresAt) || identity.expiresAt <= this.clock()) throw new Error('Session expired')
    const owner = accountNamespace(identity)
    const runtime = this.runtimes.get(owner)
    if (this.disposed || runtime === undefined) throw new Error('No isolated runtime is provisioned for this account')
    const controller = new AbortController()
    const controllers = this.leases.get(owner) ?? new Set<AbortController>()
    this.leases.set(owner, controllers)
    controllers.add(controller)
    const timer = setTimeout(() => controller.abort(new Error('Session expired')), Math.min(2147483647, identity.expiresAt - this.clock()))
    timer.unref()
    const release = (): void => {
      clearTimeout(timer)
      controllers.delete(controller)
      if (controllers.size === 0) this.leases.delete(owner)
    }
    controller.signal.addEventListener('abort', release, { once: true })
    return {
      runtimeId: runtime.id, signal: controller.signal,
      assertCurrent: () => {
        if (controller.signal.aborted || identity.expiresAt <= this.clock() || this.runtimes.get(owner) !== runtime) throw new Error('Account runtime lease expired')
      },
      release: () => { controller.abort(); release() },
    }
  }

  /** Fence leases synchronously, then await complete runtime teardown before reuse. */
  async revoke(owner: string): Promise<void> {
    for (const controller of this.leases.get(owner) ?? []) controller.abort(new Error('Account runtime revoked'))
    this.leases.delete(owner)
    const runtime = this.runtimes.get(owner)
    this.runtimes.delete(owner)
    const alreadyStopping = this.stopping.get(owner)
    if (alreadyStopping !== undefined) return alreadyStopping
    if (runtime !== undefined) {
      // Keep rejected stops in the map: failed teardown quarantines the owner.
      const pending = Promise.resolve().then(() => runtime.stop())
      this.stopping.set(owner, pending)
      await pending
      this.stopping.delete(owner)
    }
  }

  /** Stop all provisioned runtimes and await already-running teardown. */
  async dispose(): Promise<void> {
    this.disposed = true
    await Promise.all([...this.runtimes.keys(), ...this.stopping.keys()].map(owner => this.revoke(owner)))
  }
}
