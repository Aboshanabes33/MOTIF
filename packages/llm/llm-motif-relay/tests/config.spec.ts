import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/index.ts'

describe('resolveConfig', () => {
  it('materializes every default from an empty configuration', () => {
    expect(resolveConfig({})).toEqual({
      providerName: 'motif-relay',
      backend: 'claude-code',
      model: 'claude-code',
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
