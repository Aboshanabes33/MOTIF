import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/index.ts'

describe('resolveConfig', () => {
  it('materializes every default from an empty configuration', () => {
    expect(resolveConfig({})).toEqual({
      providerName: 'motif-relay',
      backend: 'claude-code',
      model: 'claude-code',
      models: [{ id: 'claude-code', provider: 'claude-code', name: 'claude-code', backend: 'claude-code' }],
      displayName: 'claude-code',
      brandFile: 'brand.md',
      timelineDir: 'timeline',
      timelineExtensions: ['.md', '.json'],
      maxTimelineFiles: 20,
      maxTimelineBytes: 64_000,
      conversationMessages: 6,
      conversationChars: 4_000,
      timeoutMs: 900_000,
      signInCheck: 'auto',
    })
  })

  it('offers exactly one model when no list is configured', () => {
    const resolved = resolveConfig({ backend: 'codex', displayName: 'Codex' })

    expect(resolved.models).toEqual([
      { id: 'codex', provider: 'codex', name: 'Codex', backend: 'codex' },
    ])
  })

  it('maps each configured model to its own provider row and keeps the default', () => {
    const resolved = resolveConfig({
      backend: 'claude-code',
      displayName: 'Claude Code',
      model: 'opus',
      models: [
        { id: 'sonnet', provider: 'claude-sonnet', name: 'Claude Sonnet' },
        { id: 'opus', provider: 'claude-opus', name: 'Claude Opus', description: 'Deep edits.' },
      ],
    })

    expect(resolved.model).toBe('opus')
    expect(resolved.models).toEqual([
      { id: 'sonnet', provider: 'claude-sonnet', name: 'Claude Sonnet', backend: 'claude-code' },
      { id: 'opus', provider: 'claude-opus', name: 'Claude Opus', description: 'Deep edits.', backend: 'claude-code' },
    ])
  })

  it('rejects a default model that is not offered and duplicate model ids', () => {
    expect(() => resolveConfig({ model: 'missing', models: [{ id: 'sonnet', provider: 'claude-sonnet' }] }))
      .toThrow('model "missing" is not in models (sonnet)')
    expect(() => resolveConfig({
      models: [
        { id: 'sonnet', provider: 'claude-sonnet' },
        { id: 'sonnet', provider: 'claude-opus' },
      ],
    })).toThrow('duplicate model id "sonnet"')
  })

  it('names the model and display label after the configured backend', () => {
    const resolved = resolveConfig({ backend: 'codex' })

    expect(resolved.model).toBe('codex')
    expect(resolved.displayName).toBe('codex')
  })

  it('rejects a timeline extension without a leading dot', () => {
    expect(() => resolveConfig({ timelineExtensions: ['md'] }))
      .toThrow('motif-relay: timelineExtensions entries must start with a dot, got "md"')
  })

  it('rejects a non-positive budget instead of silently reading nothing', () => {
    expect(() => resolveConfig({ maxTimelineBytes: 0 }))
      .toThrow('motif-relay: maxTimelineBytes must be a positive safe integer, got 0')
  })
})
