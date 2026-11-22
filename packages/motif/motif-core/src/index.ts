/**
 * Motif host services: Brand folders and the native AI-account connection the
 * shell drives. One Remote namespace (`motif`) keeps the browser surface free
 * of filesystem and process access.
 *
 * @module @deepseek-ai/dsh-motif-core
 */

import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { dshPath } from '@deepseek-ai/dsh-home-paths'
import type {} from '@deepseek-ai/dsh-workspace'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { createBrand, listBrands } from './brand-store.ts'
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
  MotifBackendRequest,
  MotifBrandCreateRequest,
  MotifBrandCreateResult,
  MotifSnapshot,
} from './types.ts'

export type * from './types.ts'
export { createBrand, listBrands, brandMarkdown, normalizeIdentity, slugify, MotifBrandError } from './brand-store.ts'
export {
  DEFAULT_COMMANDS,
  inspectConnections,
  installBackend,
  signInBackend,
  testBackend,
} from './connection.ts'
export type { ConnectionInternals, MotifCommands } from './connection.ts'

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
    this.commands = { claudeCode: this.config.claudeCommand, codex: this.config.codexCommand }
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
    const brands = await listBrands(this.config.root, (path) => {
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
    return { brands, connections: await inspectConnections(this.commands) }
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
    const brand = await createBrand(this.config.root, request)
    const workspace = await this.ctx.workspaceRegistry.create(brand.path)
    await workspace.setTitle(brand.name)
    return { brand: { ...brand, workspaceId: workspace.id }, workspaceId: workspace.id }
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
}

/**
 * Mount the Motif host service.
 * @param ctx - Host context.
 * @param config - Brand root and executable overrides.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.plugin(MotifController, config)
}
