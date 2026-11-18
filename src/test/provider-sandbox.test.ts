// @vitest-environment node
// Opt-in ONLY: one nonproduction inference using an explicitly authorized key + model.
import { expect, it, vi } from "vitest";
import { AccountLinks } from "@/lib/account-link.server";
import { createPiRuntime } from "@/lib/pi.server";
import { availableApiKeyProviderIds, isProviderId } from "@/lib/provider-registry";
import { createTempVault, principal } from "./test-vault";

it.skipIf(process.env["MOTIF_RUN_PROVIDER_SANDBOX"] !== "1")(
  "connects an authorized sandbox key, selects the requested model and runs inference",
  async () => {
    const provider = process.env["MOTIF_SANDBOX_PROVIDER"] ?? "";
    const model = process.env["MOTIF_SANDBOX_MODEL"];
    const key = process.env["MOTIF_SANDBOX_API_KEY"];
    if (
      !isProviderId(provider) ||
      !availableApiKeyProviderIds().includes(provider) ||
      !model ||
      !key
    )
      throw new Error(
        "A supported sandbox provider, model and dedicated sandbox key are required.",
      );
    const vault = createTempVault();
    const links = new AccountLinks({ createRuntime: createPiRuntime });
    const owner = principal("s");
    try {
      expect((await links.linkApiKey(owner, provider, key)).error).toBeNull();
      expect((await links.chooseModel(owner, provider, model)).error).toBeNull();
      const result = await links.complete(owner, "Reply with the word OK.");
      expect(result.ok && !!result.text.trim()).toBe(true);
      expect((await links.unlink(owner, provider)).status.account).toBeNull();
    } finally {
      vault.cleanup();
      vi.unstubAllEnvs();
    }
  },
  90000,
);
