/** Bounded workspace bundler: separate child processes release each member's native memory. */
import { existsSync, globSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { workspacePackageGlobs } from './workspace-package-globs.ts'

/** Reject CLI/environment values before passing them into the root configuration. */
export function bundleFace(value: string | undefined): 'host' | 'client' {
  if (value !== 'host' && value !== 'client') throw new Error('bundle-workspaces: expected host or client')
  return value
}
/** Deterministic member list identical to the root bundle config. */
export function bundleMembers(root: string, face: 'host' | 'client'): string[] {
  return [...workspacePackageGlobs(globSync(['vendor/*/package.json', 'packages/*/*/package.json'], { cwd: root })),
    'apps/cli', ...face === 'host' ? ['apps/desktop-host'] : []].sort()
}
/** Package-local empty entries deliberately opt out of one build face. */
export function hasBundleEntries(value: unknown): boolean {
  const configs = Array.isArray(value) ? value : [value]
  return configs.some(config => config != null && typeof config === 'object'
    && (!('entry' in config) || (config.entry !== '' && (!Array.isArray(config.entry) || config.entry.length > 0))))
}
async function enabledMember(root: string, member: string, face: 'host' | 'client'): Promise<boolean> {
  const local = resolve(root, member, 'tsdown.config.ts')
  if (!existsSync(local)) {
    const manifest = JSON.parse(readFileSync(resolve(root, member, 'package.json'), 'utf8'))
    if (manifest.tsdown === undefined) return face === 'host'
    return hasBundleEntries({ entry: face === 'host' ? ['lib/types/index.js'] : '', ...manifest.tsdown })
  }
  const exported = (await import(pathToFileURL(local).href)).default
  const config = typeof exported === 'function'
    ? await exported({ env: { DSH_BUILD_FACE: face } }, { ci: process.env.CI === 'true' })
    : await exported
  return hasBundleEntries(config)
}
/** One member at a time, with inherited output and exact child failure reporting. */
export async function bundleWorkspaces(root: string, face: 'host' | 'client', selected = bundleMembers(root, face)): Promise<void> {
  for (const [index, member] of selected.entries()) {
    console.log(`bundle-workspaces: ${face} ${index + 1}/${selected.length} ${member}`)
    if (!await enabledMember(root, member, face)) {
      console.log(`bundle-workspaces: ${member} intentionally empty for ${face}`)
      continue
    }
    const child = spawn(process.execPath, [resolve(root, 'node_modules/tsdown/dist/run.mjs'), '--config-loader', 'native',
      '--env.DSH_BUILD_FACE', face], { cwd: root, stdio: 'inherit', env: { ...process.env, DSH_BUNDLE_MEMBER: member } })
    const interrupt = (): void => { child.kill('SIGTERM') }
    process.once('SIGINT', interrupt)
    process.once('SIGTERM', interrupt)
    await new Promise<void>((accept, reject) => {
      child.once('error', reject)
      child.once('exit', (code, signal) => {
        if (code === 0) accept()
        else reject(new Error(`bundle-workspaces: ${member} failed (${signal ?? String(code)}). No later members were run.`))
      })
    }).finally(() => {
      process.off('SIGINT', interrupt)
      process.off('SIGTERM', interrupt)
    })
  }
}
if (import.meta.main) {
  try { await bundleWorkspaces(resolve(import.meta.dirname, '..'), bundleFace(process.argv[2])) }
  catch (error) { console.error(error); process.exitCode = 1 }
}
