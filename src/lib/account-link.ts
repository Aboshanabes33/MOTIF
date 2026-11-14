// Account linking, the part the browser and the server share: the providers Motif offers and the
// shapes that cross the wire. No secret and no server code belongs here; the server side is
// account-link.server.ts.

/** How an account is linked: a pasted API key, or the provider's own sign-in (a subscription). */
export type LinkMethod = "api_key" | "sign_in";

/**
 * How a sign-in completes on the provider's side.
 *
 * - `device_code`: the server asks the provider for a one-time code, the user approves on the
 *   provider's page in any browser, and the server collects the result. Needs no callback URL and
 *   no localhost port, so it is the only kind that works when the browser and the server are on
 *   different machines (which, on the web, is always). The Pi SDK reaches this kind through the
 *   `openai-codex` provider.
 * - `browser`: the provider sends the browser back to a loopback address on the server's own
 *   machine. Only works when the two share a machine, so Motif offers it to a local build and not
 *   to the hosted web app.
 */
export type SignInKind = "device_code" | "browser";

type LinkProvider = {
  /** The provider's ID in the Pi SDK. */
  readonly id: string;
  readonly name: string;
  /** What a sign-in with this provider is called in the pop-up. Absent when it takes only a key. */
  readonly signIn?: string;
  /** How `signIn` completes. Absent when the provider takes only an API key. */
  readonly signInKind?: SignInKind;
  /** The model Motif uses until the user picks another: the Pi SDK's own default for the provider. */
  readonly defaultModel: string;
  /**
   * True for a provider that only accepts an account, never a key. The pop-up then offers no
   * key field for it.
   */
  readonly accountOnly?: boolean;
  /** Set when signing in with this entry earns a different method name on the server. */
  readonly apiKeyProviderId?: string;
};

/**
 * What the pop-up offers, in the order it shows them.
 *
 * `openai-codex` is the ChatGPT subscription. It is a separate provider in the Pi SDK from
 * `openai`, and deliberately so: `openai` finishes a sign-in by receiving a redirect on
 * `127.0.0.1:1455` of the server's own machine, and when that redirect never arrives it asks the
 * user to paste a URL. `openai-codex` can sign in with a device code instead, which needs neither.
 * Both reach the same subscription; only the way in differs.
 */
export const LINK_PROVIDERS = [
  {
    id: "openai-codex",
    name: "ChatGPT",
    signIn: "Connect ChatGPT",
    signInKind: "device_code",
    defaultModel: "gpt-6.1-sol",
    accountOnly: true,
  },
  { id: "openai", name: "OpenAI (API key)", defaultModel: "gpt-6.1-sol" },
  { id: "opencode", name: "OpenCode Zen", defaultModel: "kimi-k2.7-code" },
  { id: "opencode-go", name: "OpenCode Go", defaultModel: "kimi-k3.1-pro" },
] as const satisfies readonly LinkProvider[];

export type LinkProviderId = (typeof LINK_PROVIDERS)[number]["id"];

export function linkProvider(id: LinkProviderId): LinkProvider {
  return LINK_PROVIDERS.find((provider) => provider.id === id)!;
}

export type LinkProviderEntry = (typeof LINK_PROVIDERS)[number];

/**
 * The providers that hold an API key, i.e. the ones the key form may offer. A provider marked
 * `accountOnly` takes no key and is left out.
 */
export const API_KEY_PROVIDERS: readonly (LinkProvider & { id: LinkProviderId })[] =
  LINK_PROVIDERS.filter((provider) => !("accountOnly" in provider && provider.accountOnly));

/** The providers that can sign in to an account, i.e. the ones the Connect buttons offer. */
export const SIGN_IN_PROVIDERS: readonly (LinkProvider & {
  id: LinkProviderId;
  readonly signIn: string;
  readonly signInKind: SignInKind;
})[] = LINK_PROVIDERS.flatMap((provider) =>
  "signIn" in provider && provider.signIn !== undefined && "signInKind" in provider
    ? [{ ...provider, signIn: provider.signIn, signInKind: provider.signInKind }]
    : [],
);

/** Whether the server can sign in to a provider at all. */
export function hasSignIn(id: LinkProviderId): boolean {
  return linkProvider(id).signIn !== undefined;
}

/** The provider an API-key form chose, when it came from `API_KEY_PROVIDERS`. */
export function keyProvider(id: string): (LinkProvider & { id: LinkProviderId }) | undefined {
  return API_KEY_PROVIDERS.find(
    (provider): provider is LinkProvider & { id: LinkProviderId } => provider.id === id,
  );
}

/** A question the provider's sign-in is waiting on. */
export type SignInPrompt = {
  /** Sent back with the answer, so a late answer cannot land on a newer question. */
  id: string;
  /**
   * `manual_code` is the provider asking for a pasted redirect URL. Motif's web pop-up never shows
   * it (the server refuses it, see account-link.server.ts); it stays a possible kind so a build
   * that does show it, such as a local one, is not lying to the type checker.
   */
  kind: "text" | "secret" | "select" | "manual_code";
  message: string;
  placeholder?: string;
  /** The choices of a `select`. The answer is the chosen `id`. */
  options?: { id: string; label: string; description?: string }[];
};

/** A sign-in that is running, or that just failed. */
export type SignInView = {
  providerId: LinkProviderId;
  /** How this sign-in completes, which decides what the pop-up says. */
  kind: SignInKind;
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
