import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { PROVIDERS, isProviderId, type ProviderId } from "./provider-registry";
import { accountLinks } from "./account-link.server";
import { currentPrincipal } from "./principal.server";

const providerId = z.custom<ProviderId>(
  (value) => typeof value === "string" && isProviderId(value),
  "Unknown provider",
);

// The principal is the signed HttpOnly cookie, never an argument from the browser.
export const getLinkStatus = createServerFn({ method: "GET" }).handler(() =>
  accountLinks().status(currentPrincipal()),
);

export const linkApiKey = createServerFn({ method: "POST" })
  .validator(z.object({ providerId, apiKey: z.string().min(1).max(1024) }))
  .handler(({ data }) =>
    accountLinks().linkApiKey(currentPrincipal(), data.providerId, data.apiKey),
  );

/** Starts OpenRouter's official BYOAI PKCE flow; the browser is sent to the authorizationUrl. */
export const startOAuth = createServerFn({ method: "POST" })
  .validator(z.object({ providerId }))
  .handler(({ data }) => accountLinks().startOAuth(currentPrincipal(), data.providerId));

/** Marks a validated connection as the active one for this browser. */
export const activateProvider = createServerFn({ method: "POST" })
  .validator(z.object({ providerId }))
  .handler(({ data }) => accountLinks().activate(currentPrincipal(), data.providerId));

export const chooseModel = createServerFn({ method: "POST" })
  .validator(
    z.object({
      providerId,
      model: z.string().min(1).max(200),
      // Set by a screen whose next prompt carries a picture, so a text-only model is refused here.
      needsVision: z.boolean().optional(),
    }),
  )
  .handler(({ data }) =>
    accountLinks().chooseModel(
      currentPrincipal(),
      data.providerId,
      data.model,
      data.needsVision ?? false,
    ),
  );

export const unlinkAccount = createServerFn({ method: "POST" })
  .validator(z.object({ providerId }))
  .handler(({ data }) => accountLinks().unlink(currentPrincipal(), data.providerId));
