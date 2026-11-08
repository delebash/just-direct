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

## Paint a shot's first frame, and check it

**✦** on a shot, or **Paint first frames** ([Your films](films.md)). **Paint a shot's first frame**
runs on the **First frames** preset — FLUX.2 [klein] 4B again, with up to three of the shot's cards'
pictures as references (made small: as good by eye, in under half the time). It paints several
candidates, because the picture model sometimes adds a stranger or an extra object.

**Check a first frame** then looks at each candidate with **Qwen3-VL 8B** (Apache-2.0, about 6 GB to
download with its vision part), on the **First-frame check** preset, and the one that best matches its
shot is used. In testing it agreed with a person's eye on 16 of 16 frames. Without that model set up,
the frames are painted but not checked, and the app says so; the first one is used.

## Make a shot's clip

**Make the clip** on a shot ([Your films](films.md)) runs on the **Clips** preset: **LTX-2.3** (22B,
distilled, about 27 GB to download with its parts), which makes the picture and the sound together,
on the stable-diffusion.cpp engine. On an 8 GB card a 4-second clip at 1280 × 704 takes about seven
minutes; the model's weights stream from the drive, so it needs about 20 GB of the computer's memory
and room on the drive. Two of Lightricks' add-ons come with it: **Union Control**, which follows a
guide video, and **Motion Track Control**, which follows drawn paths.

Licences: LTX-2.3 and its add-ons are under the LTX-2 Community License — free for commercial use
for anyone under US$10 million a year in revenue, with no rights claimed in what you make. Its text
part, Gemma 3, is under Google's Gemma Terms of Use, which allow commercial use.

## Speak a shot's line

**Speak** on a shot with a line, or **Speak lines** ([Your films](films.md#voices)). The line is spoken
by **Qwen3-TTS VoiceDesign 1.7B** (Apache-2.0, about 2.8 GB to download) on the audio.cpp engine. It
makes a voice from words: the **Voice** written on the speaking character's card, or the default
voice in **App Settings → General → Voices**. The engine and the model are installed on the AI page's
**Speech** tab; which model speaks is **Voice model** in the same Settings group.

A clip made after its line is spoken is drawn to that voice: the clip model hears it and moves the
mouth with it.

## Make music and sound effects

**Make it** on a film's Cut tab ([Your films](films.md#music-and-sound-effects)). Music runs on the
**Music** preset with **Stable Audio 3 Medium** (about 3.6 GB to download); sound effects on the
**Sound effects** preset with **Stable Audio 3 Small SFX** (about 1.7 GB). Both run on the audio.cpp
engine, each in a few seconds once loaded; the Cut tab offers the engine and the model the first time.

Licence: the Stability AI Community License — free for commercial use for a person or business under
US$1 million a year in revenue.

## Changing what a feature runs on

Select the feature under **Routing by feature**: its preset can be pointed at another model, and its
settings (steps, guidance) changed. **Reset** puts the original back.
