---
lede: Every setting on App Settings → General — what it starts at and what it changes — and where the other sections are.
---
# App Settings

**App Settings** in the sidebar holds the app's own settings. **General** is this app's; the other sections
are the family's: **Appearance** (light or dark, the accent colour, the language), **Backups** (see
[Getting started](getting-started.md#backups)), **Storage** (where your data lives), **Server** (running
without a window), **Logs**, **Updates** and **About**. The AI's own settings — engines, models and which
model each feature uses — are on **AI Settings** ([Set up the AI](ai-providers.md)).

Each group on **General** has its own **Save**. A change applies to work started after it: a clip being made
keeps the settings it started with.

## Films

| Setting | Starts at | What it changes |
|---|---|---|
| **Width (pixels)** · **Height (pixels)** | 1280 × 704 | A new wide film's size; its tall and square shapes follow. Every first frame and clip is made at the film's size. Both sides are steps of 64. 1280 × 704 is the clip model's one-pass size on an 8 GB card. |

## Card pictures

| Setting | Starts at | What it changes |
|---|---|---|
| **Long side (pixels)** | 1024 | The long side a card's picture is painted at. |
| **Largest picture file (MB)** | 20 | The largest file a card takes as its picture. |

## Planning

| Setting | Starts at | What it changes |
|---|---|---|
| **Most shots in a plan** | 24 | The most shots **Plan the shots** may make. |
| **Room for each answer (tokens)** | 12000 | How much the planner may write for each answer, its thinking included: more lets a long story finish, less is quicker. |
| **Words spoken a second** | 2.5 | How fast a line is spoken: a shot with a line runs at least as long as it takes to say it. |

## First frames

| Setting | Starts at | What it changes |
|---|---|---|
| **Frames a shot gets** | 3 | How many first frames are painted for a shot each time. |
| **Card pictures with each** | 3 | How many of the shot's cards' pictures go with them — who speaks first, then the other characters, the place, the props. |
| **Pixels in each card picture** | 262144 | How small those pictures are made: smaller is faster and looks as good. |
| **Check them and keep the best** | on | Whether a vision model looks at each frame and puts the best one in the film. Off: the first one is used. |

## Clips

| Setting | Starts at | What it changes |
|---|---|---|
| **Frames a second** | 24 | The clips' frame rate — every clip tested was made at 24. |
| **Largest guide video (MB)** | 200 | The largest guide video a shot takes. |
| **Offer lip repair on talking clips** | off | Whether a talking clip shows **Repair lips** ([Your films](films.md#clips)). Its face models are for non-commercial research only: a film made with a repaired clip can't be sold. |
| **Lip repair steps** · **Lip repair guidance** | 20 · 1.5 | Lip repair's own settings, as its makers ship them. |

## Voices

| Setting | Starts at | What it changes |
|---|---|---|
| **Voice model** | qwen3-vd-1.7b-q8 | The model that makes a voice from words and speaks the lines. |
| **Language the lines are in** | English | The language the lines are spoken in. |
| **Default voice** | "A natural, clear adult voice, calm and unhurried." | The voice of a speaker whose card has no voice written. |
| **Model a recorded voice is cloned with** | qwen3-base-1.7b-q8 | The model that speaks a character's lines in the voice of the recording on their card. |
| **Seconds of a recording used** · **Largest recording file (MB)** | 20 · 50 | How much of a recording is used, and the largest file taken. |

## Music and sound effects

| Setting | Starts at | What it changes |
|---|---|---|
| **Music length (s)** · **Sound effect length (s)** | 30 · 6 | How long a new piece is when you don't say. |
| **Steps** | 8 | The steps each is made in: more take longer (8 is what was tested). |
| **New music fades out over (s)** | 2 | The fade out new music gets, so it never stops dead. Each sound's own fades are on the Cut tab. |

## The words pictures are painted from

The words each kind of card's picture is painted from, and a shot's first frame and clip. In them, **{name}**
is the card's name, **{description}** its description and **{look}** the film's look; a first frame also takes
**{size}** (its framing), **{action}** (what happens) and **{cards}** (each of its cards' looks), and a clip
those and **{camera}** (the camera's move) and **{line}** (who says what). For example, a character's picture
starts from "A full-length photograph of {name}: {description}. Standing, facing the camera…" — the whole
body on plain grey, which is what the first frames take as the character's reference.

## Other windows

| Setting | Starts at | What it changes |
|---|---|---|
| **Look for other windows' changes every (seconds)** | 3 | The app open in more than one place at once — the desktop app, a browser on this server, a phone: how often each one looks for what the others changed. |

## An example

The first frames take long on your card, and the vision check keeps choosing well. Under **First frames** set
**Frames a shot gets** to 2 and press the group's **Save**: each shot now paints two first frames instead of
three, and the check still keeps the better one. (A film for a phone needs no setting: choose **Tall** in
**New film** — 704 × 1280 from the wide size above.)
