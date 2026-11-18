import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountLinkButton, AccountLinkProvider } from "@/components/AccountLink";
import * as server from "@/lib/account-link.functions";
import type { LinkedAccount, LinkStatus } from "@/lib/provider-registry";
import { providerViews } from "@/lib/provider-registry";

vi.mock("@/lib/account-link.functions", () => ({
  getLinkStatus: vi.fn(),
  linkApiKey: vi.fn(),
  startOAuth: vi.fn(),
  activateProvider: vi.fn(),
  chooseModel: vi.fn(),
  unlinkAccount: vi.fn(),
}));

const api = vi.mocked(server);
const KEY = "sk-zen-Qm81TESTKEYq7Lm0000";
const providers = providerViews({ configuredEnv: [] });
const ACCOUNT: LinkedAccount = {
  providerId: "opencode",
  method: "api_key",
  status: "connected",
  model: "kimi-k2.7-code",
  connectedAt: 1_000,
  updatedAt: 1_000,
  models: [
    { id: "big-pickle", name: "Big Pickle" },
    { id: "kimi-k2.7-code", name: "Kimi K2.7 Code" },
  ],
};
const OPENROUTER_ACCOUNT: LinkedAccount = {
  providerId: "openrouter",
  method: "openrouter_pkce",
  status: "connected",
  model: "openrouter/auto",
  connectedAt: 2_000,
  updatedAt: 2_000,
  models: [{ id: "openrouter/auto", name: "OpenRouter Auto" }],
};
const OPENROUTER_LINKED: LinkStatus = {
  accounts: [OPENROUTER_ACCOUNT],
  account: OPENROUTER_ACCOUNT,
  activeProviderId: "openrouter",
  providers,
  pendingOAuth: null,
};
const NOTHING: LinkStatus = {
  accounts: [],
  account: null,
  activeProviderId: null,
  providers,
  pendingOAuth: null,
};
const LINKED: LinkStatus = {
  accounts: [ACCOUNT],
  account: ACCOUNT,
  activeProviderId: "opencode",
  providers,
  pendingOAuth: null,
};

function openApp() {
  return render(
    <AccountLinkProvider>
      <AccountLinkButton />
    </AccountLinkProvider>,
  );
}

const popUp = (name = "Connect an AI provider") => screen.findByRole("dialog", { name });

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  api.getLinkStatus.mockResolvedValue(NOTHING);
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("the connection dialog when the app opens", () => {
  it("asks for a provider connection, with only supported methods", async () => {
    openApp();

    const dialog = within(await popUp());

    expect(dialog.getByRole("button", { name: /Connect with OpenRouter/ })).toBeEnabled();
    expect(dialog.getByLabelText("OpenAI API key")).toHaveAttribute("type", "password");
    expect(dialog.getByLabelText("Anthropic Claude API key")).toHaveAttribute("type", "password");
    expect(dialog.queryByRole("button", { name: /ChatGPT/ })).not.toBeInTheDocument();
    expect(dialog.getByText(/Claude Pro\/Max plans cannot sign in/)).toBeInTheDocument();
    expect(dialog.getByText(/MOTIF does not expose Pi's first-party Copilot/)).toBeInTheDocument();
    expect(api.getLinkStatus).toHaveBeenCalledExactlyOnceWith();
    expect(screen.getByText("AI account")).toBeInTheDocument();
    expect(screen.getByText("Not connected")).toBeInTheDocument();
  });

  it("stays closed when this browser already has a connection", async () => {
    api.getLinkStatus.mockResolvedValue(LINKED);

    openApp();

    expect(await screen.findByText("OpenCode Zen · kimi-k2.7-code")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens with the result carried by the OAuth callback URL", async () => {
    window.history.replaceState(null, "", "/?connected=openrouter");
    api.getLinkStatus.mockResolvedValue(OPENROUTER_LINKED);

    openApp();

    const dialog = within(await popUp("Your AI connections"));
    expect(await dialog.findByRole("status")).toHaveTextContent("OpenRouter is connected.");
    expect(window.location.search).toBe("");
  });

  it("does not claim success when the callback cannot be verified", async () => {
    window.history.replaceState(null, "", "/?connected=openrouter");

    openApp();

    const dialog = within(await popUp());
    expect(await dialog.findByRole("alert")).toHaveTextContent(
      "The provider finished sign-in, but this browser could not verify the connection. Try again.",
    );
  });
});

describe("connecting a provider", () => {
  it("links an API key and shows the server's provider note", async () => {
    api.linkApiKey.mockResolvedValue({
      status: LINKED,
      error: null,
      note: "Free models: 43 requests left today.",
    });
    openApp();
    const dialog = within(await popUp());

    fireEvent.change(dialog.getByLabelText("OpenCode Zen API key"), { target: { value: KEY } });
    fireEvent.click(dialog.getByRole("button", { name: "Link OpenCode Zen API key" }));

    expect(await dialog.findByRole("status")).toHaveTextContent(
      "Free models: 43 requests left today.",
    );
    expect(api.linkApiKey).toHaveBeenCalledExactlyOnceWith({
      data: { providerId: "opencode", apiKey: KEY },
    });
    expect(dialog.getByLabelText("Model")).toHaveValue("kimi-k2.7-code");
  });

  it("starts OpenRouter's official OAuth flow from its own button", async () => {
    api.startOAuth.mockResolvedValue({ status: NOTHING, error: null });
    openApp();
    const dialog = within(await popUp());

    fireEvent.click(dialog.getByRole("button", { name: /Connect with OpenRouter/ }));

    await waitFor(() =>
      expect(api.startOAuth).toHaveBeenCalledExactlyOnceWith({
        data: { providerId: "openrouter" },
      }),
    );
  });

  it("shows a provider rejection and keeps the dialog open", async () => {
    const refusal = "Claude (API key) didn't accept that key. Check it and paste it again.";
    api.linkApiKey.mockResolvedValue({ status: NOTHING, error: refusal });
    openApp();
    const dialog = within(await popUp());

    fireEvent.change(dialog.getByLabelText("Anthropic Claude API key"), { target: { value: KEY } });
    fireEvent.click(dialog.getByRole("button", { name: "Link Anthropic Claude API key" }));

    expect(await dialog.findByRole("alert")).toHaveTextContent(refusal);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("managing a connection", () => {
  it("changes the model and disconnects the provider", async () => {
    api.getLinkStatus.mockResolvedValue(LINKED);
    api.chooseModel.mockResolvedValue({
      status: {
        ...LINKED,
        account: { ...ACCOUNT, model: "big-pickle" },
        accounts: [{ ...ACCOUNT, model: "big-pickle" }],
      },
      error: null,
    });
    api.unlinkAccount.mockResolvedValue({ status: NOTHING, error: null });
    openApp();

    fireEvent.click(await screen.findByRole("button", { name: /AI account/ }));
    const dialog = within(await popUp("Your AI connections"));

    fireEvent.change(dialog.getByLabelText("Model"), { target: { value: "big-pickle" } });
    expect(api.chooseModel).toHaveBeenCalledExactlyOnceWith({
      data: { providerId: "opencode", model: "big-pickle" },
    });
    // The model action disables the dialog while it is in flight; wait for it to finish.
    await waitFor(() =>
      expect(dialog.getByRole("button", { name: "Disconnect OpenCode Zen" })).toBeEnabled(),
    );

    fireEvent.click(dialog.getByRole("button", { name: "Disconnect OpenCode Zen" }));
    expect(api.unlinkAccount).not.toHaveBeenCalled();
    fireEvent.click(dialog.getByRole("button", { name: "Confirm disconnect" }));
    await waitFor(() =>
      expect(api.unlinkAccount).toHaveBeenCalledExactlyOnceWith({
        data: { providerId: "opencode" },
      }),
    );
  });
});

it("lets the owner retry an unknown status without claiming disconnection", async () => {
  api.getLinkStatus.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(LINKED);
  openApp();
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t check your connections");
  expect(screen.queryByText("Not connected")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByLabelText("Model")).toHaveValue(ACCOUNT.model);
});

it.each([
  ["needs_reconnect", /Reconnect using a new key/],
  ["limited", /Quota or rate limit reached/],
  ["request_failed", /Last request failed/],
] as const)("presents actionable %s status", async (status, text) => {
  const account = { ...ACCOUNT, status };
  api.getLinkStatus.mockResolvedValue({ ...LINKED, account, accounts: [account] });
  openApp();
  fireEvent.click(await screen.findByRole("button", { name: /AI account/ }));
  expect(await within(await popUp("Your AI connections")).findByText(text)).toBeInTheDocument();
});
