/** Models settings plugin configuration shared by the Host and Client faces; types only. */
import type { Volatile } from '@deepseek-ai/cordis'

/** Credential-onboarding choice; the browser receives it through its synced Config. */
export interface ModelsConfig {
  /** Product builds may omit unrelated account onboarding while retaining Models. */
  hideAccountOnboarding?: Volatile<boolean>
  /** Offer the browser API-key step automatically when no native shell owns credential onboarding. */
  credentialOnboarding: Volatile<boolean>
}
