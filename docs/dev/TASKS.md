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

### Lip repair (LatentSync) — waits for our audio.cpp release [2026-11-07]
STATE:  the PRD: "Lip repair (LatentSync) is offered, off by default, labelled non-commercial". Claude's pick under the
        go: not built until the kit's pinned audio.cpp can run it. The pinned v0.9.2-jv.6 has no LatentSync (the kit's
        RESEARCH §12); the pin moves with our audio.cpp fork's release, which the family releases together — the user's
        call. This repo's rule: a feature is registered the day it calls the engine (AGENTS.md).
WHY:    a fallback for a talking clip whose mouth misses its voice; LTX-2.3's audio-to-video already draws the mouth
HERE:   kit gaps to close with it: audio.cpp's lip-sync server runs FFmpeg from PATH (the kit's FFmpeg isn't on it);
        its frames come back as one Base64 string, about 6 s at 1280×704 at most (the user's decision 6, 2026-11-06,
        dropped longer lines); its 8 GB fit is unmeasured (9,144 MiB measured on a large card)
GO:     the user's go to finish the app (above); the release itself waits for the user
