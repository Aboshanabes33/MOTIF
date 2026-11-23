// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type {
  MotifApiKeySaveResult,
  MotifApiKeyStatus,
  MotifApiProvider,
} from '@deepseek-ai/dsh-motif-core/types'
import type { MotifCopy } from '../src/client/locales.ts'
import type { MotifInjected } from '../src/client/MotifSection.tsx'
import { ApiKeyCard } from '../src/client/MotifSection.tsx'

afterEach(cleanup)

/** Key-identity translator: specs assert on copy keys, not phrasing. */
const t: NonNullable<MotifInjected['t']> = (key: MotifCopy, vars) => {
  if (vars === undefined) return key
  return `${key} ${Object.entries(vars).map(([name, value]) => `${name}=${value}`).join(' ')}`
}

const UNCONFIGURED: MotifApiKeyStatus = {
  provider: 'anthropic',
  configured: false,
  env: 'ANTHROPIC_API_KEY',
  backend: 'claude-code',
  writable: true,
}

const CONFIGURED: MotifApiKeyStatus = {
  provider: 'anthropic',
  configured: true,
  masked: '…1234',
  env: 'ANTHROPIC_API_KEY',
  backend: 'claude-code',
  writable: true,
}

function renderCard(overrides: {
  status?: Partial<Record<MotifApiProvider, MotifApiKeyStatus>>
  saveApiKey?: MotifInjected['saveApiKey']
  testApiKey?: MotifInjected['testApiKey']
  deleteApiKey?: MotifInjected['deleteApiKey']
  apiKeyStatus?: MotifInjected['apiKeyStatus']
} = {}) {
  const statuses = overrides.status ?? { anthropic: UNCONFIGURED, openai: { ...UNCONFIGURED, provider: 'openai' as const, env: 'OPENAI_API_KEY', backend: 'codex' as const } }
  const apiKeyStatus = overrides.apiKeyStatus ?? vi.fn(async (provider: MotifApiProvider) => statuses[provider] ?? UNCONFIGURED)
  const saveApiKey = overrides.saveApiKey ?? vi.fn(async () => ({ stored: true, test: { ok: true, detail: 'Anthropic accepted the key.' }, status: CONFIGURED }) satisfies MotifApiKeySaveResult)
  const testApiKey = overrides.testApiKey ?? vi.fn(async () => ({ ok: true, detail: 'Anthropic accepted the key.' }))
  const deleteApiKey = overrides.deleteApiKey ?? vi.fn(async () => ({ ok: true, message: 'removed' }))
  render(
    <ApiKeyCard
      t={t}
      saveApiKey={saveApiKey}
      testApiKey={testApiKey}
      deleteApiKey={deleteApiKey}
      apiKeyStatus={apiKeyStatus}
    />,
  )
  return { saveApiKey, testApiKey, deleteApiKey, apiKeyStatus }
}

describe('ApiKeyCard', () => {
  it('keeps Save disabled until a key is entered', async () => {
    renderCard()
    const button = await screen.findByText('ai.saveAndTest')
    expect((button as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('ai.apiKeyPlaceholder'), { target: { value: 'sk-ant-x' } })
    expect((button as HTMLButtonElement).disabled).toBe(false)
  })

  it('saves and shows the verified result, clearing the input', async () => {
    const { saveApiKey } = renderCard()
    const input = await screen.findByLabelText('ai.apiKeyPlaceholder')
    fireEvent.change(input, { target: { value: 'sk-ant-secret' } })
    fireEvent.click(screen.getByText('ai.saveAndTest'))
    expect(await screen.findByText('ai.apiKey.saved')).toBeTruthy()
    expect(saveApiKey).toHaveBeenCalledWith({ provider: 'anthropic', apiKey: 'sk-ant-secret' })
    expect((input as HTMLInputElement).value).toBe('')
    expect(await screen.findByText(/ai\.apiKey\.configured masked=…1234/)).toBeTruthy()
  })

  it('reports a stored-but-unverified key truthfully', async () => {
    const saveApiKey = vi.fn(async () => ({
      stored: true,
      test: { ok: false, detail: 'Anthropic could not be reached; check the network and try again.' },
      status: CONFIGURED,
    }) satisfies MotifApiKeySaveResult)
    renderCard({ saveApiKey })
    const input = await screen.findByLabelText('ai.apiKeyPlaceholder')
    fireEvent.change(input, { target: { value: 'sk-ant-secret' } })
    fireEvent.click(screen.getByText('ai.saveAndTest'))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('ai.apiKey.savedUnverified')
    expect(alert.textContent).toContain('could not be reached')
  })

  it('shows validation errors from the host without clearing the draft', async () => {
    const saveApiKey = vi.fn(async () => { throw new Error('Enter an API key.') })
    renderCard({ saveApiKey })
    const input = (await screen.findByLabelText('ai.apiKeyPlaceholder')) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'bad key' } })
    fireEvent.click(screen.getByText('ai.saveAndTest'))
    expect(await screen.findByText('Enter an API key.')).toBeTruthy()
    expect(input.value).toBe('bad key')
  })

  it('switches provider and loads that provider status', async () => {
    const { apiKeyStatus } = renderCard()
    fireEvent.click(await screen.findByText('ai.apiKey.provider.openai'))
    await waitFor(() => {
      expect(apiKeyStatus).toHaveBeenCalledWith('openai')
    })
  })

  it('retests the stored key and shows failure detail', async () => {
    const testApiKey = vi.fn(async () => ({ ok: false, detail: 'Anthropic rejected this key.' }))
    renderCard({ status: { anthropic: CONFIGURED }, testApiKey })
    fireEvent.click(await screen.findByText('ai.apiKey.retest'))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('ai.apiKey.testFailed')
    expect(alert.textContent).toContain('rejected')
    expect(testApiKey).toHaveBeenCalledWith({ provider: 'anthropic' })
  })

  it('removes the stored key and confirms', async () => {
    const deleteApiKey = vi.fn(async () => ({ ok: true, message: 'removed' }))
    renderCard({ status: { anthropic: CONFIGURED }, deleteApiKey })
    fireEvent.click(await screen.findByText('ai.apiKey.remove'))
    expect(await screen.findByText('ai.apiKey.removed')).toBeTruthy()
    expect(deleteApiKey).toHaveBeenCalledWith('anthropic')
  })

  it('renders an honest unavailable note when the host lacks the Remotes', () => {
    render(
      <ApiKeyCard t={t} saveApiKey={undefined} testApiKey={undefined} deleteApiKey={undefined} apiKeyStatus={undefined} />,
    )
    expect(screen.getByText('ai.apiKey.unavailable')).toBeTruthy()
  })
})
