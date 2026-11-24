import { it, expect } from 'vitest'
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MediaProposals } from '../src/media-proposal.ts'
it('binds Session proposals to imported source and Brand without executing model text', async () => {
  const root = await mkdtemp(join(tmpdir(), 'motif-proposal-'))
  try {
    const store = new MediaProposals(), source = 'assets/media-source.mp4'
    const proposal = await store.create(root, source, 'Keep the first second')
    expect(proposal.prompt).toContain(source)
    expect(await store.read(root, proposal.id)).toBeUndefined()
    const path = join(root, '.media-proposals', proposal.id + '.json')
    const plan = { version: 1, source, clips: [{ start: 0, end: 1 }] }
    await writeFile(path, JSON.stringify(plan))
    expect(await store.read(root, proposal.id)).toEqual(plan)
    await expect(store.read('/other-brand', proposal.id)).rejects.toThrow('Unknown')
    await writeFile(path, JSON.stringify({ ...plan, source: 'assets/other.mp4' }))
    await expect(store.read(root, proposal.id)).rejects.toThrow('source')
    await writeFile(path, JSON.stringify({ ...plan, shell: 'unsupported' }))
    await expect(store.read(root, proposal.id)).rejects.toThrow('Unknown')
    await rm(path); await symlink(join(root, 'target'), path)
    await expect(store.read(root, proposal.id)).rejects.toThrow()
  } finally { await rm(root, { recursive: true, force: true }) }
})
