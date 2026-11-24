// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DeveloperModeSection, type DeveloperModePreference } from '../src/client/DeveloperMode.tsx'
import { MotifHomeFrame } from '../src/client/MotifSection.tsx'
afterEach(cleanup)
function preference(initial = false) {
  let enabled = initial
  const listeners = new Set<() => void>()
  const setEnabled = vi.fn(async (next: boolean) => { enabled=next;listeners.forEach(fn=>fn()) })
  const enabledSource = {
    getSnapshot: () => enabled,
    subscribe: (fn) => { listeners.add(fn); return () => { listeners.delete(fn) } },
  }
  const value: DeveloperModePreference = { enabled: enabledSource, setEnabled }
  return { value,setEnabled }
}
describe('MOTIF/full Harness mode',()=>{
  it('persists through the upstream preference and switches in both directions',async()=>{
    const p=preference()
    render(<DeveloperModeSection preference={p.value}/>)
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(()=>expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true'))
    expect(p.setEnabled).toHaveBeenCalledWith(true)
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(()=>expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false'))
    expect(p.setEnabled).toHaveBeenCalledWith(false)
  })
  it('shows real downstream Harness content when developer mode is accepted',()=>{
    const p=preference(true)
    render(<MotifHomeFrame hero developerMode={p.value}><div>Real Harness hero</div></MotifHomeFrame>)
    expect(screen.getByText('Real Harness hero')).toBeTruthy()
  })
  it('never replaces an active conversation in either mode',()=>{
    const p=preference(false)
    render(<MotifHomeFrame hero={false} developerMode={p.value}><div>Existing conversation</div></MotifHomeFrame>)
    expect(screen.getByText('Existing conversation')).toBeTruthy()
  })
  it('leaves mode unchanged and displays failed preference writes',async()=>{
    const p=preference();p.setEnabled.mockRejectedValue(new Error('Host refused'))
    render(<DeveloperModeSection preference={p.value}/>)
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(()=>expect(screen.getByRole('alert').textContent).toBe('Host refused'))
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false')
  })
  it('preserves an active conversation instance through a mode round trip',async()=>{
    const p=preference(false)
    function Conversation() {
      const [count,setCount]=useState(0)
      return <button onClick={()=>setCount(count+1)}>Turn {count}</button>
    }
    render(<>
      <DeveloperModeSection preference={p.value}/>
      <MotifHomeFrame hero={false} developerMode={p.value}><Conversation/></MotifHomeFrame>
    </>)
    fireEvent.click(screen.getByText('Turn 0'))
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(()=>expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true'))
    expect(screen.getByText('Turn 1')).toBeTruthy()
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(()=>expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false'))
    expect(screen.getByText('Turn 1')).toBeTruthy()
  })

  it('reads accepted Host state after renderer remount instead of resetting mode', async () => {
    const p=preference()
    const first=render(<DeveloperModeSection preference={p.value}/>)
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(()=>expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true'))
    first.unmount()
    render(<DeveloperModeSection preference={p.value}/>)
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true')
    expect(p.setEnabled).toHaveBeenCalledTimes(1)
  })
  it('cannot change mode without a Host preference owner', () => {
    render(<DeveloperModeSection/>)
    const button=screen.getByRole('switch') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-checked')).toBe('false')
  })
  it('serializes user toggles while Host acknowledgement is pending', async () => {
    const p=preference()
    let finish!: () => void
    p.setEnabled.mockImplementation(()=>new Promise<void>((resolve)=>{finish=resolve}))
    render(<DeveloperModeSection preference={p.value}/>)
    fireEvent.click(screen.getByRole('switch'))
    fireEvent.click(screen.getByRole('switch'))
    expect(p.setEnabled).toHaveBeenCalledTimes(1)
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true)
    finish()
    await waitFor(()=>expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(false))
  })

})
