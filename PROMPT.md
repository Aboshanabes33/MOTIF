# Prompt: Build the MOTIF desktop app in the Liquid Glass design

You are a coding agent building the real MOTIF desktop app. MOTIF is a Windows Electron app that turns raw footage into branded short videos with AI, pairing with a local MCP server. This is the main desktop window, not a mobile app.

The visual design is fixed. The attached DESIGN.md (desktop edition) is the source of truth: follow its tokens, colors, type scale, glass recipe, components, layout, pointer and keyboard states, motion and do/don't rules exactly. Key points:

- Apple Liquid Glass style, recomposed for desktop: glass (blurred, specular-edged material) only on controls the user acts on: sidebar, segmented control, search field, New button, chips, record button, dialog. Content cards and the inspector stay solid and dark. Never glass on glass.
- Background: deep teal vertical gradient with a soft top-right glow and broad layered mountain silhouettes at the bottom, drawn as wide organic peaks, never a repeating zigzag.
- Custom Windows title bar: MOTIF wordmark, drag region, Windows-style minimize / maximize / close (close hovers #e81123), wired to the real Electron window controls.
- Serif display titles (44px), neutral grotesk body, one mint accent (#9fd8cd) for progress and connection status only.
- Desktop interactions are first-class: hover states on every card and button, a visible `:focus-visible` ring, and keyboard shortcuts (1-4 switch views, / focuses search, Escape closes dialogs) that never fire while typing.

Build these views behind the sidebar, plus the segmented control on Today:

1. Today: header with live render status, segmented control (Videos / Brands / Footage), a grid of video cards with live progress for rendering items, footage tiles, and a solid inspector panel with the current brief (Reply chip opens Record) and an activity section that always reflects real state.
2. Brands: brand rows that select into the inspector (voice, colors, latest video).
3. Record: a large glass mic button that records a real voice note, shows elapsed time, and saves the note to the current brief.
4. Search: the header field filters videos, brands and footage live, with a written empty state.
Plus: the New button opens a centered glass dialog (New video / New brand / Upload footage) wired to the app's real creation flows.

Hard rules:

1. No fake data. Every number, name, status and progress value comes from real app state (the Electron main process, the MCP bridge, the file system). Where data is missing, show an honest empty state ("Nothing rendering on your PC", "No voice notes yet"). Never invent sample videos, brands or counts to fill space, except clearly labeled placeholder content during development that is removed before delivery.
2. No claims of working features. Every visible control must do what it says. Window controls must actually minimize, maximize and close. If a feature is not implemented yet, hide the control or mark it clearly as unavailable. A button that does nothing is a bug, not a placeholder. Do not render fake progress bars, fake recording timers, fake connection status or dead toggles.
3. Status text must reflect real state at render time, including zero states, and every surface that shows the same fact must agree (card, subtitle and inspector are one source of truth).
4. Keep the DESIGN.md do/don't list. In particular: no decorative bright accents, the close-button red appears nowhere else, shortcuts never fire while typing.

Tech: the app's existing stack (Electron plus React). Keep components small and driven by one data array per list, so filters and selection keep item identity. Bridge to main through the existing preload API; if a needed bridge method does not exist, report it instead of faking the data. Prefer system fonts that match the spec if bundling fonts is out of scope, and say so in your report.

Deliver: the four views navigable through the sidebar and shortcuts, the New dialog, working window controls, and a short report of what is wired to real data versus still empty.
