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
