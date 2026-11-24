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
      if(request.file==='ffmpeg') await writeFile(join(request.cwd, request.args.at(-1)!), 'encoded fixture')
      if(request.file==='whisper')await writeFile(join(request.cwd,'audio.json'),JSON.stringify({ segments:[{ start:0,end:4,text:'sample' }] }))
      if(request.file==='hyperframes')await writeFile(join(request.cwd,'output.partial.mp4'),'render fixture')
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
      if(request.file==='ffmpeg') await writeFile(join(request.cwd, request.args.at(-1)!), 'encoded fixture')
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

it('rejects unknown operations and malformed Whisper words', () => {
  expect(() => validateEditPlan({ ...plan(), shell: 'not allowed' } as ReturnType<typeof plan>)).toThrow('Unknown')
  expect(() => validateTranscript({ segments: [{ start: 0, end: 2, text: 'x', words: [{ start: 1, end: 3, word: 'x' }] }] })).toThrow('word')
})

it('uses an immutable source snapshot and strips ambient secrets from tools', async () => {
  const root = await mkdtemp(join(tmpdir(), 'motif-media-'))
  const old = process.env.MOTIF_TEST_API_KEY
  process.env.MOTIF_TEST_API_KEY = 'synthetic-not-for-tools'
  try {
    await writeFile(join(root, 'source.mp4'), 'original bytes')
    await expect(renderEdit(root, plan(), { tools, signal: new AbortController().signal, run: async (request) => {
      expect(request.env?.MOTIF_TEST_API_KEY).toBeUndefined()
      expect(request.env?.HYPERFRAMES_EXTRACT_CACHE_DIR).toBe('off')
      const source = request.args.at(-1)!
      expect(source).not.toBe(join(root, 'source.mp4'))
      expect(await readFile(source, 'utf8')).toBe('original bytes')
      await writeFile(join(root, 'source.mp4'), 'changed after snapshot')
      expect(await readFile(source, 'utf8')).toBe('original bytes')
      throw new Error('end fixture')
    } })).rejects.toThrow('end fixture')
  } finally {
    if (old === undefined) delete process.env.MOTIF_TEST_API_KEY
    else process.env.MOTIF_TEST_API_KEY = old
    await rm(root, { recursive: true, force: true })
  }
})

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const execute = promisify(execFile)
it('snapshots and probes a real local FFmpeg video without claiming transcription/render completion', async () => {
  const root = await mkdtemp(join(tmpdir(), 'motif-media-'))
  try {
    await execute('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=64x64:d=1', '-c:v', 'libx264', join(root, 'source.mp4')])
    let probed = false
    await expect(renderEdit(root, { version: 1, source: 'source.mp4', clips: [{ start: 0, end: 1 }] }, {
      tools, signal: new AbortController().signal,
      run: async (request) => {
        if (request.file !== 'ffprobe') throw new Error('Whisper/render intentionally unavailable in smoke test')
        const result = await execute(request.file, request.args, { cwd: request.cwd, env: request.env })
        expect(JSON.parse(result.stdout).streams.some((stream: { codec_type: string }) => stream.codec_type === 'video')).toBe(true)
        probed = true
        return result
      },
    })).rejects.toThrow('intentionally unavailable')
    expect(probed).toBe(true)
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('enforces the snapshot budget before launching a tool', async () => {
  const root = await mkdtemp(join(tmpdir(), 'motif-media-'))
  try {
    await writeFile(join(root, 'source.mp4'), 'larger than quota')
    let launched = false
    await expect(renderEdit(root, plan(), { tools, maxBytes: 2, signal: new AbortController().signal,
      run: async () => { launched = true; return { stdout: '', stderr: '' } },
    })).rejects.toThrow('snapshot budget')
    expect(launched).toBe(false)
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('binds execution snapshot to the reviewed source hash before spawning any tool', async () => {
  const root = await mkdtemp(join(tmpdir(), 'motif-media-reviewed-'))
  try {
    await writeFile(join(root, 'source.mp4'), 'changed after review')
    let calls = 0
    await expect(renderEdit(root, plan(), { tools, sourceHash: '0'.repeat(64), signal: new AbortController().signal, run: async () => { calls++; return { stdout: '', stderr: '' } } })).rejects.toThrow('Reviewed source changed')
    expect(calls).toBe(0)
  } finally { await rm(root, { recursive: true, force: true }) }
})
