# TASKS — the live open-work tracker

> **THIS is the live tracker** (app-structure §13). An item carries the APPROVED DECISION TEXT: what
> was shown to the user and approved, pasted at approval time, complete enough to code from without
> re-deriving what was decided. Deeper decided detail may live in a plan the item points to — read
> it before coding the item. Close = delete: when an item ships and its check is done, its lines
> leave this file (git keeps the history). A tracker line is a claim, not evidence — verify it
> against the code before repeating it.
>
> An item's shape (the family's format; the guard's check 10 reads STATE and GO):
>
> ```
> ### <the item, in the user's words> [YYYY-MM-DD]
> STATE:  what was decided, in the user's words, and where it stands
> WHY:    the problem it solves
> HERE:   what is done and what is next (paths, commits)
> GO:     the user's word that started it, verbatim, with its date
> PLAN:   docs/plans/<file>.md (when there is one)
> ```

### Finish the app [2026-11-07]
STATE:  building v1 to the plan's milestones; every decision Claude's rec under the go, recorded in the plan with its attack
WHY:    the user wants a free, local AI film studio (docs/dev/PRD.md) and has asked for it finished
HERE:   milestones 1–7 built (films and cards, the planner, first frames, clips, voices, music and effects, the cut and
        its export); not run yet on real models. Next: lip repair, a real end-to-end run, the kit's sd.cpp pin on our
        release, milestone 8 — the plan's "Where it stands" and "Next"
GO:     the user, 2026-11-07: "finish the app, dont stop coding at turns or decsions, for decisions you think adverserily
        multiple times on each decision you need to make and take your own rec, do not stop to ask me to make decsions,
        complete the app until all bugs features things you find our think of to do are donel, finish the app"
PLAN:   docs/plans/2026-11-07-v1.md

### Character voices: what JustDirect speaks with [2026-11-07]
STATE:  waits for the user's word. The user: "do we use jv or just take what we need and put it in just direct".
        Claude's rec, shown 2026-11-07: neither JustVoice the app nor a copy in JustDirect — the part of JustVoice that
        makes a voice (its speech model rows and notes, each model family's request, `slot.js`, and the step that
        designs a voice once and clones every line from it) moves into the kit as one copy both apps run; JustVoice
        keeps books, personas, casting, takes, lexicon and mastering; JustDirect keeps its cards and writes each card's
        voice description in JustVoice's proven form. The default cloning model allows commercial use, so not Breeze TTS
        2: picked by ear from Qwen3-TTS Base, CosyVoice3 and VoxCPM2. If not that: hand the lines to JustVoice as a file
        and bring the WAVs back (not live calls: two speech runtimes on one 8 GB card). The passes: the plan's "The
        voice decision".
WHY:    the user's review: both lines "Not usable", "does not sound like a women at all"; "did you role your own for
        this app instead of something we have tested and is designe dfor this?"
HERE:   JustDirect's own speech path is as committed; nothing is built on it until the answer. Waits for the user
        because it changes round E's split (JustVoice keeps its models and requests — JustVoice
        docs/plans/2026-10-29-round-e-onto-the-kit.md §1, decided on the user's go); the kit is frozen for the family
        release; JustVoice's half runs in a JustVoice session. Runs meanwhile under the go: the cloning listening test
GO:     none yet — the go to finish the app doesn't cover changing the user's round E decision
PLAN:   docs/plans/2026-11-07-v1.md "The voice decision"

### Lip repair (LatentSync) on our audio.cpp development build [2026-11-07]
STATE:  the PRD: "Lip repair (LatentSync) is offered, off by default, labelled non-commercial". It runs on our audio.cpp
        development build, as every engine may (the user, 2026-11-07: "you dont need a real release … we use dev code
        all the time"); the kit's pin moves with the family release. This repo's rule: a feature is registered the day
        it calls the engine (AGENTS.md).
WHY:    a fallback for a talking clip whose mouth misses its voice; LTX-2.3's audio-to-video already draws the mouth
HERE:   the fork checkout E:\Dev\Web\audio.cpp builds `engine_model_latentsync` (JustVoice's `jv-dev` build has it,
        2026-11-07 21:59); JustDirect needs a build folder of its own (JustVoice's `npm run dev` rebuilds `jv-dev`).
        Kit gaps to close with it: audio.cpp's lip-sync server runs FFmpeg from PATH (the kit's FFmpeg isn't on it);
        its frames come back as one Base64 string, about 6 s at 1280×704 at most (the user's decision 6, 2026-11-06,
        dropped longer lines); its 8 GB fit is unmeasured (9,144 MiB measured on a large card)
GO:     the user's go to finish the app (above)
