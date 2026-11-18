// Server-side OAuth callback. The provider redirects the browser here after the user authorizes.
// State and PKCE are verified against the one-time flow MOTIF stored (connection-vault), keyed to
// the same signed HttpOnly principal that started the flow; the flow is consumed here, so a
// replayed callback is rejected. The minted credential is validated before use and never logged,
// returned to the browser, or written to the database.

import { createFileRoute } from "@tanstack/react-router";

import { accountLinks } from "@/lib/account-link.server";
import { existingPrincipal } from "@/lib/principal.server";

function redirectTo(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

export const Route = createFileRoute("/api/auth/$provider/callback")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const provider = params.provider;
        if (provider !== "openrouter") {
          return redirectTo("/?connection_error=unsupported");
        }
        const code = url.searchParams.has("error") ? null : url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!state) {
          return redirectTo("/?connection_error=invalid_state");
        }
        let principal: string | null;
        try {
          principal = existingPrincipal();
        } catch {
          return redirectTo("/?connection_error=session");
        }
        if (!principal) return redirectTo("/?connection_error=session");
        const result = await accountLinks().completeOpenRouterOAuth(principal, code, state);
        return result.ok
          ? redirectTo("/?connected=openrouter")
          : redirectTo(`/?connection_error=${encodeURIComponent(result.error)}`);
      },
    },
  },
});
