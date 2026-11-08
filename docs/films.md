---
lede: How a film is made — its story, its cards, its shots with their frames, clips and voices, and the cut that joins them.
---
# Your films

**Films** in the sidebar lists your films, the most recently changed first. **New film** asks for a
title, the words for its look and its shape:

- **Wide** (1280 × 704 by default) for a screen, **Tall** for a phone, or **Square**. Every picture and
  clip of the film is made at its size. The wide size is **App Settings → General → Films**; both sides
  are steps of 64, the sizes the video engine takes.
- **Look** is how the whole film looks, in a few words — "moody 35mm film, overcast light". Every
  picture of the film is painted with them.

A film's page has its work in tabs.

## Story

The title, the story and the look. The story can be a sentence, a page or a whole script. **Save**
keeps your changes; if the film was changed in another window first, the app says so and shows it
as it is now.

## Cards

What the film reuses in every shot, in four kinds:

- **Characters** — who is in the film. Describe how they look: age, build, hair, clothes. Their
  **Voice** is how they sound, in words — "a low, weathered woman's voice, calm and dry".
- **Places** — where the shots happen: what the place looks like, its light, its time of day.
- **Props** — objects that matter to the story.
- **Looks** — a style shown as a picture.

Each card has a picture. **Paint** asks the AI to paint it from the card's description (see
[The AI features](ai-features.md)); **Paint again** paints another; **From a file…** takes a PNG,
JPEG or WebP picture of your own (up to 20 MB — **App Settings → General → Card pictures**); **Take
off** removes it. A character's picture is painted full length on plain grey on purpose: the shots
use it to keep the same face and clothes.

Painting runs on the **AI tasks** strip, so you can keep working while it paints; the card's picture
changes when it's done. Deleting a card asks first.

## Shots

The film's shots in order. **Plan the shots** asks the AI to plan the film from its story: first it
adds a card for each character, place and prop the story needs that the film doesn't have yet (your
own cards stay as they are), then it plans every shot — how it is framed and how the camera moves,
what happens, where, who and what is in it, the line spoken and by whom, how long it runs and how it
joins the next. On a local model this takes a few minutes; it runs on the **AI tasks** strip.
**Plan again** replaces the shots, with their first frames and clips, so it asks first.

Every shot can be changed by hand (**✎**), moved earlier or later (**↑ ↓**), deleted, or added
(**Add a shot**). A shot you changed is marked **Changed by you**. After a change, the tab offers to
**Carry it forward**: the AI rewrites the later shots your change affects — a prop that's gone
leaves them, a coat now worn stays on — and never touches a shot you changed yourself. Say what
changed in your own words in the box beside it; it helps.

A shot with a line runs at least as long as it takes to say it (**App Settings → General →
Planning**).

### First frames

A shot's clip starts from its first frame. **✦** on a shot paints its first frames: several
candidates (three by default), each painted from the shot's words with its cards' pictures beside
them — who speaks first, then the other characters, the place, the props — so the faces, clothes and
places match the rest of the film. A vision model then looks at each one: is everyone and everything
there, is anyone there who shouldn't be, is there stray lettering, a distorted hand or a doubled
object. The best one is used. **Paint first frames** in the toolbar does this for every shot that has
none (all of them are painted first, then all checked — the graphics card holds one model at a time).

Click a shot's picture to see all its first frames side by side, each with its score and what the check
found. **Use this one** picks another; **Paint more** paints another set; **Delete** removes one. How
many are painted, how many card pictures go with each, and whether they're checked are in **App
Settings → General → First frames**; the words they are painted from are under **The words pictures
are painted from**.

### Clips

**▶** on a shot opens its clip. **Make the clip** turns the shot's first frame into a moving clip
with its sound — several minutes a clip on an 8 GB graphics card, on the **AI tasks** strip. **Make
clips** in the toolbar makes one for every shot that has none, one after another; a shot that can't
be made (say, set to follow drawn paths with none drawn) is named and the others go on.

**How the clip is made:**

- **The app's pick** — one pass for a shot up to 5 seconds, a long take past that; a shot whose
  line has been spoken in its character's voice is drawn to that voice, the mouth following it.
- **One pass** — the whole clip at the film's size: the sharpest, up to about 5 seconds.
- **Long take** — made at half size and then sharpened to the film's size: up to 13 seconds.
- **Led by drawn paths** — draw on the first frame where things should go: click to place a few
  points for one path, **New path** for the next. A car follows its route, a blade its arc, the
  camera its push. The path is smoothed between the points and spread over the clip.
- **Led by a guide video** — a video from a 3D tool (depth, pose or edges) gives the shapes and
  the motion, and the first frame gives the look. **Add a guide video…** reads its frames (MP4, WebM
  or MOV, up to 200 MB) — this needs FFmpeg, installed from the AI page.

Each clip you make is kept: watch them side by side, **Use this one** to put another in the film,
**Delete** to remove one.

### Voices

A shot with a line has a **microphone** button: **Speak shot 2's line** says the line in its speaker's
voice and puts a small player under it so you can hear it. The voice is made from the words on the
character's card (**Voice** — "a low, weathered woman's voice, calm and dry"); a line with no speaker,
or a character with no voice written, gets the default voice (**App Settings → General → Voices**,
with the language the lines are in). Speaking again replaces the line spoken before.

**Speak lines** in the toolbar speaks every line that has a speaker and no voice yet, one after
another, on the **AI tasks** strip.

Speak a line **before** making its shot's clip: the clip is then drawn to that voice — the mouth moves
with it, and the clip runs at least as long as the line (up to 13 seconds). If you change a line's
words after it was spoken, the shot shows **Words changed**: speak it again, then make the clip again.

The voices need the speech engine and its voice model, both installed from the AI page's **Speech**
tab; until then **Speak** says what is missing.

## Cut

The film as it will play. A bar across the top is its timeline: each shot that has a clip, in order,
as long as it plays; the music and sound effects run under it. A shot with no clip yet is left out of
the film and says so — **Make it on the Shots tab** takes you there.

For each shot:

- **Trim start** and **Trim end** take seconds off either end of its clip — to start on the action, or
  to cut before a stray last moment. Every shot keeps at least half a second.
- **Into the next shot** is how it joins the next one: a **Cut** (straight to the next), a
  **Dissolve** (the two blend over half a second) or a **Fade** (through black). The planner picks one;
  changing it marks the shot **Changed by you**, so a later **Carry it forward** leaves it alone.
- **↑ ↓** move it earlier or later — the same order as the Shots tab.

Each change is saved by itself a moment after you stop typing.

### Music and sound effects

Choose **Music** or **Sound effect**, describe it in **What it sounds like** — "a slow, tense string
swell under rain", "two swords clash and ring" — and **Make it**. **Length** is in seconds (empty: 30
for music, 6 for an effect — **App Settings → General → Music and sound effects**), **Starts at** is
where in the film it begins. It runs on the **AI tasks** strip; you can make several at once.

Each one is listed with a player: change where it **Starts at** and its **Volume**, or delete it. The
line under the form names the model it is made with and its licence — Stable Audio 3, free for
commercial use while a business earns under US$1 million a year.

### Export the film

**Export the film** joins every shot that has a clip into one MP4 video: each clip with its trims, at
the film's size and frame rate, its line's voice in place of the clip's own sound, the shots joined
with their transitions, and the music and effects mixed over at their places. It runs on the **AI
tasks** strip. It needs FFmpeg, installed from the AI page's **FFmpeg** tab.

The film then plays here. **Save the film…** saves the MP4 where you choose (in a browser,
**Download the film** puts it in your Downloads folder). Exporting again replaces it — the export is
made again from the clips any time, so it isn't in your backups. For colour grading or effects, open
the MP4 in a video editor.

## Deleting a film

On **Films**, a film's **⋯** menu has **Delete film**. It asks first: the film and everything in it —
its cards, shots, pictures, clips and sounds — are deleted.
