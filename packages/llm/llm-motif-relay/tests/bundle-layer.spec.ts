/**
 * The shipped relay Bundle layer: the package must be installable and, once a
 * profile selects it, must put a usable relay route in front of the Claude Code
 * provider. Without this layer the relay is only a package — installed, listed,
 * and still invisible in the model selector.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader'
import { composeEntries, loadOverlayPatches } from '../../../boot/app-boot/src/index.ts'
import { ON_DEMAND_BUNDLES } from '../../../util/official-bundles/src/bundles.ts'
import { MORE_BUNDLES } from '../../../util/official-bundles/src/plugin-manager.ts'
import { OFFICIAL_ON_DEMAND_CATALOG } from '../../../util/official-bundles/src/catalog.generated.ts'
import { SHIPPED_LOCALE_IDS } from '../../../../scripts/shipped-locales.ts'

const packageDir = fileURLToPath(new URL('../', import.meta.url))
const patchPath = fileURLToPath(new URL('../cordis.patch.yml', import.meta.url))

interface Manifest {
  name: string
  icon?: string
  files?: string[]
  exports?: Record<string, unknown>
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  dsh?: { bundle?: { patch?: string } }
}

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as Manifest

function layerRows(): EntryOptions[] {
  const patches = loadOverlayPatches('motif-relay-bundle', patchPath)
  return composeEntries([patches])
}

describe('motif relay bundle layer', () => {
  it('declares itself a Profile Bundle that ships its layer and display metadata', () => {
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(manifest.icon).toBe('./icon.svg')
    for (const shipped of ['icon.svg', 'locale/*.json', 'cordis.patch.yml']) {
      expect(manifest.files, `${shipped} must ship in the package`).toContain(shipped)
    }
    expect(manifest.exports?.['./cordis.patch.yml']).toBe('./cordis.patch.yml')
    expect(manifest.exports?.['./locale/*.json']).toBe('./locale/*.json')
  })

  it('mounts the Claude Code provider and the relay route over it', () => {
    const rows = layerRows()
    expect(rows.find(row => row.id === 'motif-relay-claude-code')).toMatchObject({
      name: '@deepseek-ai/dsh-subagent-claude-code',
    })
    expect(rows.find(row => row.id === 'motif-relay')).toMatchObject({
      name: '@deepseek-ai/dsh-llm-motif-relay',
      config: { backend: 'claude-code', displayName: 'Claude Code' },
    })
  })

  it('installs every package its layer mounts', () => {
    const declared = new Set([
      manifest.name,
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ])
    for (const row of layerRows()) {
      expect(typeof row.name).toBe('string')
      expect(declared, `${String(row.name)} must be installed by this Bundle`).toContain(row.name)
    }
  })

  it('offers localized title and description in every shipped locale', () => {
    for (const language of SHIPPED_LOCALE_IDS) {
      const file = new URL(`../locale/${language}.json`, import.meta.url)
      const dictionary = JSON.parse(readFileSync(file, 'utf8')) as { meta?: { title?: unknown; description?: unknown } }
      expect(typeof dictionary.meta?.title).toBe('string')
      expect((dictionary.meta?.title as string).trim()).not.toBe('')
      expect(typeof dictionary.meta?.description).toBe('string')
      expect((dictionary.meta?.description as string).trim()).not.toBe('')
    }
  })

  it('is offered by the plugin manager and carries an offline catalog entry', () => {
    expect(ON_DEMAND_BUNDLES).toContain(manifest.name)
    expect(MORE_BUNDLES).toContain(manifest.name)
    const entry = OFFICIAL_ON_DEMAND_CATALOG.find(candidate => candidate.packageName === manifest.name)
    expect(entry).toBeDefined()
    expect(entry?.meta.icon).toContain('data:image/svg+xml')
    expect(entry?.meta.title['en']).toBe('Motif relay')
    expect(entry?.meta.description['zh']).not.toBe('')
  })

  it('keeps the package directory resolvable from the profile that installs it', () => {
    expect(packageDir.endsWith('/packages/llm/llm-motif-relay/')).toBe(true)
  })
})
