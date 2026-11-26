# MOTIF MVP

Build a simple, clean MVP web app called MOTIF, only to test whether there is demand. Nothing else beyond what is listed.

Product: an AI-assisted video workspace. The user saves Brands (name, colors via color picker, logo from an SVG icon library). Clicking a Brand opens a normal chat page, similar to the Claude or Codex desktop apps: a centered "Let's build" home, a left sidebar with Brands and their chat threads, and a large "Ask anything" composer at the bottom. The user describes the video they want and the chat replies with a plan and a result preview.

AI: use the built-in AI/model capabilities of this platform for the chat. Do not ask me for an AI API key and do not build a separate AI backend.

Design: dark, calm, polished glass look. No placeholder or generic AI-looking design.

Payments (Whop): two plans, Monthly and Yearly, each with a 14-day free trial (the trial is configured on Whop, not in the app). Add an admin-only settings page with two fields, WHOP_CHECKOUT_URL_MONTHLY and WHOP_CHECKOUT_URL_YEARLY, where I paste my Whop checkout links. The pricing page shows both plans with a "Start 14-day free trial" button that opens the matching checkout link.

Redirect: create a public route /activate that accepts ?plan=monthly or ?plan=yearly (example: https://mydomain.com/activate?plan=monthly). It shows a welcome message, marks the plan chosen on that browser session, and takes the user into the app. Show me both exact full URLs in the settings page so I can copy each one into Whop as the post-purchase redirect for its plan.

Add a "Manage or cancel subscription" link to https://whop.com/@me/orders. Do not build your own payment system and do not verify payments in this MVP.

Out of scope: accounts beyond simple email login, desktop app (an Electron wrapper comes later), video rendering, anything not listed above.

Deliver: a deployable web app, a short README of the environment variables I must set, and no fake data presented as real.
