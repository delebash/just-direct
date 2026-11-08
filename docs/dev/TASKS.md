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
STATE:  waits for the user's word. The user: "do we use jv or just take what we need and put it in just direct"; then,
        on the kit rec: "if you move it all to kit donest that defeat the purpose of jv … i thought we had headless
        server for this exact reason, we built jv for video gamaes, for podcast, why wouldnt it work well for just
        directk … do we need another api that does things live instead of handing files".
        Claude's rec (2026-11-08, replacing the kit rec): JustDirect gets its voices from JustVoice, live, through
        JustVoice's headless server — JustVoice stays the family's one voice studio and JustDirect is its client.
        JustVoice adds a small client API: make a character's voice from who they are (its tested recipe — describe,
        design once, keep the audition as a clip voice on a commercial-use cloning model — as one call); speak lines in a
        voice with their direction (in OpenAI's /v1/audio/speech shape, which JustVoice already speaks to outside
        servers, `engines/external_openai.js`); clone from a recording (its `/v1/voices/clone`); list voices with each
        one's model and commercial-use word; let go of the card when another app's job ends (JustVoice's own idle
        setting, the kit's `idleSeconds`). JustDirect drops its own speech code, keeps music, effects and lip repair on
        the kit, keeps each card's JustVoice voice and the spoken WAVs with the film, and says plainly when JustVoice
        isn't running. The passes: the plan's "The voice decision".
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
HERE:   built 2026-11-08, not yet run on real models: Settings → General → Clips "Offer lip repair on talking clips"
        (off), "Repair lips" on a talking clip (ClipsDialog.vue), POST /v1/clips/:id/lips (clips_api.js; LatentSync 1.6
        Q8 row and the Lip repair preset, seed_presets.js), the frames and the line's voice joined by the kit's FFmpeg
        (clips.js lipClipArgs), a clip past one answer's length refused (lipFramesMax: about 6 s at 1280×704, the
        user's decision 6). The kit's FFmpeg is on audio.cpp's PATH since just-core 64b868fb. Next: a real run on
        the card on an audio.cpp development build of JustDirect's own (JustVoice's `npm run dev` rebuilds `jv-dev`);
        its 8 GB fit is unmeasured (9,144 MiB measured on a large card)
GO:     the user's go to finish the app (above)
