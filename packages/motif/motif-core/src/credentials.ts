/**
 * Provider API-key credentials for the no-subscription path. Keys are
 * validated, verified with one real provider request, and kept in the Host
 * credential seam — never in the renderer, localStorage, or Brand files.
 *
 * @module @deepseek-ai/dsh-motif-core/credentials
 */

import { normalizeApiKey } from '@deepseek-ai/dsh-credentials'
import type { CredentialRecord } from '@deepseek-ai/dsh-credentials/types'
import type {
  MotifApiKeyStatus,
  MotifApiKeyTestResult,
  MotifApiProvider,
  MotifBackend,
} from './types.ts'

/** Every provider a user can authenticate with an API key instead of a subscription. */
export const MOTIF_API_PROVIDERS: readonly MotifApiProvider[] = ['anthropic', 'openai']

/** Static facts about one supported provider. */
export interface MotifApiProviderFacts {
  /** CLI backend the key authenticates. */
  readonly backend: MotifBackend
  /** Environment variable the backend reads the key from. */
  readonly env: string
  /** Product label for diagnostics. */
  readonly label: string
  /** Cheap authenticated endpoint that proves a key. */
  readonly endpoint: string
  /** Headers authenticating one verification request. */
  readonly headers: (key: string) => Record<string, string>
}

/** Supported providers and how each one is verified. */
export const API_PROVIDERS: Readonly<Record<MotifApiProvider, MotifApiProviderFacts>> = {
  anthropic: {
    backend: 'claude-code',
    env: 'ANTHROPIC_API_KEY',
    label: 'Anthropic',
    endpoint: 'https://api.anthropic.com/v1/models',
    headers: key => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
  },
  openai: {
    backend: 'codex',
    env: 'OPENAI_API_KEY',
    label: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/models',
    headers: key => ({ authorization: `Bearer ${key}` }),
  },
}

/** The record half of the Host credential seam, keyed for this plugin. */
export interface MotifCredentialStore {
  /** Read one stored record, or `undefined` while none is stored. */
  readRecord(key: string): Promise<CredentialRecord | undefined>
  /** Serialized read-modify-write over one record. */
  modifyRecord(
    key: string,
    mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
  ): Promise<CredentialRecord | undefined>
  /** Remove one record; removing an absent record is a no-op. */
  deleteRecord(key: string): Promise<void>
}

/** Record key addressing one provider's key inside Motif's scope. */
export function credentialRecordKey(provider: MotifApiProvider): string {
  return `motif/${provider}`
}

/** Test seams for the network call. */
export interface ApiKeyInternals {
  /** Override the verification request. */
  readonly fetch?: typeof fetch
}

/** Judge one supplied key, trimming first; the detail is safe to show beside the card. */
export function validateApiKey(raw: string): { ok: true; value: string } | { ok: false; detail: string } {
  const check = normalizeApiKey(raw)
  if (!check.ok) {
    return {
      ok: false,
      detail: check.reason === 'empty'
        ? 'Enter an API key.'
        : 'An API key carries printable ASCII characters only; this one does not.',
    }
  }
  return { ok: true, value: check.value }
}

/** Mask one stored key: never more than its last four characters. */
export function maskApiKey(key: string): string {
  return `…${key.slice(-4)}`
}

/** Read one provider's stored key value, or `undefined` while none is stored. */
export async function storedApiKey(store: MotifCredentialStore, provider: MotifApiProvider): Promise<string | undefined> {
  const record = await store.readRecord(credentialRecordKey(provider))
  return record !== undefined && record.kind === 'api-key' ? record.key : undefined
}

/** Store one validated key, replacing any previous one for the provider. */
export async function saveApiKey(store: MotifCredentialStore, provider: MotifApiProvider, key: string): Promise<void> {
  await store.modifyRecord(credentialRecordKey(provider), async () => ({ kind: 'api-key', key }))
}

/** Remove one provider's stored key; removing an absent key is a no-op. */
export async function deleteApiKey(store: MotifCredentialStore, provider: MotifApiProvider): Promise<void> {
  await store.deleteRecord(credentialRecordKey(provider))
}

/** UI-safe status of one provider's stored key; never the value. */
export async function apiKeyStatus(store: MotifCredentialStore, provider: MotifApiProvider): Promise<MotifApiKeyStatus> {
  const facts = API_PROVIDERS[provider]
  const key = await storedApiKey(store, provider)
  return {
    provider,
    configured: key !== undefined,
    ...key === undefined ? {} : { masked: maskApiKey(key) },
    env: facts.env,
    backend: facts.backend,
    writable: true,
  }
}

/**
 * Prove one key with a single authenticated provider request.
 * @param provider - provider the key belongs to.
 * @param key - the key value itself; it leaves the Host only toward its own provider.
 * @param internals - test seams.
 * @returns acceptance, or one truthful sentence about the refusal or failure.
 */
export async function testApiKey(
  provider: MotifApiProvider,
  key: string,
  internals: ApiKeyInternals = {},
): Promise<MotifApiKeyTestResult> {
  const facts = API_PROVIDERS[provider]
  if (!facts) return { ok: false, detail: 'Unsupported API provider.' }
  const validation = validateApiKey(key)
  if (!validation.ok) return { ok: false, detail: validation.detail }
  const call = internals.fetch ?? fetch
  let response: Response
  try {
    response = await call(facts.endpoint, {
      headers: facts.headers(key),
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    return { ok: false, detail: `${facts.label} could not be reached; check the network and try again.` }
  }
  if (response.ok) return { ok: true, detail: `${facts.label} accepted the models-list check. Session/Relay generation has not been verified by this check.` }
  if (response.status === 401 || response.status === 403) return { ok: false, detail: `${facts.label} rejected this key.` }
  return { ok: false, detail: `${facts.label} answered with status ${response.status}; the key could not be verified.` }
}
