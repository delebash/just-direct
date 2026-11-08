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
- [docs/plans/2026-11-08-justvoice-voices.md](../plans/2026-11-08-justvoice-voices.md) — the character voices from
  JustVoice's server: its client API as its session sent it, and JustDirect's side (2026-11-08).

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
  **Heard by the user: "Not usable" — "does not sound like a women at all"** (both takes, for an older woman;
  `E:\Dev\Web\test-just-direct\review-answers-run.json`). Every word clear; it sounds like a person.
- **Music and effects (Stable Audio 3, mem_saver):** 20 s of music in 21 s and a 5 s hammer effect in 18 s, each
  with its model's load. **Heard by the user:** the music "Use with edits" — guitar and strings yes, quiet and hopeful
  mostly, it doesn't swell toward the end; the effect "Use with edits" — mostly a hammer on wood, more strikes wanted,
  no rain under it.
- **Not run then:** clips and the export. They run on the `jd` development build (then `server/src/dev_builds.js`; the kit's `runner/dev_build.js` since 2026-11-08); no
  release is needed (the user, 2026-11-07).

### The first clips run (2026-11-08, the `jd` development build)

- **sd-server was stopped by the kit 300 s after it started, mid-clip.** Its log ends while streaming LTX-2.3's blocks
  (total weights 25.3 GB: the diffusion model 14.4 GB streamed to the card, Gemma 3 and the VAEs 10.9 GB in RAM), no
  error; JustDirect's log: "fetch failed" one second later. The cause, in code: `RuntimeService.runJob` marked the kind
  busy but never cleared the idle timer armed at the server's start (sd.cpp's idle time: 300 s, `runner/runtimes.js`).
  Fixed in just-core e15a3f71 with a test (`tests/runtime_server.test.js`). *code*.

### The second clips run (2026-11-08, 06:50–07:12 UTC, the `jd` and `jv-dev` development builds)

`real-run-clips.js --part clips` on the first run's film, the card to itself (501 MiB used at the start, 20 GB RAM
free). Files in `E:\Dev\Web\test-just-direct\real-run-2026-11-07\`; frames looked at in `look\`. *measured* / *seen*.

- **The idle fix holds:** the one-pass clip (shot 1, 1280×704, 97 frames at 24 fps) took 412 s; the talking clip
  (shot 6, Mara's JustVoice line driving it) 397 s — both past sd.cpp's 300 s idle time, neither stopped.
- **The clips look right:** Mara (yellow oilskin, grey braid, captain's cap) and Teo (red hoodie) hold their cards'
  looks; the one-pass shot barely moves (a static wide shot, as planned).
- **Lip repair ran (492 s) and failed on this shot:** Mara is in profile, facing Teo; LatentSync drew a pink mouth in
  the air in front of her face from about frame 24 on, her own mouth unchanged (`look\lips-face-b.png` against
  `look\talk-face-b.png`). LatentSync aligns a frontal face (SCRFD and 106 landmarks); a side-on face is outside it.
  The window and the help now say so.
- **Lip repair shortened the shot:** 83 frames came back for a 97-frame clip, and the join stopped at the voice's end
  (3.37 s for a 4.0 s shot). audio.cpp's LatentSync makes as many frames as its voice lasts, plus one, and plays the
  clip back and forth past its end (`src/community_models/latentsync/pipeline.cpp:83-85, 120-123`). Fixed: the voice
  is padded or cut to the clip's length first and the clip's own frame count kept (`clips.js` `fitVoiceArgs`).
- **The export:** 7.5 s, the 2 shots with clips (10 without, left out), H.264 and AAC, in 5 s.
- **Lip repair on a face turned to the camera** (07:27–07:47 UTC, `real-run-lips.js`, through the running app's
  server): shot 6 turned to "Mara turns to face the camera and speaks, Teo beside her."; 3 first frames painted and
  checked in 172 s, the talking clip 417 s, lip repair 583 s. The mouth is redrawn in place, no stray mouth; its
  shapes differ a little from LTX's (`look\facing-talk-mouth.png` against `look\facing-lips-mouth.png`) — whether it
  follows the words better is for the user's eye. **The length fix holds on the engine:** 97 frames back for the
  97-frame clip, 4.042 s. LatentSync ran on this 8 GB card with its memory saver (the kit's figure, 9,144 MiB, was a
  large card's).
- **The repaired clip's encoding smoothed the face** outside the mouth, which LatentSync doesn't touch. Measured on
  2 s of the talking clip re-encoded: VP9 CRF 30 → SSIM 0.958 against the original, 329 KB; CRF 15 → 0.978, 2,099 KB;
  CRF 15 keeps the skin and fabric grain (`scratchpad\crf\compare.png`). The repaired clip is now CRF 15, near-lossless
  like the cut's own pieces (`cut.js`, x264 CRF 16), since the export encodes it again.
- **The window plays every kind of file the app makes, with sound:** played in Electron 45's Chromium (the app's own,
  a hidden window), each decoded picture and sound — sd.cpp's clip (VP8 with PCM sound in WebM: 113 KB of sound in
  0.85 s), the repaired clip (VP9, Opus), the export (H.264, AAC).

### Make the film, end to end on real models (2026-11-08, 08:38–09:13 UTC)

`real-run-make.js` (the scratchpad) on a new film, "The Last Light" — a four-sentence story, `planner.maxShots` 3 for
the run — through JustDirect's own routes, JustVoice headless on 17494, the card to itself. Files in
`E:\Dev\Web\test-just-direct\real-run-make-2026-11-08\` (`look\` the sheets). *measured* / *seen*.

- **The plan, alone first:** 221 s; 8 cards (2 characters, 3 places, 3 props), 3 shots, one line (Ines, shot 2).
- **A song from lyrics** (ACE-Step 1.5 Turbo through `sounds.song`): 35 s for 20 s, mean −17.0 dB. It peaks at full
  scale: about 50 samples at 0 dBFS with flat tops (flat factor 18.9) — mild clipping in the model's own output; at the
  mix's 0.6 the export peaks at −3.1 dB.
- **Make the film in one job: 1,839 s.** Plan: not needed (shots existed). First frames: 3 shots, 5 card pictures
  painted first, 3 checked. Voices: Ines's card had a recording (Mara's audition, JustVoice-made) → JustVoice cloned it
  (VoxCPM2), her line spoken in it (2.72 s); Pell had no line, so no voice was asked for. Clips: 3 — one pass (121
  frames), talking (97), a long take (145) — none failed. Export: 15.1 s, 3 shots, H.264 and AAC.
- **What it looks like:** Ines (white hair, grey wool coat) and Pell (blue knit cap) hold their cards' looks in every
  shot; the key and the papers in shot 2 read clearly; the lamp's beam crosses the sea in shot 3.
- **What it found:** (1) the plan's line had no delivery or feeling and the characters no voice words — the dev
  database still held its first prompts: prompt rows are seeded insert-if-missing and JustDirect registered no heals
  (fixed, 5fcbaf7; the texts checked byte for byte against git and the database). (2) The place cards said what happens
  there ("Spiral stairs: Stairs climbed by Ines."), and their pictures lost the story's lighthouse — a town's straight
  steps, a house's courtyard (`look\cards.png`). The cards prompt now asks for looks only, a place's kind and setting
  (b14e8c3).
- **The cards prompt measured** (09:37–09:45 UTC, `real-run-plan.js`, both stories planned again with today's prompts
  healed into the database, `plan-compare.log`): The Last Light's places now say where — "Lighthouse: A lighthouse at
  dusk.", "Spiral stairs: Spiral stairs inside a lighthouse.", "Top of the lighthouse: At the top of a lighthouse,
  overlooking a dark sea at dusk."; the ferry story's stay right ("A rain-soaked wooden pier at dawn, with sun shining
  through the rain.", "The bow of an old green ferry."). Kept. Still empty with the prompt asking: **every character's
  voice** (4 of 4) and **one of two lines' delivery and feeling** (the other: "softly", "whispered"). The schema
  allowed "".
- **The schema holding them, measured** (10:00–10:07 UTC, both stories again under b973eed's `anyOf` shapes): the
  shots' shapes work — both lines carried their delivery and feeling ("quietly; happy", "solemnly; sad"). The cards'
  didn't: every voice came back "Not provided." (the length rule met with filler), and the cards fell to 3 a story
  where the prompt alone made 8 and 9 — the lighthouse, the sea, the ferry and every prop gone. Kept the shots' shapes;
  the cards schema is the 09:37 one again, a voice optional (JustVoice describes a voice from the card's looks, as it
  did for Mara). The two passes are separate calls, so the pair wasn't planned together again.

### The voices round trip through JustVoice's server (2026-11-08, 06:43–06:47 UTC)

Run by `real-run-clips.js --part voices` (the scratchpad) against JustVoice e23e09a8 on its development audio.cpp
build, its database on "Best voices you can sell" (design `qwen3-vd`, clone `voxcpm2`). JustDirect's own models were
off the card; JustVoice's router held Gemma 4 26B-A4B beside its speech models (7,363 of 8,192 MiB used at the start).
Files in `E:\Dev\Web\test-just-direct\real-run-2026-11-07\`. *measured*.

- **Mara's voice, one call** (`POST /v1/cards/:id/voice` → JustVoice `POST /v1/character-voices`): 211 s. JustVoice's
  language model wrote "Female, in her sixties, with a weathered, resonant, and medium-low pitch. She speaks with a
  steady, rhythmic pace and a calm, authoritative manner that suggests years of sea life."; designed on Qwen3-TTS
  VoiceDesign, kept on VoxCPM2 (both commercial "Yes"). The audition `voice-Mara-audition.wav`: 4.32 s, 24 kHz mono,
  mean −19.9 dB, peak −3.3 dB.
- **The film's lines as one batch** (`POST /v1/films/:id/lines` → `POST /v1/audio/speech/batch`, `release: true`): 40 s
  for the one line, fetched by its `url`, the batch deleted after. `line-0387b546-justvoice.wav`: 3.36 s, 48 kHz mono,
  mean −25.2 dB, peak −4.6 dB. Not heard yet — the listening guide asks the user.

### Voices: what JustVoice tested, and why JustDirect's voice failed (read 2026-11-07)

Read in JustVoice's code and docs (E:\Dev\Web\JustVioce). *code* / *read*.

- **JustVoice's recipe** (`server/src/book_voices/index.js`): a language model writes each voice's description from the
  speaker's own passages; the description is designed once on `book_voices.design_model` speaking an audition line;
  the audition is kept at once as the clip of a voice on `book_voices.clone_model`; every line is cloned from that
  clip. The defaults: `qwen3-vd` designs, `breeze_tts` clones and narrates (`server/src/models.js:517-519`).
- **The request was not the fault:** JustVoice sends Qwen3-TTS VoiceDesign the description as `instructions`
  (`server/src/engines/audiocpp/slot.js:683`), as JustDirect does; JustDirect's language is "English" (`seed.js:60`).
  What differed: JustDirect designed every line afresh from the card's words ("an older woman's low, weathered voice,
  calm and dry"); JustVoice's descriptions lead with the gender and age ("Female, in her seventies, low and husky
  pitch …"). Which of the two made the voice male is not proven.
- **Breeze TTS 2's licence rules it out of JustDirect's default route:** "Any Commercial Purpose involving the Model
  Materials, a Derivative Model, or an Output requires a separate written commercial license from BreezeBlue"
  (JustVoice RESEARCH §10.13, `curated/breeze_tts.js:22-23`). Qwen3-TTS: commercial "Yes" (`curated/qwen3_tts.js:10`).
- **JustVoice's round 4** (its RESEARCH §10.22, 2026-10-16): nine cloning setups, 2,700 takes, scored by its test kit;
  the Apache-2.0 ones were CosyVoice3 and VoxCPM2; Qwen3-TTS Base was not among them. Its words: "this ranks, the ear
  decides".
- **JustVoice's file paths for other apps:** its standard JSON import (`imports/adapters/justvoice_standard.js`; a
  character's `voice_hint` goes into the speaker's sheet, `api/projects_api.js:454`) and
  `POST /v1/projects/:project_id/export_voicelines` (`api/projects_api.js:1547`); `book_voices_api.js` has no check on
  the project's kind.
- **The JustWrite ↔ JustVoice rule** "Neither app calls or spawns the other at runtime" (JustVoice
  `docs/dev/design-decisions.md` §3) covers those two apps only; the family rules expect "other apps calling the API".
