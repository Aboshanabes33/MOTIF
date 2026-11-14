import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { LINK_PROVIDERS, type LinkProviderId } from "./account-link";
import { accountLinks } from "./account-link.server";

// The token is only ever looked up, so an unknown one just means "nothing linked".
const token = z.string().max(128).nullable();
const providerId = z.custom<LinkProviderId>(
  (value) => LINK_PROVIDERS.some((provider) => provider.id === value),
  "Unknown provider",
);
// The default is the device code: the only way in that works when the browser and the server are
// on different machines. A local build asks for the other one explicitly.
const signInKind = z.enum(["device_code", "browser"]).default("device_code");

export const getLinkStatus = createServerFn({ method: "POST" })
  .validator(z.object({ token }))
  .handler(({ data }) => accountLinks().status(data.token));

export const linkApiKey = createServerFn({ method: "POST" })
  .validator(z.object({ token, providerId, apiKey: z.string().max(1024) }))
  .handler(({ data }) => accountLinks().linkApiKey(data.token, data.providerId, data.apiKey));

export const startSignIn = createServerFn({ method: "POST" })
  .validator(z.object({ token, providerId, kind: signInKind.optional() }))
  .handler(({ data }) =>
    accountLinks().startSignIn(data.token, data.providerId, data.kind ?? "device_code"),
  );

export const answerSignIn = createServerFn({ method: "POST" })
  .validator(z.object({ token, promptId: z.string().max(64), value: z.string().max(8192) }))
  .handler(({ data }) => accountLinks().answerSignIn(data.token, data.promptId, data.value));

export const cancelSignIn = createServerFn({ method: "POST" })
  .validator(z.object({ token }))
  .handler(({ data }) => accountLinks().cancelSignIn(data.token));

export const chooseModel = createServerFn({ method: "POST" })
  .validator(
    z.object({
      token,
      model: z.string().max(200),
      // Set by a screen whose next prompt carries a picture, so a text-only model is refused here.
      needsVision: z.boolean().optional(),
    }),
  )
  .handler(({ data }) =>
    accountLinks().chooseModel(data.token, data.model, data.needsVision ?? false),
  );

export const unlinkAccount = createServerFn({ method: "POST" })
  .validator(z.object({ token }))
  .handler(({ data }) => accountLinks().unlink(data.token));
