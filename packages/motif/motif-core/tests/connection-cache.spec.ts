import { afterEach, describe, expect, it, vi } from 'vitest'
import { inspectConnections, installBackend, signInBackend, invalidateConnectionProbe } from '../src/connection.ts'
import type { ConnectionInternals } from '../src/connection.ts'
afterEach(()=>vi.useRealTimers())
function setup() {
  const exec=vi.fn(async()=>({ stdout:'1.0',stderr:'' }))
  const internals:ConnectionInternals={ exec,exists:()=>false,env:{ HOME:'/nonexistent' },spawn:()=>({ unref(){} }) }
  return { exec,internals }
}
describe('connection probe concurrency/cache',()=>{
  it('starts both backends before either completes',async()=>{
    const { exec,internals }=setup()
    const release:(()=>void)[]=[]
    exec.mockImplementation(()=>new Promise(resolve=>release.push(()=>resolve({ stdout:'ok',stderr:'' }))))
    const answer=inspectConnections(undefined,internals)
    expect(exec).toHaveBeenCalledTimes(2)
    release.forEach(fn=>fn())
    expect((await answer).map(x=>x.backend)).toEqual(['claude-code','codex'])
  })
  it('deduplicates overlapping reads and expires after the short TTL',async()=>{
    vi.useFakeTimers()
    const { exec,internals }=setup()
    await Promise.all([inspectConnections(undefined,internals),inspectConnections(undefined,internals)])
    expect(exec).toHaveBeenCalledTimes(2)
    await inspectConnections(undefined,internals);expect(exec).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(3001)
    await inspectConnections(undefined,internals);expect(exec).toHaveBeenCalledTimes(4)
  })
  it('isolates contexts and invalidates only the requested provider',async()=>{
    const a=setup(),b=setup()
    await inspectConnections(undefined,a.internals);await inspectConnections(undefined,b.internals)
    invalidateConnectionProbe('codex',undefined,a.internals)
    await inspectConnections(undefined,a.internals)
    expect(a.exec).toHaveBeenCalledTimes(3);expect(b.exec).toHaveBeenCalledTimes(2)
  })
  it.each(['install','signIn'])('invalidates after %s',async(action:string)=>{
    const { exec,internals }=setup()
    await inspectConnections(undefined,internals)
    if(action==='install') await installBackend('codex',undefined,internals)
    else await signInBackend('codex',undefined,internals)
    const before=exec.mock.calls.length
    await inspectConnections(undefined,internals)
    expect(exec.mock.calls.length).toBe(before+1)
  })
  it('keeps the 5s per-process timeout and isolates one provider failure',async()=>{
    const { exec,internals }=setup()
    exec.mockImplementation(async(file:string)=>{if(file==='claude')throw new Error('timeout');return { stdout:'ok',stderr:'' }})
    const cards=await inspectConnections(undefined,internals)
    expect(cards.map(x=>x.installed)).toEqual([false,true])
    expect(exec.mock.calls.every((call: unknown)=>(call as unknown as [string,string[],{ timeout:number }])[2].timeout===5000)).toBe(true)
  })
})
