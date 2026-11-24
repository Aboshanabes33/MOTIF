/** One accepted preference drives every developer-tool consumer. */
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { DeveloperToolsSettings } from '../developer-tools-settings.ts'
import type { ConfigForm } from './config-form-types.ts'

/** Shared preference; Host-backed features stay disabled until an accepted value arrives. */
export class DeveloperToolsPreference {
  /** Accepted enablement, observable through renderer-bound hooks. */
  readonly enabled: ObservableSnapshot<boolean>

  /**
   * @param scope - settings-owned namespace controller.
   */
  constructor(private readonly scope: ConfigForm<DeveloperToolsSettings>) {
    this.enabled = {
      getSnapshot: () => scope.getSnapshot().value?.enabled ?? false,
      subscribe: (listener) => {
        let previous = this.enabled.getSnapshot()
        return scope.subscribe(() => {
          const next = this.enabled.getSnapshot()
          if (next === previous) return
          previous = next
          listener()
        })
      },
    }
  }

  /**
   * Compose developer-only registrations after accepted Host preference changes.
   * Teardown finishes before a later enablement can mount another composition.
   * @param mount - mounts real plugin registrations and returns their asynchronous disposer.
   * @param report - reports composition failures without changing the accepted preference.
   * @returns stops observation and awaits all mounted registrations being removed.
   */
  compose(mount: () => () => Promise<void>, report: (error: unknown) => void): () => Promise<void> {
    let stopped = false
    let off: (() => Promise<void>) | undefined
    let pending = Promise.resolve()
    const sync = (): void => {
      pending = pending.then(async () => {
        const wanted = !stopped && this.enabled.getSnapshot()
        if (!wanted && off !== undefined) {
          const dispose = off
          off = undefined
          await dispose()
        }
        if (wanted && off === undefined) off = mount()
      }).catch(report)
    }
    const unsubscribe = this.enabled.subscribe(sync)
    sync()
    return async () => {
      stopped = true
      unsubscribe()
      sync()
      await pending
    }
  }

  /**
   * Persist the choice on the Host with ordered writes.
   * @param enabled - requested developer-tool mode.
   * @returns settlement after Host acceptance; rejects after a refused write recovers.
   */
  async setEnabled(enabled: boolean): Promise<void> {
    if (!await this.scope.set('enabled', enabled)) throw new Error('Developer tools preference was not saved')
  }
}
