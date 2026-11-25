# Prompt: Build the MOTIF mobile app in the Liquid Glass design

You are a coding agent building the real MOTIF mobile companion app. MOTIF is a desktop app (Electron) that turns raw footage into branded short videos with AI; this mobile app is its companion: see what is rendering on the PC, manage brands, reply to briefs by voice note, and search the library.

The visual design is fixed. The attached DESIGN.md is the source of truth: follow its tokens, colors, type scale, glass recipe, components, layout, motion and do/don't rules exactly. Key points:

- Apple Liquid Glass style: glass (blurred, specular-edged material) only on controls the user touches: segmented control, tab bar, + button, chips, search field, action sheet. Content cards stay solid and dark. Never glass on glass.
- Background: deep teal vertical gradient with a soft top-right glow and layered mountain silhouettes at the bottom.
- Serif display titles (44px), neutral grotesk body, one mint accent (#9fd8cd) for progress only.
- App column max 430px centered, 22px content gutters, cards 26px radius, touch targets 44px minimum.

Build these four screens behind the tab bar, plus the segmented control on the Today screen:

1. Today: header with live render status, segmented control (Videos / Brands / Footage), video cards with progress for rendering items, a brief card with a Reply chip that opens Record, and a footage grid.
2. Brands: brand cards (color swatch, name, stats) that expand to show voice, colors and latest video.
3. Record: a large glass mic button that records a real voice note, shows elapsed time while recording, and saves the note to the current brief.
4. Search: one field that filters videos, brands and footage live, with a written empty state.
Plus: the + button opens a bottom action sheet (New video / New brand / Upload footage) wired to the app's real creation flows.

Hard rules:

1. No fake data. Every number, name, status and progress value comes from real app state or a real API. Where data is missing, show an honest empty state ("No brands yet", "Nothing rendering on your PC"). Never invent sample videos, brands or counts to fill space, except clearly labeled placeholder content during development that is removed before delivery.
2. No claims of working features. Every visible control must do what it says. If a feature is not implemented yet, hide the control or mark it clearly as unavailable. A button that does nothing is a bug, not a placeholder. Do not render fake progress bars, fake recording timers or dead toggles.
3. Status text must reflect real state at render time, including zero states.
4. Keep the DESIGN.md do/don't list. In particular: no decorative bright accents, no extra borders or glows on content cards, no text under 11px.

Tech: target the app's existing stack (React). Keep components small and driven by one data array per list, so filters and sorts keep item identity. Prefer system fonts that match the spec if bundling fonts is out of scope, and say so in your report.

Deliver: the four screens navigable through the tab bar, the action sheet, and a short report of what is wired to real data versus still empty.
