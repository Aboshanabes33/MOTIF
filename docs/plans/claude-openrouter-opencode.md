# Claude, OpenRouter and OpenCode: connecting, checking keys, and seeing

The owner asked for Claude, OpenRouter and OpenAI to be usable through the Anthropic SDK, each
connectable **by account or by API key**; for keys to be **checked before they are kept**, with the
**model list shown only after** a key passes; for OpenRouter to **support free models**; and for the
app to **know whether the chosen model can see** — some free models take text only. OpenCode is in
the same scope.

This note records what was built and why, and the one part still open.

## Connecting: account where the provider allows it, a key where it doesn't

| Provider               | How it connects                       | Why                                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI (ChatGPT plan)  | One-time code, approved on openai.com | An official device flow exists, so it is the only way in.                                                                                                                                                                           |
| OpenAI (platform)      | API key                               | No consumer sign-in exists for a bare platform account.                                                                                                                                                                             |
| Claude                 | API key only                          | Anthropic's terms bar third-party apps from offering Claude.ai login: Free/Pro/Max OAuth "in any other product, tool, or service — including the Agent SDK" is not permitted. Keys, Bedrock and Vertex remain the sanctioned paths. |
| OpenRouter             | API key                               | Its sign-in is an OAuth flow that issues a normal user key; the key form covers it today.                                                                                                                                           |
| OpenCode / OpenCode Go | API key (`oc_sk_…`)                   | The Console issues keys.                                                                                                                                                                                                            |

Claude is the one place the "account _or_ key" shape cannot be honoured, and the pop-up says so
rather than hiding the reason: _"Claude plans can't sign in to other apps. Anthropic asks for an API
key instead."_ A button that opened a Claude.ai consent screen would work today and stop working
the moment Anthropic enforces its own rule, so it is not offered.

Everything still runs through `src/lib/pi.server.ts` — the only file allowed to import the Pi SDK —
so Claude's models are reached with the Anthropic SDK the Pi SDK already uses, not a second client.

## A key is checked before it is kept

`ProviderRuntime.checkApiKey(providerId, apiKey)` asks the provider directly:

| Provider    | Check                                                                                                                |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| Claude      | `GET https://api.anthropic.com/v1/models?limit=100`, key in `x-api-key`, `anthropic-version: 2023-06-01` (no bearer) |
| OpenAI      | `GET https://api.openai.com/v1/models`, bearer; non-chat ids (embeddings, whisper, tts, dall-e, moderation) dropped  |
| OpenRouter  | `GET https://openrouter.ai/api/v1/key`, bearer; then the public `GET /api/v1/models` for the catalogue               |
| OpenCode    | `GET https://opencode.ai/inference/v1/models`, bearer                                                                |
| OpenCode Go | `GET https://opencode.ai/inference/go/v1/models`, bearer                                                             |

`checkAuth()` could not be used: it reports _which_ credential would be used, not whether the
provider accepts it.

The outcome is one of four, each with its own wording, so a typo is never reported as an outage:

- **rejected** — "…didn't accept that key. Check it and paste it again."
- **unreachable** — "Motif's server couldn't reach … to check the key. Try again in a moment."
- **failed** — "Motif couldn't check that key just now. Try again in a moment."
- **shape** — "That doesn't look like an API key. Paste it exactly as your provider shows it."

A refused key is never stored, and never displaces an account that already works: the check runs
first, against nothing but the candidate key. A malformed string is caught before any request.

The model list in the pop-up is the list the provider returned **for that key**, so a key that can
only reach part of a catalogue shows only that part, and nothing is offered before a key passes.

## Free models, and what they cost you

OpenRouter's `:free` models cost nothing per token and are limited by request count: 20 a minute
always, and 50 a day until the account has bought $10 of credit in total, then 1,000 a day. The
pop-up states this next to the field, before the key is pasted.

`GET /api/v1/key` also reports `free_model_daily_requests.remaining`, which is the number someone
on the free tier actually runs into. It is carried back as a note on a successful link and shown in
the pop-up: _"Free models: 43 requests left today."_ When the field is missing the note is simply
absent.

Free models are marked in the model list (`Free · images`, `Free · text only`) so the choice is
made with the price visible.

## Knowing whether a model can see

Every model carries its input modalities. `ModelRuntime.getAvailable(providerId)` returns full
model records, `input` among them, so no second lookup is needed.

- A model is marked `free` when its id ends in `:free`, or when both prices are zero.
- `acceptsImages(model)` reads `input` for `image`.
- `modelNote(model)` turns the two into the short text beside the model.

The check happens in two places, because either can be reached first:

1. **On choosing** — `chooseModel(token, model, needsVision)` refuses a text-only model when the
   caller says the prompt carries a picture: _"LFM2.5 (free) works on text only. Choose a model
   that accepts images, or send the prompt without one."_ The previous model stays selected.
2. **On sending** — `complete(token, prompt, images)` refuses the same pairing before the request
   leaves, with the failure `no_vision`. A provider's own 400 explains this far worse, and a
   caller may have swapped the model without picking it again.

Neither gate is guessed: both read the same catalogue data the picker shows. In the current
catalogue, 317 of OpenRouter's 439 chat models accept images and 73 of OpenCode's 87 do, so the
gate has real work to do on both.

## Tests

100 pass. The ones that cover this note:

- the key is checked before it is stored; the trace of the check never becomes a credential
- a rejected key stores nothing; an unreachable provider is not blamed on the key
- a refused key leaves an existing account on the provider untouched
- Anthropic is asked with its own header and no bearer token
- OpenRouter's free flag and input modalities are read correctly from a sample catalogue
- OpenAI's non-chat models are left out
- OpenCode and OpenCode Go are asked at their own gateway paths
- a text-only model is refused for an image prompt when choosing, and allowed for a text prompt
- a picture is refused before the request when the model cannot see
- Claude's missing sign-in button comes with its reason; OpenRouter's limits are shown
- the remaining free allowance is carried back and shown

## Still open

**OpenRouter one-click sign-in.** OpenRouter has a PKCE flow that redirects to a hosted
`callback_url` and hands back a permanent user key from `/api/v1/auth/keys`. That would let
OpenRouter connect with a button and no pasted key, with no callback URL for the user to configure
— the same shape as the ChatGPT one-time code. It is not built. Until it is, OpenRouter connects
with a key, which is checked and stored the same way.

That flow was not verified end to end against a live account, and OpenRouter's terms do not settle
whether a third-party app should present its own sign-in. It stays out until someone can answer
that, rather than shipping a button that could be withdrawn.
