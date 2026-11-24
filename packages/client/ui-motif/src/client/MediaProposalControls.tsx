import { useEffect, useMemo, useRef, useState } from 'react'
import { mediaClient } from './media-client.ts'
import type { ReviewedMediaPlan } from './MediaWorkbench.tsx'
/** Uses the existing Brand Session sender. No alternate provider and no automatic render. */
export function MediaProposalControls({ brand, file, send, apply }: {
  brand: string
  file: File | undefined
  send: ((prompt: string, signal: AbortSignal) => Promise<{ ok: boolean; message: string }>) | undefined
  apply: (clips: ReviewedMediaPlan['clips']) => void
}) {
  const client = useMemo(() => mediaClient(brand), [brand])
  const [instruction, setInstruction] = useState(''), [message, setMessage] = useState('')
  const [proposal, setProposal] = useState<string>(), [plan, setPlan] = useState<ReviewedMediaPlan>()
  const [available, setAvailable] = useState(false), [busy, setBusy] = useState(false)
  const operation = useRef<AbortController>()
  useEffect(() => {
    const controller = new AbortController()
    void client.readiness(controller.signal).then((value) => {
      if (!controller.signal.aborted) setAvailable(value.available)
    }).catch(() => {})
    return () => { controller.abort(); operation.current?.abort() }
  }, [client])
  useEffect(() => {
    setProposal(undefined); setPlan(undefined); setMessage(''); operation.current?.abort()
    return () => { operation.current?.abort() }
  }, [file])
  async function request() {
    if (!file || !send || !available || busy) return
    const controller = new AbortController(); operation.current = controller; setBusy(true); setPlan(undefined); setProposal(undefined)
    try {
      setMessage('Importing source for a Session proposal...')
      const source = await client.import(file, controller.signal); controller.signal.throwIfAborted()
      const proposed = await client.proposal(source.id, instruction, controller.signal); controller.signal.throwIfAborted()
      const result = await send(proposed.prompt, controller.signal); controller.signal.throwIfAborted()
      if (!result.ok) throw new Error(result.message || 'Session refused the proposal request.')
      setProposal(proposed.id); setMessage('Request admitted to the existing Brand Session. Check for its proposal after the turn finishes.')
    } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Proposal request failed.') }
    finally { setBusy(false) }
  }
  async function check() {
    if (!proposal || busy) return
    const controller = new AbortController(); operation.current = controller; setBusy(true)
    try {
      const result = await client.readProposal(proposal, controller.signal); controller.signal.throwIfAborted()
      setPlan(result.plan); setMessage(result.state === 'ready' ? 'Proposal ready. Inspect its cuts before applying and reviewing.' : 'No valid proposal yet. Check the Brand Session for progress or failure.')
    } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Proposal unavailable.') }
    finally { setBusy(false) }
  }
  return <section aria-label="Session video proposal"><h4>Ask the selected Brand Session for cuts</h4>
    <label>Editing instructions<textarea value={instruction} maxLength={4000}
      onChange={(event) => { setInstruction(event.target.value) }} disabled={busy}/></label>
    <button type="button" disabled={!available || !send || !file || !instruction.trim() || busy} onClick={() => { void request() }}>Request proposal in existing Session</button>
    {proposal && <button type="button" disabled={busy} onClick={() => { void check() }}>Check Session proposal</button>}
    {message && <p role="status">{message}</p>}
    {plan && <><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(plan, null, 2)}</pre>
      <button type="button" disabled={busy} onClick={() => { apply(plan.clips); setPlan(undefined); setMessage('Cuts applied, not approved. Preview and use Review plan before rendering.') }}>Apply proposed cuts for review</button></>}
    <p>No provider is selected or changed here. A proposal never starts a render. This flow remains disabled until full acceptance.</p>
  </section>
}
