/**
 * Motif bundle composition: the default shell ships the Motif host service,
 * the relay model routes, and the settings surfaces, with internally
 * consistent provider references. A dropped plugin row here is what makes the
 * AI page or the model selector silently empty in the product.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { load } from 'js-yaml'

interface PluginRow {
  id: string
  name: string
  config?: Record<string, unknown>
}

interface Patch {
  plugins?: PluginRow[]
  // cordis.patch.yml nests plugin rows under a composition key in some layouts.
  [key: string]: unknown
}

function pluginRows(value: unknown): PluginRow[] {
  if (Array.isArray(value)) {
    return value.flatMap(item => pluginRows(item))
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    if (typeof record.id === 'string' && typeof record.name === 'string') {
      return [record as unknown as PluginRow]
    }
    return Object.values(record).flatMap(item => pluginRows(item))
  }
  return []
}

// cordis.patch.yml carries a few !!js scalars (inline predicates); they are
// opaque to this composition check, so strip the tag and keep the scalar.
const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'cordis.patch.yml'), 'utf8')
  .replace(/!!js\s+/g, '')
const patch = load(source) as Patch
const rows = pluginRows(patch)
const byId = new Map(rows.map(row => [row.id, row]))

describe('web-app bundle Motif composition', () => {
  it('includes the Motif host service and the settings surfaces', () => {
    expect(byId.get('motif-core')?.name).toBe('@deepseek-ai/dsh-motif-core')
    expect(byId.get('ui-motif')?.name).toBe('@deepseek-ai/dsh-client-ui-motif')
  })

  it('offers Claude and Codex relay routes whose models point at real providers', () => {
    const relays = rows.filter(row => row.name === '@deepseek-ai/dsh-llm-motif-relay')
    expect(relays.map(row => row.id).sort()).toEqual(['motif-relay-claude', 'motif-relay-codex'])
    for (const relay of relays) {
      const config = relay.config as { backend: string; model: string; models: { id: string; provider: string; backend: string }[] }
      expect(['claude-code', 'codex']).toContain(config.backend)
      // Every offered model resolves to a provider row declared in this patch.
      for (const model of config.models) {
        expect(model.backend).toBe(config.backend)
        expect(byId.has(model.provider)).toBe(true)
      }
      // The default model is one of the offered models.
      expect(config.models.map(model => model.id)).toContain(config.model)
    }
  })

  it('declares one native provider per relay model selection', () => {
    const providers = rows.filter(row => row.name.startsWith('@deepseek-ai/dsh-subagent-'))
    const names = providers.map(row => row.name)
    expect(names).toContain('@deepseek-ai/dsh-subagent-claude-code')
    expect(names).toContain('@deepseek-ai/dsh-subagent-codex')
    for (const provider of providers) {
      expect(provider.config?.providerName).toBe(provider.id)
    }
  })
})
