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
  /** Number of video assets (`.mp4`, `.mov`, `.webm`, `.mkv`, `.m4v`) in the Brand folder. */
  readonly videoCount: number
}

/** One full read for the shell. */
export interface MotifSnapshot {
  /** Brands in most-recently-edited order. */
  readonly brands: readonly MotifBrand[]
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

/** Analyze one public web page into a Brand identity suggestion. */
export interface MotifWebsiteAnalysisRequest {
  /** User-entered address; http or https only. */
  readonly url: string
}

/** Identity suggestion read from one web page, for the user to review in the form. */
export interface MotifWebsiteSuggestion {
  /** Suggested Brand name from the document title, when the page declares one. */
  readonly name?: string
  /** Suggested identity; unset fields keep the Brand form defaults. */
  readonly identity: MotifBrandIdentity
  /** Final page URL after redirects. */
  readonly source: string
}

/** One file in a Brand's timeline folder, as the editor surface shows it. */
export interface MotifTimelineEntry {
  /** File name within the timeline folder. */
  readonly name: string
  /** Size in bytes. */
  readonly bytes: number
  /** ISO instant of the last local modification. */
  readonly updatedAt: string
}

/** Read one Brand's timeline folder. */
export interface MotifTimelineRequest {
  /** Stable folder slug of the Brand. */
  readonly brandId: string
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


/** AI provider a user can authenticate with an API key instead of a CLI subscription. */
export type MotifApiProvider = 'anthropic' | 'openai'

/** Save (insert or replace) one provider API key. */
export interface MotifApiKeySaveRequest {
  /** Provider the key belongs to. */
  readonly provider: MotifApiProvider
  /** The key exactly as pasted; the Host trims and validates it. */
  readonly apiKey: string
}

/** Verify one supplied key, or the stored key when `apiKey` is omitted. */
export interface MotifApiKeyTestRequest {
  /** Provider the key belongs to. */
  readonly provider: MotifApiProvider
  /** A draft key to verify without storing; omitted tests the stored key. */
  readonly apiKey?: string
}

/** Provider-scoped credential query or deletion. */
export interface MotifApiKeyRequest {
  /** Provider to act on. */
  readonly provider: MotifApiProvider
}

/** UI-safe view of one provider's stored key; never the value. */
export interface MotifApiKeyStatus {
  /** Provider this status describes. */
  readonly provider: MotifApiProvider
  /** Whether a key is stored in the Host credential store. */
  readonly configured: boolean
  /** Masked preview of the stored key (last characters only). */
  readonly masked?: string
  /** Environment variable the backend reads this key from. */
  readonly env: string
  /** CLI backend the key authenticates. */
  readonly backend: MotifBackend
  /** Whether the Host store accepts writes. */
  readonly writable: boolean
}

/** Truthful result of one verification request. */
export interface MotifApiKeyTestResult {
  /** Whether the provider accepted the key. */
  readonly ok: boolean
  /** One sentence safe to show beside the card. */
  readonly detail: string
}

/** Save outcome: the stored fact plus the verification result. */
export interface MotifApiKeySaveResult {
  /** Whether the key is now stored (validation passed). */
  readonly stored: boolean
  /** Verification of the key just stored. */
  readonly test: MotifApiKeyTestResult
  /** UI-safe status after the write. */
  readonly status: MotifApiKeyStatus
}
