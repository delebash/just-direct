# PRD — what this app is for

> Written 2026-11-07 by Claude under the user's go ("finish the app … do not stop to ask me to make decsions"), from
> the record of what the user asked for and approved: the kit's `docs/plans/2026-10-24-just-direct-feasibility.md`
> (§I.3 the confirmed list, §J the proof list), `docs/plans/2026-10-31-just-direct-handoff.md` and the kit's TASKS
> ("JustDirect's six decisions", "JustDirect: finish the app"). The user's own words are quoted; a line Claude
> decided under the go says "(Claude's rec)".

## What it is for

JustDirect is a free AI film studio that runs on your own computer: describe a story and its AI plans the shots, makes the cast, sets and props once and reuses them, paints each shot's first frame, turns it into a moving clip with voices, music and sound effects, and joins the clips into a film — while you can take over any step by hand and the AI carries on from your change.

The user, 2026-10-24: "i want to be able to use online services like that have but local was well all free accepts for
what user has to pay for any api fontier model". 2026-10-30: "I want ai to be able to do most of the work but of course
the user does need to be able to modify things then ai pickup after user adjust things". The bar, 2026-10-31: "we need
to be able to do quality action swords cars ect"; "anything someone would wnat to put in a movies is part of the bar".

## Who uses it

Anyone who wants to make a film without a crew or a paid AI service — the user, 2026-10-30: "this is not just for me it
is for anyone". They open it with a story idea (a sentence or a script) and an ordinary gaming PC: an 8 GB graphics card
is the floor ("work on my specs but also different machines better specs"), and each feature offers a better option on
a stronger card (the feasibility record's §J.4 list per machine). Clips take minutes each on 8 GB; the user accepted
that: "the time for clips is acceptable and understood".

## Features — and how each is proven

The engines are the kit's (llama.cpp, stable-diffusion.cpp from our `jd` build, audio.cpp, FFmpeg). Every model in the
default route allows commercial use, its licence shown beside it (the handoff's "Licences of the route").

| Feature | What the user can do | Proven by |
|---|---|---|
| Films (projects) | Make, open, rename and delete a film; everything in it saved by the app's server | server route tests (happy, 422, refusal) · the films page mounted · the e2e smoke makes one through the window |
| Cards: cast, sets, props, looks | Describe a character, place, prop or look and the AI paints its reference picture (FLUX.2 klein 4B), or add your own picture; edit any card; every shot that names a card reuses it, so the film stays consistent | route tests · the cards page mounted · a real run through the kit's image feature (feasibility §J.2: one woman held across three scenes) |
| The story, planned into shots | Write or paste the story; the AI (Gemma 4 26B-A4B through the kit's `runAction`, its answer held to a schema) plans the shots — size, camera move, who and what is in each, the line spoken; edit any shot by hand and the AI revises the later shots around your change, never the earlier ones | route tests · the plan page mounted · real planner runs (feasibility §J.3: revisions correct on all 3 plans) |
| First frames | For each shot the AI paints several first frames from its cards and a local vision check (Qwen3-VL-8B) keeps the one that matches the shot; pick another or paint again by hand | route tests · a real run (handoff: the vision check agreed with Claude's eye on 16 of 16 frames) |
| Clips | Turn a first frame into a clip (LTX-2.3 through the kit's `runVideoFeature`): one pass at 1280×704 by default, a long take up to 13 s, a drawn motion path for where a car, blade, creature or the camera goes (the kit's motion-track drawer and the Motion Track LoRA), or a guide video you bring (depth, from a 3D tool, through the Union Control LoRA) | route tests · real clips on 8 GB (feasibility §J.3–§J.3.2; the passing action shots in the action research §3.15–§3.16) |
| Voices and talking | Give a character a voice and a shot its line, said the way the shot says (its delivery and feeling); the voices are JustVoice's — the family's voice app, through its server (the user, 2026-11-08: "i thought we had headless server for this exact reason") — made once per character and kept for every line; the clip's mouth is drawn to the voice (audio-to-video). Lip repair (LatentSync) is offered, off by default, labelled non-commercial | route tests with a fake JustVoice in its client API's shapes · real talking clips judged good by the user (feasibility §J.3.2 item 5) |
| Music and sound effects | A score cue or a sound effect for a shot or the film from a description (Stable Audio 3 Medium and Small SFX, ACE-Step for songs), each with its licence label | route tests · real cues ("use as is", feasibility §J.3.2 item 11) |
| The cut | The shots in order on a simple timeline: reorder, trim, voice, music and effects tracks; export the film as MP4 (the kit's FFmpeg) | route tests · the cut page mounted · a real export played back |
| Make the film | One button does every step the film still lacks, in order — plan, first frames, clips, export — never redoing what the user made or changed | route tests (the refusals; a story made into a film by fake engines and the real FFmpeg; a second run doing only the export) · the page mounted · a real run |
| Local or your own cloud key, per feature | Every feature runs local and free by default; a feature can use a cloud model on the user's own key instead, routed by the kit | the kit's routing tests · the AI area in the app |

## Outside data, accounts and paid services

- **None needed.** Everything runs on the user's computer once its engines and models are downloaded; no account, no
  login, no server of ours.
- **Downloads, each shown with its size and licence before it starts:** the engines' builds (GitHub releases: our
  stable-diffusion.cpp fork, our audio.cpp fork, llama.cpp, the FFmpeg builds the kit pins) and the models (Hugging
  Face). Without a connection, what is already downloaded keeps working.
- **Optional cloud AI on the user's own key** (the kit's providers), paid by the user to that provider. If the
  provider is down or the key is missing, the feature says so and the local model stays available.

## Out of scope

- **A 3D scene editor or shot builder inside the app** — the user, 2026-11-06: "dont do 2" (the Blender shot builder,
  neither in JustStage nor in JustDirect). A guide video made elsewhere can still drive a clip.
- **Training models** — "we cant train an ai i dont have the gpu power".
- **The phone app** — the template's phone mode has no in-app server yet (app-structure §1).
- **A full editing suite** (keyframes, colour grading, effects stacks) — the cut is simple; a film can go on to a full
  editor as an MP4. (Claude's rec: the app's job is making the shots; editing suites already exist.)
- **Nomi's skills and similar extras** — the user, 2026-10-30: "not a priority".
