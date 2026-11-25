# MOTIF Desktop, Liquid Glass Design Spec

The MOTIF desktop app (Windows, Electron) in Apple's Liquid Glass style, over a deep teal landscape. This spec is the source of truth for rebuilding the screens faithfully. It is the desktop edition of the design: same material, palette and type as the mobile concept, recomposed for a window with a sidebar, pointer and keyboard.

## 1. Foundations

### Window

- The app is one frameless-style window with a custom title bar: MOTIF wordmark left (display serif, 15px, letter spacing 0.14em), a drag region in the middle, and Windows-style window controls right (minimize, maximize, close; each 46px wide, full bar height 44px). Hover: controls get `rgba(255,255,255,0.10)`; close gets `#e81123` with a white glyph, matching Windows.
- App surface max width 1440px, min height about 860px, full window background.

### Canvas

- Background, painted in this order:
  1. Radial glow: `radial-gradient(90% 55% at 85% -10%, rgba(126,200,186,0.32), transparent 55%)` (soft light from top right).
  2. Vertical gradient: `#2f7268` (0%) to `#21574f` (34%) to `#16403c` (62%) to `#0c2729` (100%).
  3. Mountain silhouettes anchored to the bottom, about 42% of the window height, three layers back to front with broad, irregular peaks:
     - `#12403c` at 70% opacity
     - `#0d302e` at 90% opacity
     - `#082321` at 100%
     Decoration behind content, never above it. Peaks are wide and organic; never a repeating zigzag pattern.

### Color tokens

| Token | Value | Use |
| --- | --- | --- |
| Text primary | `#eef5f3` | Titles, card titles, active controls |
| Text secondary | `rgba(238,245,243,0.75)` | Subtitles |
| Text tertiary | `rgba(238,245,243,0.68)` | Card detail lines |
| Text inactive | `rgba(238,245,243,0.55)` to `0.72` | Inactive nav items |
| Text faint | `rgba(238,245,243,0.45)` to `0.5` | Status bar, kbd hints |
| Content card | `rgba(7,24,25,0.66)` | Video, brand, note cards |
| Content panel deep | `rgba(5,18,19,0.78)` | Inspector, brief |
| Card border | `rgba(255,255,255,0.07)` | 1px edge on content cards |
| Accent mint | `#9fd8cd` | Progress bar fill, connected-status dot |
| Recording red | `rgba(237,49,62,0.5)` to `0.25` | Active record button |
| Close hover red | `#e81123` | Window close button hover only |
| Brand swatches | `#e9a23b`, `#5fa8a0`, `#987fa0`, `#5c76ad` | Brand identity blocks |

### Type

- Display: a high-contrast serif (Aime 400 in the reference; Playfair Display works). Window title 44px, line height 1.05, letter spacing -0.02em. View titles only ("Today", "Brands", "Voice note", "Search").
- Body: a neutral grotesk (KMR Melange Grotesk in the reference; Inter or system sans works).
  - Card title 16px / 600, card detail 13.5px
  - View subtitle 15px, nav items 15px / 500
  - Controls 14.5px / 500, chips 14px / 600
  - Inspector title 18px / 600, inspector body 13.5px
  - Status bar 11.5px, kbd hints 11px

## 2. Liquid Glass rules

Glass appears on controls only: the sidebar, segmented control, search field, New button, reply chip, record button and the New dialog. Never on content.

The recipe, one material everywhere:

```
background: linear-gradient(160deg,
  rgba(255,255,255,0.18) 0%,
  rgba(255,255,255,0.08) 45%,
  rgba(255,255,255,0.04) 100%);
backdrop-filter: blur(22px) saturate(1.5);
border: 1px solid rgba(255,255,255,0.30);
box-shadow:
  inset 0 1px 0 rgba(255,255,255,0.45),    /* specular top edge */
  inset 0 -1px 0 rgba(255,255,255,0.10),
  0 14px 34px rgba(2,18,18,0.35);
```

Rules:

1. Glass only where the user acts. Content (cards, inspector, list rows) stays solid and dark.
2. Never glass on glass. Inside a glass surface, nested rows use plain fills (`rgba(255,255,255,0.14)` hover and `rgba(255,255,255,0.24)` active), not a second glass treatment.
3. The glass picks up the color behind it; keep the backdrop colorful under controls.
4. One material. Do not mix frost levels, tints or border brightnesses across controls.
5. Corners: pills fully rounded (999px), sidebar 22px, dialog 24px, record button a circle.

## 3. Layout

```
+------------------------------------------------------+
| MOTIF                              _  []  X          |  title bar, 44px
+----------+-------------------------------------------+
| sidebar  |  header: title + subtitle | search | New  |
| (glass)  |  segmented control                       |
| 216px    |  content: feed (grid)  |  inspector 300px |
|          |                                           |
+----------+-------------------------------------------+
| status bar: honesty line | shortcut hints | clock    |
+------------------------------------------------------+
```

- Body padding 18px 22px, gap 18px between sidebar, feed and inspector.
- Sidebar: 216px, glass, radius 22px, padding 10px. Nav items 46px tall, radius 14px, icon 21px plus label plus a small kbd hint (1-4) at the trailing edge. Footer inside the sidebar: connection line ("PC connected") with an 8px mint dot, separated by a hairline.
- Header: title and subtitle left; actions right (search pill 260px wide, New pill). Header sits on the plain backdrop, not in a panel.
- Segmented control: glass pill 380px wide, padding 4px, segments 40px tall. Active segment `rgba(255,255,255,0.28)` with inset highlight.
- Feed: grid `repeat(auto-fill, minmax(300px, 1fr))`, 12px gap. Footage uses `minmax(190px, 1fr)` tiles 120px tall.
- Inspector: solid deep panel 300px, radius 20px, padding 18px 20px. Sections with small uppercase labels (12px / 600, letter spacing 0.08em), a hairline rule between sections.
- Status bar: full-width strip, hairline top border, `rgba(5,16,17,0.55)` fill, 11.5px faint text. Left: the honesty line in mockups. Right: keyboard hints and the real clock.

### Responsive behavior

The desktop window shrinks gracefully:
- Below 1080px: inspector 260px, search 200px.
- Below 900px: sidebar collapses to a 64px icon rail (labels and kbd hints hidden), inspector stacks under the feed.
- Below 640px: header stacks (title above, actions row below, search takes the remaining width), single-column feed, compact title 36px, status-bar hints hidden.

## 4. Pointer and keyboard states

Desktop means hover and focus are first-class:

- Hover on content cards: border brightens to `rgba(255,255,255,0.18)`, card lifts 1px, fill deepens slightly. 0.15s ease.
- Hover on nav items and dialog buttons: plain fill `rgba(255,255,255,0.10)` to `0.22`.
- Hover on the New and record buttons: the glass gradient brightens one step.
- Keyboard focus: a 2px `rgba(255,255,255,0.75)` outline with 2px offset on every focusable element, via `:focus-visible`. Never remove it without replacing it.
- Press feedback: scale 0.95 to 0.97 on buttons.
- Shortcuts: 1, 2, 3, 4 switch views (Today, Brands, Record, Search); `/` opens Search and focuses the field; Escape closes the dialog and blurs the field. Shortcuts never fire while typing in an input. Show the hints (kbd chips in the sidebar, status bar line, "( / )" in the search placeholder).

## 5. Components

### Title bar
As in section 3. The MOTIF wordmark uses the display serif; window controls are 12px stroke glyphs.

### Sidebar
Glass. Nav item active: `rgba(255,255,255,0.24)` fill, inset top highlight, white text and icon. Inactive: 72% white. The connection footer is honest sample text in mockups, real status in the app.

### Video card (content)
Solid card (radius 20px, padding 12px 16px 12px 12px). Row: 96x68 thumbnail (radius 14px), title, detail "Brand - status". Rendering cards show a 4px progress track (`rgba(255,255,255,0.14)` track, `#9fd8cd` fill, width animates 1.6s ease). Thumbnails are small layered-mountain illustrations (dusk, desert, mist).

### Brand row
A solid card that is also a button: 44px swatch (radius 13px), name, detail, + / - at the trailing edge. Selecting one shows its details in the inspector; the selected row keeps a brighter border.

### Footage tile
Thumbnail 120px tall (radius 16px), duration pill top right (12px / 600 on `rgba(5,18,19,0.72)`), name below (13px).

### Inspector
Solid deep panel. Brief section: title, one line of copy, glass Reply chip (radius 999px, min height 40px) that opens Record. Activity section: live lines like "Rendering Ramadan teaser - 72%" and "No voice notes yet", always derived from real state.

### Record view
Centered glass circle 120px with a 42px mic icon. Recording state: red gradient tint, brighter border, label "Recording 0:07 - click again to stop". Idle label "Click to start a voice note". Stopping adds a voice-note card listing its destination.

### Search
Glass pill in the header (always visible, every view). Focusing it switches to the Search view; results (videos, brands, footage cards) appear in the feed grid. Empty state: "Nothing matches '<query>'."

### New dialog
Centered glass panel (radius 24px, max width 380px) over a `rgba(4,14,15,0.45)` scrim. Title, then full-width option rows (radius 14px, `rgba(255,255,255,0.14)` fill, hover `0.22`), then a plain Cancel. Scrim click, Cancel or Escape closes. Each option runs the real creation flow.

### Status bar
Left: honesty line in mockups ("Concept mockup with sample content."), removed in the real app. Right: shortcut hints and the real clock.

## 6. Motion

- Control transitions 0.18s ease; card hover 0.15s ease.
- Progress bars animate width over 1.6s ease; live values tick until done, then the status flips to "ready to review" everywhere it appears (card and inspector agree).
- A freshly added card carries a 1px `rgba(255,255,255,0.35)` outline so the user sees where it landed.

## 7. Do and don't

Do:
- Keep glass on controls only, over the colorful backdrop; content solid.
- Give every control hover, active and `:focus-visible` states.
- Keep one accent (mint) for progress and connection status only.
- Derive every status line from real state, in the card and the inspector alike.
- Keep touch targets comfortable (44px minimum height on rows and buttons).

Don't:
- Don't stack glass surfaces inside each other.
- Don't add glows, gradients or bright borders to content cards.
- Don't use the Windows close red anywhere else.
- Don't show fake progress, fake counts or dead buttons; an unimplemented feature is hidden or marked unavailable.
- Don't let keyboard shortcuts fire while the user is typing in a field.
- Don't repeat the mountain silhouettes as a regular pattern.
