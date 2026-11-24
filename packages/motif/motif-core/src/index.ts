/**
 * Motif host services: Brand folders and the native AI-account connection the
 * shell drives. One Remote namespace (`motif`) keeps the browser surface free
 * of filesystem and process access.
 *
 * @module @deepseek-ai/dsh-motif-core
 */

import { realpathSync } from 'node:fs'
import { createHostMonitoring } from './sentry.ts'
import { createHostAnalytics } from './posthog.ts'
import { resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { dshPath } from '@deepseek-ai/dsh-home-paths'
import type {} from '@deepseek-ai/dsh-workspace'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { reduceActivity } from './activity.ts'
import type { MotifActivity } from './activity.ts'
// Pulls the `motif-relay/status` event declaration onto cordis Events.
import type {} from '@deepseek-ai/dsh-llm-motif-relay/src/index.ts'
import { createBrandWithWorkspace } from './create-brand-workspace.ts'
import type {} from '@deepseek-ai/dsh-credentials'
import { parseCredentialKey } from '@deepseek-ai/dsh-credentials'
import { listBrandsDetailed, listTimeline } from './brand-store.ts'
import { analyzeWebsite } from './website-analysis.ts'
import {
  apiKeyStatus,
  deleteApiKey,
  MOTIF_API_PROVIDERS,
  saveApiKey,
  storedApiKey,
  testApiKey,
  validateApiKey,
} from './credentials.ts'
import type { MotifCredentialStore } from './credentials.ts'
import {
  DEFAULT_COMMANDS,
  inspectConnections,
  installBackend,
  signInBackend,
  testBackend,
} from './connection.ts'
import type { MotifCommands } from './connection.ts'
import type {
  MotifActionResult,
  MotifApiKeyRequest,
  MotifApiKeySaveRequest,
  MotifApiKeySaveResult,
  MotifApiKeyStatus,
  MotifApiKeyTestRequest,
  MotifApiKeyTestResult,
  MotifApiProvider,
  MotifBackendRequest,
  MotifBrandCreateRequest,
  MotifBrandCreateResult,
  MotifSnapshot,
  MotifTimelineEntry,
  MotifTimelineRequest,
  MotifWebsiteAnalysisRequest,
  MotifWebsiteSuggestion,
} from './types.ts'

export type * from './types.ts'
export { createBrand, listBrands, listBrandsDetailed, listTimeline, brandMarkdown, normalizeIdentity, slugify, MotifBrandError, MotifBrandCorruptError, removeCreatedBrand } from './brand-store.ts'
export type { MotifBrandList } from './brand-store.ts'
export { createBrandWithWorkspace } from './create-brand-workspace.ts'
export type { BrandWorkspaceRegistry } from './create-brand-workspace.ts'
export { analyzeWebsite, parseWebsiteUrl } from './website-analysis.ts'
export type { WebsiteAnalysisInternals } from './website-analysis.ts'
export { reduceActivity } from './activity.ts'
export type { MotifActivity, MotifActivityEvent } from './activity.ts'
export {
  DEFAULT_COMMANDS,
  inspectConnections,
  installBackend,
  platformExecutable,
  signInBackend,
  testBackend,
} from './connection.ts'
export type { ConnectionInternals, MotifCommands } from './connection.ts'
export {
  API_PROVIDERS,
  MOTIF_API_PROVIDERS,
  apiKeyStatus,
  credentialRecordKey,
  deleteApiKey,
  maskApiKey,
  saveApiKey,
  storedApiKey,
  testApiKey,
  validateApiKey,
} from './credentials.ts'
export type { ApiKeyInternals, MotifApiProviderFacts, MotifCredentialStore } from './credentials.ts'

/** Deployment overrides. */
export interface Config {
  /** Directory holding every Brand folder (default `$DSH_HOME/data/motif-brands`). */
  root?: string
  /** Claude Code executable name or absolute path (default `claude`). */
  claudeCommand?: string
  /** Codex executable name or absolute path (default `codex`). */
  codexCommand?: string
}

/** Schema declaration of every accepted setting. */
export const Config: z<Config> = z.object({
  root: z.string().min(1),
  claudeCommand: z.string().min(1),
  codexCommand: z.string().min(1),
})

/** Resolved deployment settings. */
type ResolvedConfig = Required<Config>

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Motif host services behind `ctx.remote.motif`. */
    motif: MotifController
  }
}

/** Host owner of the `motif` Remote namespace. */
export class MotifController extends TypertRemoteService {
  static inject = ['remoteAccess', 'typert', 'workspaceRegistry']

  private readonly config: ResolvedConfig
  private readonly commands: MotifCommands
  private activity: readonly MotifActivity[] = []
  private readonly diagnostics = createHostMonitoring(process.env)
  private readonly telemetry = createHostAnalytics(process.env)

  /**
   * @param ctx - Host context carrying Workspace registration and Remote access.
   * @param config - Brand root and executable overrides.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'motif', { namespace: 'motif' })
    this.config = {
      root: config.root ?? dshPath('data', 'motif-brands'),
      claudeCommand: config.claudeCommand ?? DEFAULT_COMMANDS.claudeCode,
      codexCommand: config.codexCommand ?? DEFAULT_COMMANDS.codex,
    }
    ctx.effect(() => () => this.diagnostics.close())
    ctx.effect(() => () => this.telemetry.close())
    this.commands = { claudeCode: this.config.claudeCommand, codex: this.config.codexCommand }
    // Observed relay sends drive the Active-AI indicators; nothing is assumed
    // from install or sign-in state alone.
    ctx.on('motif-relay/status', (event: { backend: string; model: string; status: 'started' | 'working' | 'finished' | 'failed' }) => {
      this.activity = reduceActivity(this.activity, event, new Date().toISOString())
    })
  }

  /**
   * Read both backend cards and every Brand folder.
   * @returns the shell's one snapshot.
   */
  @Remote('snapshot')
  async snapshot(): Promise<MotifSnapshot> {
    const workspaces = new Map<string, string>(this.ctx.workspaceRegistry.list().map(workspace => [
      workspace.path,
      workspace.id,
    ]))
    const { brands, problems } = await listBrandsDetailed(this.config.root, (path) => {
      const absolute = resolve(path)
      const canonical = (() => {
        try {
          return realpathSync.native(absolute)
        } catch {
          return absolute
        }
      })()
      return workspaces.get(absolute) ?? workspaces.get(canonical)
    })
    return { brands, brandProblems: problems, connections: await inspectConnections(this.commands), activity: this.activity }
  }

  /**
   * Create a Brand folder, write its definition, and register it as a Workspace.
   * @param request - name, identity, and optional logo.
   * @returns the saved Brand and its Workspace id.
   * @throws {MotifBrandError} when the form or folder is unusable.
   */
  @Remote('createBrand')
  async createBrand(request: MotifBrandCreateRequest): Promise<MotifBrandCreateResult> {
    this.ctx.logger.info('motif: creating Brand %s', request.name)
    try {
      const result = await createBrandWithWorkspace(this.config.root, request, this.ctx.workspaceRegistry)
      this.telemetry.analytics.track('brand_created', { method: 'manual' })
      return result
    } catch (error) {
      this.diagnostics.monitoring.capture(error, 'brand-create')
      throw error
    }
  }

  /**
   * Analyze one public web page into a Brand identity suggestion for the form.
   * @param request - user-entered address.
   * @returns the suggested name and identity, plus the final page URL.
   * @throws {MotifBrandError} on an unusable address, unreachable page, or non-HTML answer.
   */
  @Remote('analyzeWebsite')
  analyzeWebsite(request: MotifWebsiteAnalysisRequest): Promise<MotifWebsiteSuggestion> {
    return analyzeWebsite(request.url)
  }

  /**
   * Read one Brand's timeline files for the editor surface.
   * @param request - Brand folder slug.
   * @returns timeline entries, most recently modified first.
   * @throws {MotifBrandError} when the id is not a folder slug.
   */
  @Remote('timeline')
  timeline(request: MotifTimelineRequest): Promise<MotifTimelineEntry[]> {
    return listTimeline(this.config.root, request.brandId)
  }

  /**
   * Install the official tool when it is missing.
   * @param request - backend to install.
   * @returns the outcome and one display sentence.
   */
  @Remote('install')
  install(request: MotifBackendRequest): Promise<MotifActionResult> {
    return installBackend(request.backend, this.commands)
  }

  /**
   * Start the provider's own sign-in flow.
   * @param request - backend to sign in.
   * @returns the outcome and one display sentence.
   */
  @Remote('signIn')
  signIn(request: MotifBackendRequest): Promise<MotifActionResult> {
    return signInBackend(request.backend, this.commands)
  }

  /**
   * Send one short request through the official tool.
   * @param request - backend to test.
   * @returns the outcome and one display sentence.
   */
  @Remote('test')
  test(request: MotifBackendRequest): Promise<MotifActionResult> {
    return testBackend(request.backend, this.commands)
  }

  /**
   * Record-half view of the Host credential seam, keyed for this plugin.
   * @returns the store Motif's credential helpers write through.
   * @throws when the composition mounts no credential store.
   */
  private credentialStore(): MotifCredentialStore {
    const credentials = this.ctx.get('credentials')
    if (credentials === undefined) {
      throw new Error('Credential storage is not available in this build.')
    }
    return {
      readRecord: key => credentials.readRecord(parseCredentialKey(key)),
      modifyRecord: (key, mutate) => credentials.modifyRecord(parseCredentialKey(key), mutate),
      deleteRecord: key => credentials.deleteRecord(parseCredentialKey(key)),
    }
  }

  /**
   * Judge one requested provider against the supported set.
   * @param raw - provider the request named.
   * @returns the supported provider.
   * @throws when the provider is not supported.
   */
  private static providerOf(raw: string): MotifApiProvider {
    if ((MOTIF_API_PROVIDERS as readonly string[]).includes(raw)) return raw as MotifApiProvider
    throw new Error(`Unsupported provider ${JSON.stringify(raw)}; choose one of: ${MOTIF_API_PROVIDERS.join(', ')}.`)
  }

  /**
   * Validate, store, and verify one provider API key. The key replaces any
   * previous one; a failed verification keeps the stored key and says so.
   * @param request - provider and the pasted key.
   * @returns the stored fact, the verification result, and the new status.
   * @throws when the provider or key is invalid, or no credential store exists.
   */
  @Remote('saveApiKey')
  async saveApiKey(request: MotifApiKeySaveRequest): Promise<MotifApiKeySaveResult> {
    const provider = MotifController.providerOf(request.provider)
    const check = validateApiKey(request.apiKey)
    if (!check.ok) throw new Error(check.detail)
    const store = this.credentialStore()
    await saveApiKey(store, provider, check.value)
    this.ctx.logger.info('motif: stored an API key for %s', provider)
    const test = await testApiKey(provider, check.value)
    return { stored: true, test, status: await apiKeyStatus(store, provider) }
  }

  /**
   * Verify one supplied key without storing it, or the stored key when the
   * request carries none.
   * @param request - provider and an optional draft key.
   * @returns the provider's verdict, truthfully.
   * @throws when the draft key is invalid or no key is stored.
   */
  @Remote('testApiKey')
  async testApiKey(request: MotifApiKeyTestRequest): Promise<MotifApiKeyTestResult> {
    const provider = MotifController.providerOf(request.provider)
    if (request.apiKey !== undefined) {
      const check = validateApiKey(request.apiKey)
      if (!check.ok) throw new Error(check.detail)
      return await testApiKey(provider, check.value)
    }
    const key = await storedApiKey(this.credentialStore(), provider)
    if (key === undefined) throw new Error('No API key is stored for this provider.')
    return await testApiKey(provider, key)
  }

  /**
   * Remove one provider's stored key.
   * @param request - provider whose key is removed.
   * @returns the outcome and one display sentence.
   */
  @Remote('deleteApiKey')
  async deleteApiKey(request: MotifApiKeyRequest): Promise<MotifActionResult> {
    const provider = MotifController.providerOf(request.provider)
    await deleteApiKey(this.credentialStore(), provider)
    this.ctx.logger.info('motif: removed the API key for %s', provider)
    return { ok: true, message: 'The stored key was removed.' }
  }

  /**
   * UI-safe status of one provider's stored key; never the value.
   * @param request - provider to describe.
   * @returns configured state, masked preview, and backend wiring facts.
   */
  @Remote('apiKeyStatus')
  apiKeyStatus(request: MotifApiKeyRequest): Promise<MotifApiKeyStatus> {
    const provider = MotifController.providerOf(request.provider)
    return apiKeyStatus(this.credentialStore(), provider)
  }
}

/**
 * Mount the Motif host service.
 * @param ctx - Host context.
 * @param config - Brand root and executable overrides.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.plugin(MotifController, config)
}
