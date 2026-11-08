# The AI features

Each AI feature is a row under **AI Settings → Routing by feature**, with its own engine preset —
the model and settings it runs on. Every feature runs on your computer by default.

## Paint a card's picture

**Paint** on a card ([Your films](films.md)). It paints the picture of a character, a place, a prop
or a look from the card's description, with **FLUX.2 [klein] 4B** (Apache-2.0) on the
stable-diffusion.cpp engine — about half a minute on an 8 GB graphics card. The words it paints from
are your description put into a sentence for each kind of card; **App Settings → General → The words
pictures are painted from** changes those sentences. A character is painted full length on plain
grey, so every shot that uses the card can keep their face and clothes; a place is painted empty, in
the film's look.

The first time, the Cards tab says what the feature still needs — the picture engine to install and
its model to download (about 8.7 GB) — and offers both in place. Each press of **Paint again** paints
a new picture; the old one goes.

## Plan the shots

**Plan the shots** on a film's Shots tab ([Your films](films.md)) runs three steps on the
**Planning** preset: **Find the story's cards** (a card for each character, place and prop the
story needs), **Plan the shots** (the whole story as shots, in order) and, after you change a shot
by hand, **Carry a change forward** (the later shots your change affects). Each answer is held to the
film's own cards — a shot can only name cards the film has — and checked before it is kept: a card a
shot's words name but its list missed is added, and a shot with a line is given time to say it.

The preset thinks before it answers, with room to finish (the **medium** thinking level). It runs on
the local model you set up — **Gemma 4 26B-A4B** is the one it was tested with (Apache-2.0); a plan
takes about six minutes on an 8 GB graphics card. A stronger online model can be chosen for the
preset on the AI page. The prompts can be read and changed in the AI page's Lab.

## Changing what a feature runs on

Select the feature under **Routing by feature**: its preset can be pointed at another model, and its
settings (steps, guidance) changed. **Reset** puts the original back.
