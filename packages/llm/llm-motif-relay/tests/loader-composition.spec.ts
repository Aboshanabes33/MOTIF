import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

const PROCESS_TIMEOUT_MS = 90_000
const TEST_TIMEOUT_MS = PROCESS_TIMEOUT_MS + 15_000

const fixtureDir = fileURLToPath(new URL('./fixtures/loader/', import.meta.url))
const driver = join(fixtureDir, 'driver.ts')
const configPath = join(fixtureDir, 'relay.patch.yml')
const repoTsconfig = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))

interface DriverReport {
  readonly turns: readonly { readonly output: string }[]
  readonly prompts: readonly string[]
  readonly statuses: readonly string[]
}

async function drive(tasks: readonly string[], env: Record<string, string> = {}): Promise<DriverReport> {
  const { stdout, stderr } = await runLoaderSmoke({
    label: 'llm-motif-relay Loader composition',
    tempDirPrefix: 'dsh-llm-motif-relay-loader-',
    binScript: driver,
    libBinScript: driver,
    configPath,
    binArgs: [configPath, JSON.stringify(tasks)],
    tsconfigPath: repoTsconfig,
    processTimeoutMs: PROCESS_TIMEOUT_MS,
    env: {
      MOTIF_RELAY_STAND_IN_ANSWER: 'Trimmed the intro to four seconds.',
      ...env,
    },
  })
  expect(stderr).toBe('')
  return JSON.parse(stdout) as DriverReport
}

describe('motif relay public Loader composition', () => {
  it('returns the command-line answer as the session reply and composes follow-up tasks from disk', async () => {
    const report = await drive([
      'Cut the intro to four seconds.',
      'Now make the captions bold.',
    ])

    expect(report.turns.map(turn => turn.output)).toEqual([
      'Trimmed the intro to four seconds.',
      'Trimmed the intro to four seconds.',
    ])
    expect(report.statuses).toEqual([
      'claude-code:started',
      'claude-code:working',
      'claude-code:finished',
      'claude-code:started',
      'claude-code:working',
      'claude-code:finished',
    ])
    expect(report.prompts).toHaveLength(2)

    const first = report.prompts[0] ?? ''
    expect(first).toContain('Primary color: #1d4ed8')
    expect(first).toContain('### timeline/main.json')
    expect(first).toContain('"end":30')
    expect(first).toContain('## Edit Request\nCut the intro to four seconds.')

    const followUp = report.prompts[1] ?? ''
    expect(followUp).toContain('User: Cut the intro to four seconds.')
    expect(followUp).toContain('Assistant: Trimmed the intro to four seconds.')
    expect(followUp).toContain('## Edit Request\nNow make the captions bold.')
    // The manual timeline edit between sends is part of the next task text.
    expect(followUp).toContain('"end":4')
    expect(followUp).not.toContain('"end":30')
  }, TEST_TIMEOUT_MS)

  it('stops a cancelled send without reporting a failure or switching backend', async () => {
    const report = await drive(['Cut the intro to four seconds.'], {
      MOTIF_RELAY_STAND_IN_DELAY_MS: '30000',
      MOTIF_RELAY_CANCEL_AFTER_MS: '750',
    })

    expect(report.turns.map(turn => turn.output)).toEqual([''])
    expect(report.statuses).toEqual(['claude-code:started', 'claude-code:working'])
  }, TEST_TIMEOUT_MS)

  it('reports a provider limit as a failed relay send without switching backend', async () => {
    const report = await drive(['Cut the intro to four seconds.'], {
      MOTIF_RELAY_STAND_IN_FAILURE: 'limit',
    })

    expect(report.turns.map(turn => turn.output)).toEqual([''])
    expect(report.statuses).toEqual([
      'claude-code:started',
      'claude-code:working',
      'claude-code:failed',
    ])
    expect(report.prompts).toHaveLength(1)
  }, TEST_TIMEOUT_MS)
})
