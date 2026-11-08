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

## Changing what a feature runs on

Select the feature under **Routing by feature**: its preset can be pointed at another model, and its
settings (steps, guidance) changed. **Reset** puts the original back.
