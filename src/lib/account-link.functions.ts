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

export const getLinkStatus = createServerFn({ method: "POST" })
  .validator(z.object({ token }))
  .handler(({ data }) => accountLinks().status(data.token));

export const linkApiKey = createServerFn({ method: "POST" })
  .validator(z.object({ token, providerId, apiKey: z.string().max(1024) }))
  .handler(({ data }) => accountLinks().linkApiKey(data.token, data.providerId, data.apiKey));

export const startSignIn = createServerFn({ method: "POST" })
  .validator(z.object({ token, providerId }))
  .handler(({ data }) => accountLinks().startSignIn(data.token, data.providerId));

export const answerSignIn = createServerFn({ method: "POST" })
  .validator(z.object({ token, promptId: z.string().max(64), value: z.string().max(8192) }))
  .handler(({ data }) => accountLinks().answerSignIn(data.token, data.promptId, data.value));

export const cancelSignIn = createServerFn({ method: "POST" })
  .validator(z.object({ token }))
  .handler(({ data }) => accountLinks().cancelSignIn(data.token));

export const chooseModel = createServerFn({ method: "POST" })
  .validator(z.object({ token, model: z.string().max(200) }))
  .handler(({ data }) => accountLinks().chooseModel(data.token, data.model));

export const unlinkAccount = createServerFn({ method: "POST" })
  .validator(z.object({ token }))
  .handler(({ data }) => accountLinks().unlink(data.token));
