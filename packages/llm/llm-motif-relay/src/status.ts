/**
 * Coarse relay status published while a command-line run is in flight. No
 * progress is streamed, so the surfaces that show a relay send need only these
 * four states.
 *
 * @module @deepseek-ai/dsh-llm-motif-relay/status
 */

import type { SessionId } from '@deepseek-ai/dsh-session'

/** One coarse state of a relay send. */
export type RelayStatus = 'started' | 'working' | 'finished' | 'failed'

/** Host-local progress fact for one relay send. */
export interface RelayStatusEvent {
  /** Session whose turn is delegating. */
  readonly sessionId: SessionId
  /** Registered command-line backend handling this send. */
  readonly backend: string
  /** Relay model id selected for this send. */
  readonly model: string
  /** Coarse state reached; `finished` and `failed` are terminal for the send. */
  readonly status: RelayStatus
}
