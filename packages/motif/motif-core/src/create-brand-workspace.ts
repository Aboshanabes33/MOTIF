/**
 * Transactional Brand setup: the folder and its Workspace registration
 * succeed together or the folder this operation created is rolled back.
 * A rollback only ever removes what this operation created - never a
 * pre-existing folder - and a registration that reached the registry is
 * unregistered again.
 *
 * @module @deepseek-ai/dsh-motif-core/create-brand-workspace
 */

import { createBrand, MotifBrandError, removeCreatedBrand } from './brand-store.ts'
import type { MotifBrandCreateRequest, MotifBrandCreateResult } from './types.ts'

/** The registry half of Workspace setup, as the Brand flow needs it. */
export interface BrandWorkspaceRegistry {
  /** Register one existing directory as a Workspace. */
  create(path: string): Promise<{ id: string; setTitle(title: string): Promise<void> }>
  /** Remove one registration while retaining files; `false` when unknown. */
  delete(id: string): Promise<boolean>
}

/** Display message from one thrown value. */
function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

/**
 * Create a Brand folder and register it as a Workspace, transactionally.
 *
 * When registration or titling fails, the registration (when one happened)
 * is removed again and the newly created folder is rolled back. The folder
 * is kept - and the error says where - when anything about it no longer
 * matches what this operation wrote.
 * @param root - directory holding every Brand folder.
 * @param request - validated form payload.
 * @param registry - Workspace registration seam.
 * @returns the saved Brand and its Workspace id.
 * @throws {MotifBrandError} with an accurate outcome when setup fails.
 */
export async function createBrandWithWorkspace(
  root: string,
  request: MotifBrandCreateRequest,
  registry: BrandWorkspaceRegistry,
): Promise<MotifBrandCreateResult> {
  const brand = await createBrand(root, request)
  let workspaceId: string | undefined
  try {
    const workspace = await registry.create(brand.path)
    workspaceId = workspace.id
    await workspace.setTitle(brand.name)
    return { brand: { ...brand, workspaceId }, workspaceId }
  } catch (reason: unknown) {
    const unregistered = workspaceId === undefined || await registry.delete(workspaceId).catch(() => false)
    // A surviving registration still owns this folder. Keep it repairable,
    // rather than leave a registered workspace pointing at a deleted path.
    const removed = unregistered && await removeCreatedBrand(brand)
    const detail = messageOf(reason)
    throw new MotifBrandError(removed
      ? `The Brand could not be set up as a workspace, so the new folder was removed: ${detail}`
      : `The Brand could not be set up as a workspace; its folder was kept at ${brand.path}: ${detail}`)
  }
}
