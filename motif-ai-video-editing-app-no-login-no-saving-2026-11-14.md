# Motif — AI video editing app (no login, no saving)

Turn the 4 screenshots into a working app that looks the same: dark three-column layout (sidebar, chat, style panel), Motif logo, yellow/red/blue accents. Everything lives in memory and resets on refresh.

## Screens
1. **New session** (`/`) — "What should we edit?" with the 3 suggestion chips, composer with style picker and attach button.
2. **Session chat** (`/session/$id`) — your message with file + style chips, "Thought for a while", AI reply with numbered steps, and a result card (thumbnail, mini timeline, Download / Revise).
3. **Style Library** (`/styles`) — 4 ways to add a style (reference video, .md style file, manual, website URL) and "Your styles" cards with "Use in new session".
4. **Editor** (`/session/$id/edit`) — video preview, playback controls, multi-track timeline (captions, overlay, video clips, voice, music), selected clip details and captions list on the right.

## What actually works
- Starter data: 3 styles (Energetic Challenge, My Brand, Clean Explainer) and 3 sessions, as in the designs.
- Create sessions, switch between them, pick the active style from the composer or sidebar; the right panel shows its colors, fonts, logo and motion rules.
- Add a new style: manual form (colors, fonts, logo upload), upload a .md file, or paste a website URL — the AI reads it and fills in colors, fonts and motion rules automatically.
- Chat with real AI: every message is sent with the active style attached, so you never repeat your reference. The AI answers with a styled edit plan (style applied, brand layer, pacing, captions) and a result card.
- Attached footage shows as a chip; the "rendered video" and timeline are sample previews generated from the plan (no real video rendering — same as your design's note).
- Editor: click clips to select, play/scrub the playhead, zoom the timeline, Split button, captions list.

## Technical details
- TanStack routes as above; state in a React context store (no database, no auth).
- AI runs only on the server (OpenAI API) via server functions: `chat` (streams reply + returns structured edit plan JSON) and `extractStyle` (from .md text or fetched website HTML).
- Design tokens in styles.css (dark theme, Inter for UI, Anton for display), shadcn components, react-markdown for replies.
