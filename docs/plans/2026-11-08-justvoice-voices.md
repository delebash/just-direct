# JustDirect's voices from JustVoice — the client

> Part of the v1 job (`docs/plans/2026-11-07-v1.md`, read that FIRST after any compaction). This file holds the
> voice decision's build: JustVoice's client API as its session sent it, and JustDirect's side.

## The decision (Claude's, under the user's go — the passes are in the v1 plan's "The voice decision")

JustDirect gets its character voices from JustVoice, live, through JustVoice's server (headless or the app) — JustVoice
stays the family's one voice studio; JustDirect is its client. The user's words: "i thought we had headless server for
this exact reason, we built jv for video gamaes, for podcast, why wouldnt it work well for just directk"; and on the
card: "if you need ot make a call to jv just unload your model first, make sure you do a batch to jv do all sound work
in groups then you can reload your models". JustVoice's code is its session's (justvioce-e3, "just voice"), briefed by
message 2026-11-08.

## Standards: the kit code each piece uses

| Piece | Kit code |
|---|---|
| The client of JustVoice's server (`server/src/justvoice.js`) | app — JustDirect is JustVoice's client over its documented client API (JustVoice `docs/dev/client-api.md`); the kit has no app-to-app client, and an HTTP client to another family app's API is that app's contract, not an engine |
| A character's voice, a line, a film's lines as server jobs | `JobRegistry` |
| The refusals (JustVoice not running, no speaker, no line) | `ApiError` |
| Letting go of the card before a batch (services.freeCard) | `stopRuntimeServers` beside the runner's stop, the pair the app's reset uses (server/src/data_admin.js) |
| A spoken line's length | `wavSeconds` |
| A voice recording read into a WAV for cloning | `runFfmpeg`, `ffmpegReadiness` |
| The jobs in the window (Make the voice, Speak, Speak lines) | `runServerJob` |
| The card's Their voice, the shot's How it's said and Feeling, the Shots tab's banner | `UiButton`, `UiSelect`, `UiInput`, `UiField`, `UiBanner` |
| The voices' settings (JustVoice's address, the lines' language) | app — seeded rows with their schemas (family rule 1: a value a user might change is a row) |
| How a line is said (delivery words, an emotion label) | app — the shot's content, the planner's schema; the labels are JustVoice's client API's list |

## JustVoice's client API — the shapes its session sent (2026-11-08), final fixtures to follow

Every call sends `X-Client: JustDirect` (stored as the voice's `made_by`).

1. `POST /v1/character-voices` → 202, the kit's job snapshot `{id, kind: "character-voice", state, progress, message, …}`;
   follow `GET /v1/jobs/:id` (or `/v1/jobs/:id/events`, SSE); stop with `DELETE /v1/jobs/:id`. Body: `{name,
   description, lines?: string[], context?: string, language: "en-US", gender?: "male"|"female", commercial_use?:
   true}`. The result: `{voice_id, name, gender, description, described_by, design: {model, name, commercial, summary,
   url}, clone: {model, name, commercial, summary, url}, audition_url}`. `commercial`: "Yes" | "Conditional" |
   "Separate licence" | "Unclear" | "No"; with `commercial_use: true` a model that isn't Yes or Conditional is a 409
   naming it and why.
2. `POST /v1/audio/speech` — OpenAI's body `{model? (ignored), input, voice: <voice_id>, instructions?, response_format:
   "wav", speed?}` plus JustVoice's optional `emotion` (neutral, happy, sad, angry, fearful, whispered, shouted,
   sarcastic, contemptuous) and `seed` → `audio/wav`; only "wav" accepted (400 otherwise). Send both emotion and
   instructions: some models take only a label.
3. `POST /v1/voices/clone` as today, engine and model optional (default: the commercial cloner) → the voice row.
4. `GET /v1/voices?made_by=JustDirect` → `{voices: [...]}`, each row with `made_by` and `licence {commercial, summary,
   url}`; `DELETE /v1/voices/:id` as today.
5. `POST /v1/audio/speech/batch` → 202 job (kind "speech-batch"). Body `{lines: [{id, voice, input, instructions?,
   emotion?, seed?}], release?: true}`; lines in order; result `{lines: [{id, file, seconds, error}]}`; the zip `GET
   /v1/audio/speech/batch/<job_id>.zip` with `manifest.json {lines: [{id, file, voice, model, seconds, error}]}` and
   `<id>.wav` per line. `release` (default true): JustVoice lets go of every speech model it holds when the batch ends.
6. `GET /v1/health` gains `client_api: 1`. Written down in JustVoice `docs/dev/client-api.md`, checked by its
   `server/tests/client_api.test.js`, whose example bodies JustDirect's fake copies.

The default design and clone models come from JustVoice's engine pick (running 2026-11-08); until it lands, the commercial
word may still read "Separate licence" (Breeze).

## JustDirect's side — to build once the fixtures arrive

(Claude's picks, attacked; JustVoice's session: "don't build against guesses".)

- A card's voice is a JustVoice voice: the card keeps its `voice_id` and the audition's address; **Make the voice**
  on a character card sends who they are (the card's description and Voice words, their lines, the story's one line).
- **Speak lines** is one batch: JustDirect lets go of its own models first (the kit's runtimes), sends every unspoken
  line with its voice and delivery, stores each WAV as the shot's line (the sounds table, kind line), then its clips
  load their model again. One line's retake uses `/v1/audio/speech`.
- A recording on a card goes to JustVoice's `/v1/voices/clone`.
- JustDirect's own speech code goes: `services.speak`, `voiceCheck`, the Qwen3 rows, `voices.model` / `language` /
  `cloneModel` settings — swept by grep in the same change.
- JustVoice not running: Speak and Make the voice say so in plain words with its address (a setting, default
  `http://127.0.0.1:17494`); a talking clip can still be made — LTX-2.3 then speaks the line itself.
- The licence word of each voice's models is shown beside it.

## Build steps (Claude's, 2026-11-08 — built against the shapes above; aligned to the fixtures when they land)

Where they stand: 1–10 built and committed, unverified until the end run. JustVoice's contract landed (its main
3d5b2020; fixtures from 29eb8380, copied into `server/tests/fixtures/justvoice/`), and the client follows its changes:
each batch line has a `url`; the character voice's result has `audition` (the line it says, kept as the card's
`voiceInfo.auditionLine`) and `audition_url` (`/v1/voices/<id>/clip.wav`); a batch is deleted once its lines are
fetched (`DELETE /v1/audio/speech/batch/<job>`); a model refused under `commercial_use` is a 409 on the POST itself;
the clone's row names its model (`model_name`). JustVoice's defaults: Qwen3-TTS VoiceDesign designs, VoxCPM2 clones
(both "Yes").

Picks, each attacked: (a) a line with no speaker isn't spoken (a refusal names it: choose who says it) — the
default-voice setting goes, since a JustVoice voice is made per character; (b) a shot gains **delivery** (words: "whispered,
afraid") and **emotion** (one of JustVoice's nine labels) — the planner writes both, the user edits them, both go to
JustVoice (its session: "Send both emotion and instructions"); (c) the card's audition WAV is kept in the film's cards
folder (the film's backup holds what the user heard); (d) freeing the card before a batch is the app's own reset pair:
`lifecycle.getService().stop()` and the kit's `stopRuntimeServers()` (data_admin.js) — models load again on next use.

1. `server/src/justvoice.js` — the client: health, character voice (job), speak, batch (job), clone, delete; offline →
   409 "JustVoice isn't running" with the address looked at.
2. Migration 6: cards `voice_id`, `voice_info` (JSON: the models, their licences, the description JustVoice wrote, the
   audition file); shots `delivery`, `emotion`; the old voice settings' rows deleted.
3. Settings: `voices.model`, `voices.language`, `voices.default`, `voices.cloneModel` go; `voices.justvoiceUrl`
   (http://127.0.0.1:17494) and `voices.locale` (en-US) come; `voices.sampleSeconds` and `voices.maxSampleMegabytes` stay.
4. Services: `voices()` (the client at the setting's address), `freeCard()`; `speak`, `voiceCheck` and the Qwen3 rows go.
5. Routes: `POST/DELETE /v1/cards/:id/voice`; the voice recording also cloned in JustVoice; `POST /v1/shots/:id/line`
   one line; `POST /v1/films/:id/lines` the card freed, missing voices made, one batch.
6. The planner writes delivery and emotion; the shot editor shows them.
7. The card dialog: Make the voice, its audition, its models' licences; a banner when JustVoice isn't reachable.
8. Make the film: a voices step between first frames and clips (skipped, with a note, when JustVoice isn't running).
9. Help: films.md, ai-features.md, settings.md, getting-started, troubleshooting, what's new.
10. Tests at every level, a fake JustVoice in JustVoice's shapes.
