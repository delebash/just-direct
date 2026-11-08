// SPDX-License-Identifier: MIT
// The app's seed pass (app-structure §8, §16) — run by serve.js when the server starts and by the
// backup panel's Reset, never by createApp (a test's createApp(tmp) starts from an empty
// database). Every step is insert-if-missing: a value the user changed is never overwritten.
//
//   - the shared LLM stack's rows (providers, the model catalog, the engine presets, the routing):
//     the kit's seedLlm, which reads the feature data installLlm registered;
//   - this app's settings defaults (family rule 1: a value a user might change is a row, seeded) — and a
//     setting still at an earlier default upgraded to today's (PREVIOUS_DEFAULTS);
//   - the provider registry, loaded from the seeded rows.

import { loadFromConfigs, seedLlm, stores } from "@delebash/core/llm";
import { upgradeSettings as upgradeToToday } from "@delebash/core/platform";
import { getLogger } from "@delebash/core/platform/log";
import { getSetting, insertSettingIfMissing, setSetting } from "./settings.js";

const log = getLogger("just_direct.seed");

/** The app's settings and their first values — each key has its schema in schemas/settings.js. */
export const SETTING_DEFAULTS = {
  // A new film's picture size (Settings → General): LTX-2.3's one-pass size on 8 GB.
  "films.width": 1280,
  "films.height": 704,
  // The long side of a card's picture (Settings → General).
  "cards.pictureSide": 1024,
  // The largest picture file a card takes, in MB (Settings → General).
  "cards.maxPictureMegabytes": 20,
  // The words each kind of card's picture is painted from (Settings → Pictures): a character as a full-length reference
  // on plain grey — what the first frames take as its reference (feasibility §J.2: one woman held across three scenes);
  // a place empty of people, in the film's look; a prop alone on grey.
  "cards.prompt.character":
    "A full-length photograph of {name}: {description}. Standing, facing the camera, the whole body in frame from head to feet, arms relaxed, plain light grey studio background, soft even light, sharp focus.",
  "cards.prompt.place": "{description}. A wide photograph of the place, with no people in it. {look}",
  "cards.prompt.prop": "{description}. A photograph of the object alone on a plain light grey background, soft even light, sharp focus.",
  "cards.prompt.look": "{description}. {look}",
  // The planner (Settings → General): at most 24 shots (the planner test's schema), 12,000 tokens an answer (its
  // passes needed up to 10,000 with a 4,096 thinking budget), lines spoken at 2.5 words a second (150 a minute).
  "planner.maxShots": 24,
  "planner.maxTokens": 12000,
  "planner.wordsPerSecond": 2.5,
  // First frames (Settings → General): three candidates a shot (klein adds stray people on many seeds — the handoff),
  // up to three of its cards' pictures (cast, set and prop — feasibility §J.2) at 262,144 pixels each (as good by eye,
  // under half the time), checked; the words: the framing, what happens, each card's look, the film's look.
  "frames.candidates": 3,
  "frames.maxReferences": 3,
  "frames.referencePixels": 262144,
  "frames.check": true,
  "frames.prompt": "{size} {action} {cards} {look}",
  // Clips (Settings → General): 24 frames a second (every proof clip); the words: what happens, the camera's move,
  // each card's look, the line, the film's look — the action research found LTX follows a move it is told in words; no
  // words to avoid (the distilled model runs at guidance 1, where they do nothing); guide videos up to 200 MB.
  "clips.fps": 24,
  "clips.prompt": "{action} {camera} {cards} {line} {look}",
  "clips.negative": "",
  "clips.maxGuideMegabytes": 200,
  // Lip repair is off until turned on (the PRD: "offered, off by default, labelled non-commercial"); audio.cpp's own
  // LatentSync defaults, 20 steps at guidance 1.5.
  "clips.lipRepair": false,
  "clips.lipSteps": 20,
  "clips.lipGuidance": 1.5,
  // Voices (Settings → General): Qwen3-TTS VoiceDesign 1.7B (the voice line the talking clips were tested with), English
  // (its language names: English, Chinese, Japanese, Korean, German, French, Russian, Portuguese, Spanish, Italian), and a
  // plain voice for a character with no Voice words.
  "voices.model": "qwen3-vd-1.7b-q8",
  "voices.language": "English",
  "voices.default": "A natural, clear adult voice, calm and unhurried.",
  // A character with a voice recording is cloned from it by Qwen3-TTS Base (JustVoice's cloning model), from at most
  // this many seconds of it (a few clean seconds are what it needs), from a file of at most this size.
  "voices.cloneModel": "qwen3-base-1.7b-q8",
  "voices.sampleSeconds": 20,
  "voices.maxSampleMegabytes": 50,
  // Music and effects (Settings → General): 30 s of music and 6 s of an effect, 8 steps (the tested recipe).
  "sounds.musicSeconds": 30,
  "sounds.effectSeconds": 6,
  "sounds.steps": 8,
  // How often a window looks for what other windows changed on this server, in seconds (Settings → General — the
  // kit's GET /v1/sync/rev `pollSeconds`).
  "windows.checkSeconds": 3,
};

/**
 * The earlier defaults of the settings whose default has changed — each one's fingerprint (the kit's `fingerprint`:
 * the first 16 hex digits of the SHA-256 of its canonical JSON), per key. When a default in SETTING_DEFAULTS changes,
 * add the OUTGOING default's fingerprint here (tests/settings_upgrade.test.js holds today's and fails until you do):
 * an install still holding it — its owner never edited it — gets the new default.
 */
export const PREVIOUS_DEFAULTS = Object.freeze({});

/** Add every missing setting; returns how many were added. */
export function seedSettings(db) {
  let added = 0;
  db.tx(() => {
    for (const [key, value] of Object.entries(SETTING_DEFAULTS)) if (insertSettingIfMissing(db, key, value)) added++;
  });
  return added;
}

/** A setting still at an earlier default (PREVIOUS_DEFAULTS) takes today's; a value its owner changed is left
 *  alone (the kit's upgradeSettings). Returns the keys it upgraded. */
export function upgradeSettings(db) {
  const upgraded = upgradeToToday(db, { defaults: SETTING_DEFAULTS, previous: PREVIOUS_DEFAULTS, getSetting, setSetting });
  if (upgraded.length) log.info(`settings still at an earlier default, now today's: ${upgraded.join(", ")}`);
  return upgraded;
}

/** The whole seed pass. Never throws: a failed step is logged and the server still starts. */
export function seedWorkspace(db) {
  try {
    seedLlm(db);
  } catch (e) {
    log.warning(`the AI stack's seed failed: ${e?.message ?? e}`);
  }
  try {
    seedSettings(db);
    upgradeSettings(db);
  } catch (e) {
    log.warning(`the settings seed failed: ${e?.message ?? e}`);
  }
  try {
    loadFromConfigs(stores.getProviderStore().list());
  } catch (e) {
    log.warning(`the AI provider registry didn't load: ${e?.message ?? e}`);
  }
}
