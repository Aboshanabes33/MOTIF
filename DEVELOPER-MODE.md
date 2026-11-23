# MOTIF and Developer Mode

One app shell owns both experiences. The switch writes configForms.developerTools, the existing Host-backed ui-settings.enabled preference. That preference already gates Harness developer tools. When enabled, MotifHomeFrame returns its downstream children, restoring the actual upstream hero instead of a duplicate shell. Active conversations always return their existing children, regardless of mode. No sessions, workspaces, Brands, routes, histories or provider state are copied, recreated or cleared. Back and deep links remain with the existing shell router.

The MOTIF web-app composition defaults this preference off. Existing saved Host preferences override that default. The Settings section is always registered, so the same switch returns to MOTIF. The existing General developer-tools switch remains an equivalent route.

Preference scope is the existing Host settings document, shared by authenticated browser connections to that Host, not a new localStorage identity. Before the settings mirror is ready, the preference fails closed. Per-account mode scope must follow the account-isolation work in #50; this change does not invent an unauthenticated account system. Verify on desktop compositions separately if they do not inherit web-app's patch. Labels added by this change are currently English.
