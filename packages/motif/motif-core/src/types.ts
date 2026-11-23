/** Public shapes exchanged by the Motif host service and its browser surfaces. */

/** Command-line backend Motif can connect. */
export type MotifBackend = 'claude-code' | 'codex'

/** Native sign-in evidence the host can observe without reading a token. */
export type MotifSignIn = 'yes' | 'no' | 'unknown'

/** One backend card's state. */
export interface MotifConnection {
  /** Stable backend id. */
  readonly backend: MotifBackend
  /** Product label shown on the card. */
  readonly label: string
  /** Whether the official command-line tool answers on this machine. */
  readonly installed: boolean
  /** Native sign-in state; `unknown` when only a live test can tell. */
  readonly signedIn: MotifSignIn
  /** One actionable sentence for the card. */
  readonly detail: string
}

/** Visual identity saved with one Brand. */
export interface MotifBrandIdentity {
  /** Primary brand colour. */
  readonly primary: string
  /** Secondary/accent colour. */
  readonly accent: string
  /** Light surface colour. */
  readonly light: string
  /** Ink/dark surface colour. */
  readonly dark: string
  /** Latin typeface. */
  readonly latinFont: string
  /** Arabic typeface. */
  readonly arabicFont: string
  /** Motion style key. */
  readonly motion: string
  /** Caption look key. */
  readonly caption: string
}

/** One Brand as the browser shows it. */
export interface MotifBrand {
  /** Stable folder slug. */
  readonly id: string
  /** Registered Workspace id, when the host could register the folder. */
  readonly workspaceId?: string
  /** Display name. */
  readonly name: string
  /** Absolute Brand folder. */
  readonly path: string
  /** Saved identity. */
  readonly identity: MotifBrandIdentity
  /** Logo as a data URL, when one was uploaded. */
  readonly logo?: string
  /** ISO instant of the last local edit. */
  readonly updatedAt: string
  /** Number of files currently in the Brand timeline. */
  readonly videoCount: number
}

/** One Brand folder that could not be read while listing. */
export interface MotifBrandProblem {
  /** Absolute folder that failed. */
  readonly path: string
  /** `corrupt` for unreadable `brand.json`, `unreadable` for I/O failures. */
  readonly kind: 'corrupt' | 'unreadable'
  /** Actionable one-sentence description. */
  readonly message: string
}

/** One full read for the shell. */
export interface MotifSnapshot {
  /** Brands in most-recently-edited order. */
  readonly brands: readonly MotifBrand[]
  /** Brand folders that failed to read; empty when every folder read. */
  readonly brandProblems: readonly MotifBrandProblem[]
  /** Both backend cards. */
  readonly connections: readonly MotifConnection[]
}

/** Form payload for a new Brand. */
export interface MotifBrandCreateRequest {
  /** Display name; required and unique on disk after slugging. */
  readonly name: string
  /** Identity the form collected. */
  readonly identity: MotifBrandIdentity
  /** Optional logo data URL (`data:image/...;base64,...`). */
  readonly logo?: string
}

/** Result of creating a Brand. */
export interface MotifBrandCreateResult {
  /** The saved Brand. */
  readonly brand: MotifBrand
  /** Workspace that now points at its folder. */
  readonly workspaceId: string
}

/** One backend-scoped action. */
export interface MotifBackendRequest {
  /** Backend to act on. */
  readonly backend: MotifBackend
}

/** Result of an install, sign-in, or test action. */
export interface MotifActionResult {
  /** Whether the action reached its goal. */
  readonly ok: boolean
  /** One sentence safe to show beside the card. */
  readonly message: string
}
