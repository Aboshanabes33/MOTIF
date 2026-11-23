import { it, expect } from 'vitest'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listTimeline } from '../src/brand-store.ts'
it('lists only actual timeline files, not symlinks or hidden files', async () => {
  const root=await mkdtemp(join(tmpdir(),'motif-timeline-'))
  try {
    const dir=join(root,'acme','timeline');await mkdir(dir,{ recursive:true })
    await writeFile(join(dir,'entry.md'),'edit');await writeFile(join(dir,'.hidden'),'private')
    await symlink(join(dir,'entry.md'),join(dir,'linked.md'))
    expect((await listTimeline(root,'acme')).map(x=>x.name)).toEqual(['entry.md'])
  }finally{await rm(root,{ recursive:true,force:true })}
})
it('rejects a timeline symlink outside the Brand root',async()=>{
  const root=await mkdtemp(join(tmpdir(),'motif-timeline-')),outside=await mkdtemp(join(tmpdir(),'motif-outside-'))
  try {
    await mkdir(join(root,'acme'));await symlink(outside,join(root,'acme','timeline'))
    await expect(listTimeline(root,'acme')).rejects.toThrow(/outside/)
  }finally{await rm(root,{ recursive:true,force:true });await rm(outside,{ recursive:true,force:true })}
})
it('returns empty for a missing timeline and rejects invalid IDs',async()=>{
  const root=await mkdtemp(join(tmpdir(),'motif-timeline-'))
  try {
    expect(await listTimeline(root,'acme')).toEqual([])
    await expect(listTimeline(root,'../private')).rejects.toThrow()
  }finally{await rm(root,{ recursive:true,force:true })}
})
