import { describe,expect,it } from 'vitest'
import { compositionHtml,validateEditPlan,validateTranscript } from '../src/media-pipeline.ts'
const plan=()=>({ version:1 as const,source:'source.mp4',clips:[{ start:0,end:4 }] })
describe('media plan boundary',()=>{
  it('accepts bounded structured cuts',()=>expect(()=>validateEditPlan(plan())).not.toThrow())
  it.each([{ source:'/etc/passwd' },{ clips:[] },{ clips:[{ start:0,end:999 }] },{ clips:[{ start:4,end:1 }] },{ clips:[{ start:NaN,end:4 }] }])('rejects invalid plans',(change:object)=>expect(()=>validateEditPlan({ ...plan(),...change })).toThrow())
  it('escapes title content instead of executing it',()=>{
    const source=compositionHtml([{ start:0,end:2,title:'<script>alert(1)</script>' }])
    expect(source).not.toContain('<script>');expect(source).toContain('&lt;script&gt;')
    expect(source).toContain('data-duration="2"')
  })
  it('validates timestamped transcripts',()=>{
    expect(validateTranscript({ segments:[{ start:0,end:1,text:'مرحبا' }] }).segments).toHaveLength(1)
    expect(()=>validateTranscript({ segments:[{ start:-1,end:1,text:'x' }] })).toThrow()
  })
})

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderEdit, type MediaStage } from '../src/media-pipeline.ts'
const tools={ ffmpeg:'ffmpeg',ffprobe:'ffprobe',whisper:'whisper',hyperframes:'hyperframes' }
it('orchestrates real tool contracts, validates output, and records completion only last',async()=>{
  const root=await mkdtemp(join(tmpdir(),'motif-media-'))
  try {
    await writeFile(join(root,'source.mp4'),'fixture')
    const stages:MediaStage[]=[]
    const result=await renderEdit(root,plan(),{ tools,signal:new AbortController().signal,onStage:s=>stages.push(s),run:async (request)=>{
      if(request.file==='ffprobe')return { stdout:JSON.stringify({ format:{ duration:4 },streams:[{ codec_type:'video',width:1280,height:720 }] }),stderr:'' }
      if(request.file==='whisper')await writeFile(join(request.cwd,'audio.json'),JSON.stringify({ segments:[{ start:0,end:4,text:'sample' }] }))
      if(request.file==='hyperframes')await writeFile(join(request.cwd,'output.mp4'),'render fixture')
      return { stdout:'',stderr:'' }
    } })
    expect(stages).toEqual(['probe','transcribe','cut','compose','render','verify','completed'])
    expect(result.transcript.segments[0]?.end).toBe(4)
    const status=JSON.parse(await readFile(join(root,'timeline',`media-${result.jobId}`,'status.json'),'utf8'))
    expect(status.stage).toBe('completed')
  }finally{await rm(root,{ recursive:true,force:true })}
})
it('does not call a missing or invalid render a success',async()=>{
  const root=await mkdtemp(join(tmpdir(),'motif-media-'))
  try {
    await writeFile(join(root,'source.mp4'),'fixture')
    const stages:MediaStage[]=[]
    await expect(renderEdit(root,plan(),{ tools,signal:new AbortController().signal,onStage:s=>stages.push(s),run:async (request)=>{
      if(request.file==='ffprobe')return { stdout:JSON.stringify({ format:{ duration:4 },streams:[{ codec_type:'video' }] }),stderr:'' }
      if(request.file==='whisper')await writeFile(join(request.cwd,'audio.json'),JSON.stringify({ segments:[] }))
      return { stdout:'',stderr:'' }
    } })).rejects.toThrow()
    expect(stages).not.toContain('completed');expect(stages.at(-1)).toBe('failed')
  }finally{await rm(root,{ recursive:true,force:true })}
})
it('stops before spawning when cancelled',async()=>{
  const root=await mkdtemp(join(tmpdir(),'motif-media-'))
  try {
    await writeFile(join(root,'source.mp4'),'fixture')
    const abort=new AbortController();abort.abort()
    let calls=0
    await expect(renderEdit(root,plan(),{ tools,signal:abort.signal,run:async()=>{calls++;return { stdout:'',stderr:'' }} })).rejects.toThrow()
    expect(calls).toBe(0)
  }finally{await rm(root,{ recursive:true,force:true })}
})
