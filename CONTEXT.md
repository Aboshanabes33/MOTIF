# Motif

An agent-driven video editor for agencies and social media managers who run several client brands. The user uploads a video and describes the edit in text; the agent cuts it and adds motion graphics in the style of the chosen brand.

## Language

**Brand**:
A saved visual identity (colors, fonts, logo, motion style, caption templates) that the agent applies to every edit made under it. A user can hold many Brands.
_Avoid_: Profile, Design, Account, Client

**Reference Video**:
Any video whose design the user likes, uploaded so the agent can extract its references, typography, and motion style into a Brand.
_Avoid_: Inspiration, template, sample

**Style**:
A reusable editing approach (for example fast short-form, cinematic, corporate) that decides pacing, cuts, and motion character. It is independent of any Brand, so any Style can be applied under any Brand.
_Avoid_: Template, preset, theme

**Source Video**:
The video file the user uploads to be edited.
_Avoid_: Input, raw footage, clip

**Edit Request**:
A text instruction describing what to do to a Source Video, for example "add motion graphics" or "cut this down".
_Avoid_: Prompt, command, task

**Result**:
The finished edited video produced from a Source Video and an Edit Request under a Brand.
_Avoid_: Output, export, render
