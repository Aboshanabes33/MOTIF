// @vitest-environment node
import { statSync, readFileSync, writeFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  credentialStoreFor,
  deleteConnection,
  getActiveProvider,
  getConnection,
  listConnections,
  listPendingFlows,
  putConnection,
  saveFlow,
  consumeFlow,
  setActiveProvider,
} from "@/lib/connection-vault.server";

import { principal, createTempVault } from "./test-vault";

let vault: ReturnType<typeof createTempVault>;

beforeEach(() => {
  vault = createTempVault();
});

afterEach(() => {
  vault.cleanup();
});

describe("encrypted connection vault", () => {
  it("never writes raw API keys to disk, and isolates principals", async () => {
    const anna = principal("a");
    const omar = principal("b");
    const secret = "sk-live-raw-secret-value-that-must-not-appear-on-disk";
    const store = credentialStoreFor(anna);

    await store.modify("openrouter", async () => ({ type: "api_key", key: secret }));
    await putConnection(anna, {
      providerId: "openrouter",
      method: "api_key",
      status: "connected",
      modelId: "openrouter/auto",
      connectedAt: 1_000,
      updatedAt: 1_000,
    });
    await setActiveProvider(anna, "openrouter");

    const raw = readFileSync(vault.file, "utf8");
    expect(raw).not.toContain(secret);
    expect(raw).not.toContain("sk-live");
    expect(JSON.stringify(await listConnections(omar))).not.toContain(secret);

    expect(await getConnection(anna, "openrouter")).toMatchObject({
      providerId: "openrouter",
      modelId: "openrouter/auto",
      status: "connected",
    });
    expect(await getActiveProvider(anna)).toBe("openrouter");
    expect(await getActiveProvider(omar)).toBeNull();
  });

  it("keeps metadata out of the plaintext file too", async () => {
    const owner = principal("c");
    const store = credentialStoreFor(owner);
    await store.modify("anthropic", async () => ({ type: "api_key", key: "sk-ant-test" }));
    await putConnection(owner, {
      providerId: "anthropic",
      method: "api_key",
      status: "connected",
      modelId: "claude-sonnet-4-6",
      connectedAt: 123,
      updatedAt: 123,
    });

    const raw = readFileSync(vault.file, "utf8");
    expect(raw).not.toContain("claude-sonnet-4-6");
    expect(statSync(vault.file).mode & 0o777).toBe(0o600);
  });

  it("consumes an OAuth flow once and forgets expired flows", async () => {
    const owner = principal("d");
    await saveFlow(owner, {
      state: "one-time-state",
      providerId: "openrouter",
      method: "openrouter_pkce",
      verifier: "verifier-value",
      challenge: "challenge-value",
      redirectUri: "https://motif.test/api/auth/openrouter/callback",
      createdAt: 10,
      expiresAt: Date.now() + 60_000,
    });

    expect((await listPendingFlows(owner)).map((flow) => flow.providerId)).toEqual(["openrouter"]);
    expect((await consumeFlow(owner, "wrong-state"))?.state).toBeUndefined();
    expect((await consumeFlow(owner, "one-time-state"))?.verifier).toBe("verifier-value");
    expect(await consumeFlow(owner, "one-time-state")).toBeNull();

    await saveFlow(owner, {
      state: "expired-state",
      providerId: "openrouter",
      method: "openrouter_pkce",
      verifier: "verifier-value",
      challenge: "challenge-value",
      redirectUri: "https://motif.test/api/auth/openrouter/callback",
      createdAt: 10,
      expiresAt: 11,
    });
    expect(await consumeFlow(owner, "expired-state")).toBeNull();
  });

  it("refuses to activate a provider without a stored credential", async () => {
    await expect(setActiveProvider(principal("e"), "openai")).rejects.toThrow(/stored credential/);
  });

  it("fails closed on a corrupt vault instead of overwriting it", async () => {
    writeFileSync(vault.file, "{not-json");
    await expect(listConnections(principal("f"))).rejects.toThrow(/encrypted connection store/);
  });

  it("deletes a connection and reports none remaining", async () => {
    const owner = principal("g");
    const store = credentialStoreFor(owner);
    await store.modify("xai", async () => ({ type: "api_key", key: "xai-test" }));
    await putConnection(owner, {
      providerId: "xai",
      method: "api_key",
      status: "connected",
      modelId: "grok-4.7",
      connectedAt: 1,
      updatedAt: 1,
    });
    await setActiveProvider(owner, "xai");

    await deleteConnection(owner, "xai");

    expect(await getConnection(owner, "xai")).toBeUndefined();
    expect(await getActiveProvider(owner)).toBeNull();
  });
});
