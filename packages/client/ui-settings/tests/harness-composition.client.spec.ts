import { describe, it, expect, vi } from 'vitest'
import { DeveloperToolsPreference } from '../src/client/developer-tools.ts'
import type { ConfigForm } from '../src/client/config-form-types.ts'
import type { DeveloperToolsSettings } from '../src/developer-tools-settings.ts'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
const plugins = [
  import('../../ui-trajectory/src/client/index.ts'), import('../../ui-agent-preset/src/client/index.ts'),
  import('../../ui-plugin-manager/src/client/index.ts'), import('../../ui-settings-shell/src/client/index.ts'),
  import('../../ui-settings-agent-loop/src/client/index.ts'), import('../../ui-settings-subagent/src/client/index.ts'),
  import('../../ui-settings-web-search/src/client/index.ts'), import('../../ui-sidebar-documentpreview/src/client/index.ts'),
  import('../../ui-entry-customization/src/client/index.ts'), import('../../ui-settings-models/src/client/index.ts'),
  import('../../ui-schedule/src/client/index.ts'),
]
describe('all Harness composition wrappers', () => {
  it.each(plugins.map((plugin, index) => ({ plugin, index })))('gates and tears down actual plugin owner $index', async ({ plugin }) => {
    const feature = await plugin
    const accepted = createSnapshotStore<{ value: DeveloperToolsSettings | undefined }>({ value: undefined })
    const preference = new DeveloperToolsPreference(accepted as unknown as ConfigForm<DeveloperToolsSettings>)
    const dispose = vi.fn(async () => {})
    const mount = vi.fn((..._args: unknown[]) => ({ dispose }))
    let stop: (() => Promise<void>) | undefined
    const ctx = { configForms: { developerTools: preference }, plugin: mount, logger: { error: vi.fn() },
      effect: (install: () => () => Promise<void>) => { stop = install() } }
    ;(feature.apply as (ctx: unknown, config: unknown) => void)(ctx, {})
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(mount).not.toHaveBeenCalled()
    accepted.set({ value: { enabled: true } })
    await vi.waitFor(() => { expect(mount).toHaveBeenCalledTimes(1) })
    expect(mount.mock.calls[0]?.[0]).toEqual({ inject: feature.inject, apply: feature.applyDeveloper })
    accepted.set({ value: { enabled: false } })
    await vi.waitFor(() => { expect(dispose).toHaveBeenCalledTimes(1) })
    accepted.set({ value: { enabled: true } })
    await vi.waitFor(() => { expect(mount).toHaveBeenCalledTimes(2) })
    await stop?.()
    expect(dispose).toHaveBeenCalledTimes(2)
    expect(ctx.logger.error).not.toHaveBeenCalled()
  })
})
