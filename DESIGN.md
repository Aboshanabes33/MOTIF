# MOTIF Mobile, Liquid Glass Design Spec

Design 10 of the MOTIF concept set: a mobile companion app in Apple's Liquid Glass style, over a deep teal landscape. This spec is the source of truth for rebuilding the screens faithfully.

## 1. Foundations

### Canvas

- App column max width 430px, centered, full height (min 780px). On screens wider than 430px the app sits centered on a dark band (#0b2426), like a phone on a desk.
- Background, painted in this order:
  1. Radial glow: `radial-gradient(120% 60% at 80% -10%, rgba(126,200,186,0.35), transparent 55%)` (soft light from top right).
  2. Vertical gradient: `#2f7268` (0%) to `#21574f` (34%) to `#16403c` (62%) to `#0c2729` (100%).
  3. Mountain silhouettes, absolute bottom, height about 46% of the panel, three layers back to front:
     - `#12403c` at 70% opacity
     - `#0d302e` at 90% opacity
     - `#082321` at 100%
     Drawn as soft peaked paths, wider than tall, overlapping. They are decoration behind content, never above it.

### Color tokens

| Token | Value | Use |
| --- | --- | --- |
| Text primary | `#eef5f3` | Titles, card titles, active controls |
| Text secondary | `rgba(238,245,243,0.75)` | Subtitles |
| Text tertiary | `rgba(238,245,243,0.68)` | Card detail lines |
| Text inactive | `rgba(238,245,243,0.55)` | Inactive tab icons |
| Text faint | `rgba(238,245,243,0.45)` | The honesty caption |
| Content card | `rgba(7,24,25,0.66)` | Video, brand, note cards |
| Content card deep | `rgba(5,18,19,0.78)` | Brief card |
| Card border | `rgba(255,255,255,0.07)` | 1px edge on content cards |
| Accent mint | `#9fd8cd` | Progress bar fill |
| Recording red | `rgba(237,49,62,0.5)` to `rgba(237,49,62,0.25)` | Active record button tint |
| Brand swatches | `#e9a23b` amber, `#5fa8a0` teal, `#987fa0` mauve, `#5c76ad` blue | Brand identity blocks |

### Type

- Display: a high-contrast serif (Aime 400 in the reference; a Didone-style serif such as Playfair Display works). 44px, line height 1.05, letter spacing -0.02em. Screen titles only ("Today", "Brands", "Voice note", "Search").
- Body: a neutral grotesk (KMR Melange Grotesk in the reference; Inter or system sans works). 350 to 600 weight.
  - Card title 17px / 600
  - Screen subtitle 15px, card detail 14px
  - Controls 15px / 500, chips 14px / 600
  - Clip names 13px, honesty caption 11px

## 2. Liquid Glass rules

Glass appears on controls only: the segmented control, tab bar, + button, reply chip, search field, record button, action sheet. Never on content.

The recipe, one material everywhere:

```
background: linear-gradient(160deg,
  rgba(255,255,255,0.20) 0%,
  rgba(255,255,255,0.08) 45%,
  rgba(255,255,255,0.04) 100%);
backdrop-filter: blur(22px) saturate(1.5);
border: 1px solid rgba(255,255,255,0.32);
box-shadow:
  inset 0 1px 0 rgba(255,255,255,0.5),    /* specular top edge */
  inset 0 -1px 0 rgba(255,255,255,0.10),
  0 14px 34px rgba(2,18,18,0.35);
```

Rules:

1. Glass only where the user acts. Content under the glass stays solid and readable.
2. Never glass on glass. Inside a glass surface, nested rows and buttons use plain fills (`rgba(255,255,255,0.14)`), not a second glass treatment.
3. The glass picks up the color behind it; keep the backdrop colorful under controls.
4. One material. Do not mix frost levels, tints or border brightnesses across controls.
5. Rounded: pills are fully rounded (999px), the action sheet 30px, the + button a circle.

## 3. Components

### Status bar (decorative)
Real device time left (14px / 600), three dot signal dots plus "5G" right. Padding 18px 26px 4px.

### Header
Screen title (display serif 44px) with a one-line subtitle below (15px secondary). Padding 18px 26px 14px. Subtitle states real status, for example "One render running on your PC" or "Nothing rendering on your PC".

### Segmented control
Glass pill, margin 6px 22px 14px, padding 4px, three equal segments (Videos / Brands / Footage), each min height 44px. Active segment: `rgba(255,255,255,0.28)` fill, inset top highlight, small drop shadow, white text. Inactive: transparent, 85% white text.

### Video card (content)
Solid card (`rgba(7,24,25,0.66)`, border `rgba(255,255,255,0.07)`, radius 26px, padding 12px 16px 12px 12px). Row: 76x64 thumbnail (radius 18px), then title 17px/600 and detail line "Brand - status". A rendering card also shows a 4px progress track (`rgba(255,255,255,0.14)` track, `#9fd8cd` fill, width animates with 1.6s ease). Thumbnails are small landscape illustrations (sunset dusk, desert, mist), layered mountain silhouettes over a sky gradient with a sun disc.

### Brief card
Deeper solid card (`rgba(5,18,19,0.78)`). Title plus one line of copy, and a glass chip button ("Reply", radius 999px, min height 40px, 14px/600) that jumps to the Record screen.

### Brand card
Solid card holding a full-width row button: 44px color swatch (radius 14px, inset top highlight), name and detail, and a + / - affordance at the trailing edge. Expanded state reveals voice, colors and latest video as small lines (13.5px), indented 66px.

### Footage grid
Two columns, 12px gap. Each clip: thumbnail 110px tall (radius 20px), duration pill top right (12px/600 on `rgba(5,18,19,0.72)`), name below (13px).

### Tab bar and + button
Bottom row, padding 0 20px 22px, 12px gap.
- Tab bar: glass pill, padding 5px, four equal icon buttons (grid = Today, tag = Brands, mic = Record, search), min height 52px, icons 23px stroke 1.7. Active tab: `rgba(255,255,255,0.26)` fill, inset top highlight, white icon. Inactive: 55% white.
- + button: separate glass circle 62px, white plus icon 26px stroke 2. Opens the action sheet.

### Action sheet
Scrim `rgba(4,14,15,0.45)` over the app panel; sheet is a glass panel (radius 30px) pinned to the bottom, margin 0 14px 18px. Title line (14px/600, secondary), then full-width option buttons (min height 50px, radius 18px, `rgba(255,255,255,0.14)` fill, 16px/500, left aligned) and a plain Cancel. Tap scrim or Cancel to close.

### Record screen
Centered glass circle 108px with mic icon 40px. Recording state: red gradient tint (`rgba(237,49,62,0.5)` to 0.25), brighter border, label under it reads "Recording 0:07 - tap to stop". Idle label: "Tap to start a voice note". Stopping adds a voice-note card (solid card, title "Voice note 0:07", detail naming its destination).

### Search screen
Glass pill search field (margin 4px 22px 14px, min height 48px, search icon 20px at 80% opacity, input 15px white, placeholder 60% white). Results reuse the video, brand and clip cards. Empty state: one line, "Nothing matches '<query>'." (14px, 70% white).

### Honesty caption
Centered 11px faint line above the tab bar: "Concept mockup with sample content." (Drop this in the real app; keep it in any mockup.)

## 4. Layout

- Page gutters: 22px for content, 26px for header and status bar, 20px for the tab bar row.
- Vertical rhythm: 12px between cards, 14px after the segmented control and search field.
- Every interactive target is at least 44px tall.
- Spacing and radii summary: cards 26px, thumbnails 18px, swatches 14px, pills and tab bar 999px, sheet 30px, sheet buttons 18px, clips 20px.

## 5. Motion and states

- Control transitions: 0.18s ease on background, color, box shadow.
- Press feedback: scale to 0.93 to 0.98 depending on control size.
- Progress bars animate width over 1.6s ease; live values tick upward until done, then the status flips to "ready to review".
- A freshly added card carries a 1px `rgba(255,255,255,0.35)` outline so the user sees where it landed.
- Empty search shows a sentence, never a blank area.

## 6. Do and don't

Do:
- Keep glass on controls only, over the colorful backdrop.
- Keep content cards solid, dark and quiet so the glass controls stand out.
- Let every control do something real, even in a mockup (switch, filter, add, record a timer).
- Keep one accent (mint) for progress and nothing else.
- Write status text that reflects actual state.

Don't:
- Don't stack glass surfaces inside each other.
- Don't add borders, glows or gradients to content cards beyond the spec.
- Don't use bright accent colors for decoration; the palette is teal, white and one mint.
- Don't show fake progress, fake counts or buttons that do nothing.
- Don't shrink text below 11px or touch targets below 44px.
