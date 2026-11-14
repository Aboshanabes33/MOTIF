// Account linking, the part the browser and the server share: the providers Motif offers and the
// shapes that cross the wire. No secret and no server code belongs here; the server side is
// account-link.server.ts.

/** How an account is linked: a pasted API key, or the provider's own sign-in (a subscription). */
export type LinkMethod = "api_key" | "sign_in";

type LinkProvider = {
  /** The provider's ID in the Pi SDK. */
  readonly id: string;
  readonly name: string;
  /** Label of the sign-in button. Absent when the provider only takes an API key. */
  readonly signIn?: string;
  /** The model Motif uses until the user picks another: the Pi SDK's own default for the provider. */
  readonly defaultModel: string;
};

/** What the pop-up offers. Every provider takes an API key; `signIn` adds an account sign-in. */
export const LINK_PROVIDERS = [
  { id: "openai", name: "OpenAI", signIn: "Sign in with ChatGPT", defaultModel: "gpt-6.1-sol" },
  { id: "opencode", name: "OpenCode Zen", defaultModel: "kimi-k2.7-code" },
  { id: "opencode-go", name: "OpenCode Go", defaultModel: "kimi-k3.1-pro" },
] as const satisfies readonly LinkProvider[];

export type LinkProviderId = (typeof LINK_PROVIDERS)[number]["id"];

export function linkProvider(id: LinkProviderId): LinkProvider {
  return LINK_PROVIDERS.find((provider) => provider.id === id)!;
}

/** A question the provider's sign-in is waiting on. */
export type SignInPrompt = {
  /** Sent back with the answer, so a late answer cannot land on a newer question. */
  id: string;
  kind: "text" | "secret" | "select" | "manual_code";
  message: string;
  placeholder?: string;
  /** The choices of a `select`. The answer is the chosen `id`. */
  options?: { id: string; label: string; description?: string }[];
};

/** A sign-in that is running, or that just failed. */
export type SignInView = {
  providerId: LinkProviderId;
  /** The provider's sign-in page, to open in a new tab. */
  url?: string;
  /** A one-time code to enter on the provider's page, for sign-ins that use one. */
  code?: { value: string; url: string };
  /** The provider's latest progress message. */
  message?: string;
  prompt?: SignInPrompt;
  /** Why the sign-in failed. When set, the sign-in is over. */
  error?: string;
};

export type LinkedAccount = {
  providerId: LinkProviderId;
  method: LinkMethod;
  /** The model the AI features use. */
  model: string;
  /** The models this account can choose from. */
  models: { id: string; name: string }[];
};

export type LinkStatus = {
  /**
   * Names this browser's link on later calls. It is a handle, not a credential: the API key or
   * sign-in stays on the server. Null when nothing is linked and no sign-in is running.
   */
  token: string | null;
  account: LinkedAccount | null;
  signIn: SignInView | null;
};

/** The outcome of an action in the pop-up: the new status and, when it failed, why. */
export type LinkResult = { status: LinkStatus; error: string | null };

/** Why an AI request could not be answered. */
export type AiFailure = "not_linked" | "rejected" | "limited" | "failed";
