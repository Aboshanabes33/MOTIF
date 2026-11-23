import { describe, expect, it } from 'vitest'
import { reduceActivity } from '../src/activity.ts'

const AT = '2026-11-23T08:00:00.000Z'

describe('reduceActivity', () => {
  it('marks a started send as running', () => {
    const rows = reduceActivity([], { backend: 'claude-code', model: 'relay-claude', status: 'started' }, AT)
    expect(rows).toEqual([{ backend: 'claude-code', model: 'relay-claude', state: 'running', at: AT }])
  })

  it('records the terminal outcome per backend', () => {
    let rows = reduceActivity([], { backend: 'codex', model: 'relay-codex', status: 'started' }, AT)
    rows = reduceActivity(rows, { backend: 'codex', model: 'relay-codex', status: 'finished' }, '2026-11-23T08:01:00.000Z')
    expect(rows).toEqual([{ backend: 'codex', model: 'relay-codex', state: 'finished', at: '2026-11-23T08:01:00.000Z' }])
    rows = reduceActivity(rows, { backend: 'codex', model: 'relay-codex', status: 'failed' }, '2026-11-23T08:02:00.000Z')
    expect(rows[0]?.state).toBe('failed')
  })

  it('tracks Claude and Codex independently, most recent first', () => {
    let rows = reduceActivity([], { backend: 'claude-code', model: 'relay-claude', status: 'finished' }, AT)
    rows = reduceActivity(rows, { backend: 'codex', model: 'relay-codex', status: 'started' }, '2026-11-23T08:01:00.000Z')
    expect(rows.map(row => row.backend)).toEqual(['codex', 'claude-code'])
    expect(rows[1]?.state).toBe('finished')
    expect(rows[0]?.state).toBe('running')
  })

  it('reflects a changed selection: the newest send leads', () => {
    let rows = reduceActivity([], { backend: 'claude-code', model: 'relay-claude', status: 'finished' }, AT)
    rows = reduceActivity(rows, { backend: 'codex', model: 'relay-codex', status: 'finished' }, '2026-11-23T08:01:00.000Z')
    rows = reduceActivity(rows, { backend: 'claude-code', model: 'relay-claude', status: 'started' }, '2026-11-23T08:02:00.000Z')
    expect(rows[0]).toMatchObject({ backend: 'claude-code', state: 'running' })
    expect(rows).toHaveLength(2)
  })
})
