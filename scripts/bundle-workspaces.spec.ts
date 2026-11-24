import { describe, expect, it } from 'vitest'
import { bundleFace, bundleMembers, hasBundleEntries } from './bundle-workspaces.ts'
import { buildGates } from './build.ts'
import { resolve } from 'node:path'
const root = resolve(import.meta.dirname, '..')
describe('bounded serial bundles', () => {
  it('respects intentional empty face configurations', () => { expect(hasBundleEntries([])).toBe(false); expect(hasBundleEntries({ entry: '' })).toBe(false); expect(hasBundleEntries([{ entry: '' }, { entry: ['lib/types/index.js'] }])).toBe(true); expect(hasBundleEntries({})).toBe(true) })
  it('rejects invalid faces', () => { expect(() => bundleFace(undefined)).toThrow(); expect(() => bundleFace('other')).toThrow(); expect(bundleFace('client')).toBe('client') })
  it('includes exact roots with desktop Host only on Host face', () => { const host = bundleMembers(root, 'host'); const client = bundleMembers(root, 'client'); expect(host).toContain('apps/desktop-host'); expect(client).not.toContain('apps/desktop-host'); expect(client).toContain('apps/cli'); expect(host).toContain('packages/motif/motif-core'); expect(new Set(host).size).toBe(host.length) })
  it('bounds both bundle gates in serial mode without dropping checks', () => { const gates = buildGates(root, 'complete', {}, true); for (const face of ['host', 'client']) { const gate = gates.find(gate => gate.id === `${face}-bundle`)!; expect(gate.args).toEqual([resolve(root, 'scripts/bundle-workspaces.ts'), face]) } expect(gates.some(gate => gate.id === 'client-check')).toBe(true); expect(gates.some(gate => gate.id === 'web')).toBe(true) })
  it('retains existing parallel path without serial', () => { expect(buildGates(root, 'artifacts').find(gate => gate.id === 'host-bundle')!.args).toContain('tsdown') })
})
