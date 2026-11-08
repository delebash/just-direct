<!-- SPDX-License-Identifier: MIT -->
# Research register — what we already know, and where the proof is

**Read the section for your subject before researching anything** — before reading code to answer
a question, before measuring, before briefing an agent. Then look in `docs/plans` for anything
newer. The shared stack's facts (the kit, llama.cpp, Quasar, Electron, the memory arbiter) are in
[the kit's register](../../../just-core/docs/dev/RESEARCH.md); this one holds the app's own subjects.

## The rule (family-wide, decided 2026-10-04)

The user: *"why do we keep re researching stuff, we need a primary research doc that we point to so
we dont keep duplicating or forgeting what we have done in the past"* — approved "your rec on all
go". The kit's register carries the rule in full; in short:

- **Before research:** read the subject's section here and look in `docs/plans`. An agent's brief
  carries that section and the line *"don't re-derive these; re-check one only if the code it cites
  changed after its date"*.
- **After research:** its facts land here in the same change. A research doc with no entry here is
  not done. The family guard (check 15) fails any `docs/plans/YYYY-MM-DD-*.md` dated 2026-10-04 or
  later that this page does not link, and any link here that points nowhere.
- One fact per bullet, then *how it was checked and when* (measured · code · web · git · record ·
  agent), then where the proof is. A fact that turns out wrong is rewritten, ending "(was: … until
  <date>)".

## Subjects

### Everything proven before the app (the kit's register)

JustDirect's research was done before the app existed and lives in the kit's `docs/plans/`: the feasibility record
(`2026-10-24-just-direct-feasibility.md` — §J the proof list, §J.4 the list per machine), the action and movie-shot
research (`2026-10-31-just-direct-research-action.md`), the handoff (`2026-10-31-just-direct-handoff.md`), the
motion-track spec (`2026-11-06-motion-tracks-spec.md`) and the six research files of 2026-10-30 (consistency, talking,
long takes, scene, images, planner and audio). The kit's own register holds the engine facts (§11 sd.cpp video, §12
audio.cpp, §13 FFmpeg). Read those before researching anything here.

### The v1 plan

- [docs/plans/2026-11-07-v1.md](../plans/2026-11-07-v1.md) — how v1 is built: its standards table, the two kit
  changes it needs, its decisions with their attacks, its milestones (record, 2026-11-07).

### The first real run through the app (2026-11-07, this PC: RTX 2070 SUPER 8 GB, 32 GB RAM)

The app's own server on its real data folder (`data/`), the family's shared model cache
(`E:\Dev\Web\justwrite-app\data\ai-cache`, taken by itself on a fresh start), every step through the API the window
calls (`E:\Dev\Web\test-just-direct\real-run-2026-11-07\` holds the run's log, plan, pictures and sounds). The story:
five sentences, two characters, one line. *measured*.

- **Setup a fresh data folder needs:** a language model set as default (Quick Setup's "Set as default"); without one
  the plan fails at once with the kit's "No model is set" (now said on the Shots tab before Plan). The model files
  already on the PC were adopted into the shared cache by hard link after their SHA-256 matched the pinned rows (12
  files: LTX-2.3's 8, Stable Audio's 2, Qwen3-VL 8B's 2) — nothing downloaded again.
- **Two faults no test caught,** both fixed: the server didn't start under Node (a kit name imported from the wrong
  entry — Vitest passes it as undefined; `server/tests/boot.test.js`), and every plan and frame check failed because
  the routes read the kit's answer as `content` where `runAction` answers `text` (`server/tests/services.test.js`).
- **The planner (Gemma 4 26B-A4B, thinking "medium", 4,096 tokens):** the cards pass took 58–194 s (seven tries, all
  answered; two reached the thinking budget and still answered — the thought is closed and the answer follows), the
  whole plan 6.5 min: 7 cards and 12 shots, each in the story's order with its framing and camera, the line given to
  its speaker. Whether through /v1/ai/run, streamed, or straight to llama-server, the reply was the same.
- **Card pictures (FLUX.2 klein 4B):** 6–15 s each on a loaded engine; full-length characters on grey as asked, the
  board's "STILL HERE" lettered right.
- **First frames (klein, up to three card pictures as references, 1280×704):** 36 frames (3 a shot) in 30 min —
  about 45 s each; the check (Qwen3-VL 8B, loaded beside 1.2 GB another program held — the arbiter let it run over
  its budget) took under a minute for all 36. Every shot's chosen frame: no card missing, no stranger; nine of twelve
  scored 10, the others 8–9 (a floating object, stray lettering on the bow, a hand). Mara and Teo keep their faces,
  hair and clothes from their cards through all twelve; the pier and the light hold. The check flags lettering on
  the bow and the board, which this story asks for.
- **Voices (Qwen3-TTS VoiceDesign 1.7B):** the line, 2.6–2.7 s, spoken in 13 s. The planner had written the voices as
  `(sixties, "", "")` (fixed: a plain sentence asked for, weak ones dropped, the card's description used instead).
  Not yet heard by a person.
- **Music and effects (Stable Audio 3, mem_saver):** 20 s of music in 21 s and a 5 s hammer effect in 18 s, each
  with its model's load. Not yet heard by a person.
- **Not run:** clips and the export — they need our sd.cpp release in the kit's pin (building).
