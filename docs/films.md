---
lede: How a film is made — its story, its cards, and the pictures that keep it the same from shot to shot.
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

## Deleting a film

On **Films**, a film's **⋯** menu has **Delete film**. It asks first: the film and everything in it —
its cards, shots, pictures, clips and sounds — are deleted.
