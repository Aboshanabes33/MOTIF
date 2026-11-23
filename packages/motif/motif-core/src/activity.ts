/**
 * Which AI the shell actually routes to: a per-backend fold of relay status
 * events. This is observed fact, not a guess from sign-in state: an entry
 * exists only after the relay really sent work to that backend and model.
 *
 * @module @deepseek-ai/dsh-motif-core/activity
 */

/** Last observed relay state for one backend. */
export interface MotifActivity {
  /** Command-line backend that handled the send. */
  readonly backend: string
  /** Relay model id selected for that send. */
  readonly model: string
  /** `running` while a send is in flight, then its terminal outcome. */
  readonly state: 'running' | 'finished' | 'failed'
  /** ISO instant of the latest observed event. */
  readonly at: string
}

/** Minimal shape of one relay status fact, as emitted by the relay route. */
export interface MotifActivityEvent {
  readonly backend: string
  readonly model: string
  readonly status: 'started' | 'working' | 'finished' | 'failed'
}

/**
 * Fold one relay status event into the activity list: one row per backend,
 * newest activity first.
 * @param current - previous rows.
 * @param event - observed relay status.
 * @param at - ISO instant the event was observed.
 * @returns the next rows.
 */
export function reduceActivity(
  current: readonly MotifActivity[],
  event: MotifActivityEvent,
  at: string,
): MotifActivity[] {
  const state = event.status === 'started' || event.status === 'working' ? 'running' : event.status
  const next: MotifActivity = { backend: event.backend, model: event.model, state, at }
  return [next, ...current.filter(row => row.backend !== event.backend)]
}
