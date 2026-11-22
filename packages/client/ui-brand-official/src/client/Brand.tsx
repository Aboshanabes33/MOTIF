import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * Render the Motif mark with the presentation requested by its host surface.
 * @param props - Host-supplied mark presentation.
 * @returns the Motif logo mark.
 */
export function OfficialBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="9" fill="#FF5A36" />
      <path
        d="M8.5 20.5v-9l7.5 5.6 7.5-5.6v9"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Render the Motif name without its independently slotted mark.
 * @returns the Motif wordmark.
 */
export function OfficialBrandName() {
  return <span style={{ fontWeight: 650, letterSpacing: '-0.02em' }}>Motif</span>
}
