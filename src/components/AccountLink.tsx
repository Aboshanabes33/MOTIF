import { ExternalLink, KeyRound, Link2, Unlink } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  modelNote,
  providerById,
  type AuthMethodView,
  type LinkStatus,
  type LinkedAccount,
  type ProviderId,
  type ProviderView,
} from "@/lib/provider-registry";
import {
  activateProvider,
  chooseModel,
  getLinkStatus,
  linkApiKey,
  startOAuth,
  unlinkAccount,
} from "@/lib/account-link.functions";
import { AccountLinkContext, useAccountLink } from "@/lib/useAccountLink";

const FIELD =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm [color-scheme:dark] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";
const FIELD_LABEL = "grid gap-1.5 text-xs text-muted-foreground";
const focusOnMount = (element: HTMLElement | null) => element?.focus();

/** Reads the provider-connection result the OAuth callback put in the URL, then strips it. */
function takeConnectionOutcome(): { connected?: string; error?: string } {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const connected = params.get("connected") ?? undefined;
  const error = params.get("connection_error") ?? undefined;
  if (!connected && !error) return {};
  params.delete("connected");
  params.delete("connection_error");
  const rest = params.toString();
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`,
  );
  return { ...(connected ? { connected } : {}), ...(error ? { error } : {}) };
}

const OAUTH_ERROR: Record<string, string> = {
  invalid_state: "That sign-in link expired or was already used. Start the connection again.",
  rejected:
    "The provider refused the authorization. Check the request on the provider's page, then try again.",
  unreachable: "MOTIF's server couldn't reach the provider to finish signing in. Try again.",
  denied: "The sign-in was cancelled on the provider's page.",
  session: "Your browser session wasn't found. Refresh the page and try again.",
  limited: "The provider is rate limited or out of credit. Try again later.",
  unsupported: "That provider doesn't support browser sign-in in this build.",
};

/**
 * Asks the visitor to connect an AI provider when the app opens without one, and keeps the dialog
 * available afterwards through `useAccountLink().openLink`.
 */
export function AccountLinkProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const apply = useCallback((next: LinkStatus) => {
    setStatus(next);
  }, []);

  const refresh = useCallback(async (): Promise<LinkStatus | null> => {
    try {
      const next = await getLinkStatus();
      apply(next);
      return next;
    } catch {
      return null;
    }
  }, [apply]);

  /** Runs one server action, applies the status it returns, and surfaces provider errors. */
  const act = useCallback(
    async <T extends { status: LinkStatus; error: string | null; note?: string }>(
      action: () => Promise<T>,
    ): Promise<T | null> => {
      setBusy(true);
      setError(null);
      setNote(null);
      try {
        const result = await action();
        apply(result.status);
        setError(result.error);
        setNote(result.note ?? null);
        return result;
      } catch {
        setError("MOTIF's server didn't answer. Try again.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [apply],
  );

  // When the app opens: learn what this principal has connected, and ask when it is nothing.
  useEffect(() => {
    let left = false;
    const outcome = takeConnectionOutcome();
    void refresh().then((next) => {
      if (left) return;
      if (outcome.connected) {
        const connected = next?.accounts.find((item) => item.providerId === outcome.connected);
        setOpen(true);
        if (connected) {
          setNote(`${providerById(outcome.connected)?.name ?? "The provider"} is connected.`);
        } else {
          setError(
            "The provider finished sign-in, but this browser could not verify the connection. Try again.",
          );
        }
        return;
      }
      if (outcome.error) {
        setOpen(true);
        setError(OAUTH_ERROR[outcome.error] ?? "The provider connection didn't finish. Try again.");
        return;
      }
      if (!next?.account) setOpen(true);
    });
    return () => {
      left = true;
    };
  }, [refresh]);

  const openLink = useCallback(() => {
    setError(null);
    setOpen(true);
    void refresh();
  }, [refresh]);

  const accounts = useMemo(() => status?.accounts ?? [], [status]);
  const account = status?.account ?? null;
  const value = useMemo(
    () => ({ account, accounts, ready: status !== null, openLink }),
    [account, accounts, status, openLink],
  );
  const description = account
    ? "Motif's AI edits run on this connection. You can add or disconnect providers at any time."
    : "Motif's AI edits run on your own AI account. Connect a supported provider to begin.";

  return (
    <AccountLinkContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto focus:outline-none">
          <DialogHeader>
            <DialogTitle>
              {accounts.length > 0 ? "Your AI connections" : "Connect an AI provider"}
            </DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {status === null ? (
            <p className="text-sm text-muted-foreground">Checking your account…</p>
          ) : (
            <Connections
              status={status}
              busy={busy}
              onApiKey={(providerId, apiKey) =>
                void act(() => linkApiKey({ data: { providerId, apiKey } }))
              }
              onOAuth={(providerId) => {
                void act(() => startOAuth({ data: { providerId } })).then((result) => {
                  const authorizationUrl =
                    result && "authorizationUrl" in result ? result.authorizationUrl : undefined;
                  if (authorizationUrl) window.location.assign(authorizationUrl);
                });
              }}
              onActivate={(providerId) =>
                void act(() => activateProvider({ data: { providerId } }))
              }
              onModel={(providerId, model) =>
                void act(() => chooseModel({ data: { providerId, model } }))
              }
              onUnlink={(providerId) => void act(() => unlinkAccount({ data: { providerId } }))}
            />
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {!error && note && (
            <p role="status" className="text-sm text-muted-foreground">
              {note}
            </p>
          )}
          <DialogFooter>
            <Button
              ref={focusOnMount}
              variant={accounts.length > 0 ? "default" : "ghost"}
              onClick={() => setOpen(false)}
            >
              {accounts.length > 0 ? "Done" : "Not now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AccountLinkContext.Provider>
  );
}

function Connections(props: {
  status: LinkStatus;
  busy: boolean;
  onApiKey: (providerId: ProviderId, apiKey: string) => void;
  onOAuth: (providerId: ProviderId) => void;
  onActivate: (providerId: ProviderId) => void;
  onModel: (providerId: ProviderId, model: string) => void;
  onUnlink: (providerId: ProviderId) => void;
}) {
  const { status, busy } = props;
  return (
    <div className="grid gap-5">
      {status.accounts.length > 0 && (
        <section className="grid gap-2">
          <h3 className="text-sm font-semibold">Connected</h3>
          {status.accounts.map((linked) => (
            <ConnectedCard
              key={linked.providerId}
              account={linked}
              active={linked.providerId === status.activeProviderId}
              busy={busy}
              onActivate={() => props.onActivate(linked.providerId)}
              onModel={(model) => props.onModel(linked.providerId, model)}
              onUnlink={() => props.onUnlink(linked.providerId)}
            />
          ))}
        </section>
      )}
      <section className="grid gap-3">
        <h3 className="text-sm font-semibold">Add a provider</h3>
        {status.providers.map((provider) => (
          <ProviderRow
            key={provider.id}
            provider={provider}
            busy={busy}
            onApiKey={props.onApiKey}
            onOAuth={props.onOAuth}
          />
        ))}
        <p className="text-xs text-muted-foreground">
          Keys are validated before they are stored, encrypted at rest on the server, and never
          reach the browser again. Unlinking forgets the credential; it does not cancel it at the
          provider.
        </p>
      </section>
    </div>
  );
}

function ConnectedCard(props: {
  account: LinkedAccount;
  active: boolean;
  busy: boolean;
  onActivate: () => void;
  onModel: (model: string) => void;
  onUnlink: () => void;
}) {
  const { account, active, busy } = props;
  const provider = providerById(account.providerId);
  return (
    <div
      className={`grid gap-2 rounded-lg border p-3 ${active ? "border-primary" : "border-input"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{provider?.name ?? account.providerId}</p>
          <p className="text-xs text-muted-foreground">
            {account.method === "api_key" ? "API key" : "OAuth (BYOAI)"} ·{" "}
            {account.status === "connected" ? "connected" : "needs reconnect"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!active && (
            <Button size="sm" variant="outline" disabled={busy} onClick={props.onActivate}>
              Use
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Disconnect ${provider?.name ?? account.providerId}`}
            disabled={busy}
            onClick={props.onUnlink}
          >
            <Unlink className="size-4" />
          </Button>
        </div>
      </div>
      <label className={FIELD_LABEL}>
        Model
        <select
          className={FIELD}
          value={account.model}
          disabled={busy || account.models.length === 0}
          onChange={(event) => props.onModel(event.target.value)}
        >
          {account.models.map((model) => {
            const note = modelNote(model);
            return (
              <option key={model.id} value={model.id}>
                {note ? `${model.name} — ${note}` : model.name}
              </option>
            );
          })}
        </select>
      </label>
      {account.note && <p className="text-xs text-muted-foreground">{account.note}</p>}
    </div>
  );
}

function ProviderRow(props: {
  provider: ProviderView;
  busy: boolean;
  onApiKey: (providerId: ProviderId, apiKey: string) => void;
  onOAuth: (providerId: ProviderId) => void;
}) {
  const { provider, busy } = props;
  const { id } = provider;
  const [apiKey, setApiKey] = useState("");
  const keyMethod = provider.methods.find((method) => method.id === "api_key");
  const oauthMethods = provider.methods.filter((method) => method.kind === "oauth");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    props.onApiKey(id, apiKey);
    setApiKey("");
  };
  return (
    <div className="grid gap-2 rounded-lg border border-input p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{provider.name}</p>
          {provider.note && (
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{provider.note}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {oauthMethods.map((method) => (
            <Button
              key={method.id}
              size="sm"
              variant="outline"
              disabled={busy || !method.available}
              title={method.available ? method.note : method.note}
              onClick={() => props.onOAuth(id)}
            >
              {method.label}
              <ExternalLink className="size-3.5" />
            </Button>
          ))}
        </div>
      </div>
      {keyMethod && (
        <form className="flex items-center gap-2" onSubmit={submit}>
          <Input
            type="password"
            aria-label={`${provider.name} API key`}
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste API key"
            value={apiKey}
            disabled={busy || !keyMethod.available}
            onChange={(event) => setApiKey(event.target.value)}
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            aria-label={`Link ${provider.name} API key`}
            disabled={busy || !keyMethod.available || apiKey.trim() === ""}
          >
            <KeyRound className="size-4" />
            Link
          </Button>
        </form>
      )}
      {[...oauthMethods, ...(keyMethod ? [keyMethod] : [])]
        .filter((method) => !method.available)
        .map((method) => (
          <UnavailableMethod key={method.id} method={method} />
        ))}
    </div>
  );
}

function UnavailableMethod({ method }: { method: AuthMethodView }) {
  return (
    <p className="text-[11px] leading-snug text-muted-foreground">
      {method.label}: {method.note}{" "}
      {method.docsUrl && (
        <a
          className="underline hover:text-foreground"
          href={method.docsUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Docs
        </a>
      )}
    </p>
  );
}

/** The sidebar entry that shows the active connection and reopens the dialog. */
export function AccountLinkButton() {
  const { account, ready, openLink } = useAccountLink();
  const provider = account ? providerById(account.providerId) : undefined;
  const detail = !ready
    ? "…"
    : account
      ? `${provider?.name ?? account.providerId} · ${account.model}`
      : "Not connected";
  return (
    <button
      onClick={openLink}
      className="mt-auto flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent"
    >
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary">
        <Link2 className="size-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block">AI account</span>
        <span className="block truncate text-[11px] text-muted-foreground">{detail}</span>
      </span>
    </button>
  );
}
