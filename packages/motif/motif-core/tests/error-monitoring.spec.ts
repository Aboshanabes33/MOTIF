import { describe,expect,it,vi } from 'vitest'
import { MotifErrorMonitoring,safeErrorEvent } from '../src/error-monitoring.ts'
const config={ dsn:'https://configured.invalid/1',enabled:true,release:'1.2.3',runtime:'host' as const,environment:'production' as const }
describe('safe diagnostic boundary',()=>{
  it('rebuilds allowed context and drops all raw content, paths, stack and user metadata',()=>{
    const event=safeErrorEvent({ message:'sk-secret prompt',exception:{ values:[{ value:'private' }] },user:{ email:'private' },request:{ url:'/home/private' },extra:{ token:'private' },tags:{ operation:'relay-send',code:'failed',runtime:'host',environment:'production',prompt:'private' },release:'1.2.3' })
    expect(event).toEqual({ message:'MOTIF operation failed',level:'error',tags:{ operation:'relay-send',code:'failed',runtime:'host',environment:'production' },release:'1.2.3' })
    expect(JSON.stringify(event)).not.toContain('private')
  })
  it('rejects unknown operation/code and non-version release',()=>{
    expect(safeErrorEvent({ tags:{ operation:'a private prompt' } })).toBeNull()
    expect(safeErrorEvent({ tags:{ operation:'startup',code:'failed',runtime:'host',environment:'production' },release:'/home/user' })).not.toHaveProperty('release')
  })
  it('is a no-op without DSN or SDK and in development',()=>{
    const sink={ captureEvent:vi.fn() }
    new MotifErrorMonitoring(sink,{ ...config,dsn:undefined }).capture(new Error('private'),'startup')
    new MotifErrorMonitoring(sink,{ ...config,environment:'development' }).capture(new Error('private'),'startup')
    expect(()=>new MotifErrorMonitoring(undefined,config).capture('x','startup')).not.toThrow()
    expect(sink.captureEvent).not.toHaveBeenCalled()
  })
  it('captures once per owned error and never captures cancellation',()=>{
    const sink={ captureEvent:vi.fn() }, monitor=new MotifErrorMonitoring(sink,config),error=new Error('secret')
    monitor.capture(error,'relay-send');monitor.capture(error,'relay-send')
    monitor.capture(new Error(),'relay-send','failed',false);monitor.capture(new Error(),'relay-send','cancelled')
    expect(sink.captureEvent).toHaveBeenCalledTimes(1)
  })
  it('does not throw if the SDK fails',()=>{
    const monitor=new MotifErrorMonitoring({ captureEvent(){throw new Error('offline')} },config)
    expect(()=>monitor.capture(new Error('private'),'startup')).not.toThrow()
  })
})
