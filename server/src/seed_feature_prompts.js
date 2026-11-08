// SPDX-License-Identifier: MIT
// The default prompt of each AI action (app-structure §8, §11: a "prompt-row-owned" feature) —
// seeded into the shared `feature_prompts` table insert-if-missing, then read from the database
// on every run, so the AI Lab can edit and save it. Keyed by the ACTION id; each row names its
// routing `feature`, the `system` prompt, the `user_template` ({{var}} placeholders the caller
// fills — runAiFeature's `variables`) and its JSON contract (`json_mode`). Every tunable is the
// engine preset's (seed_presets.js), never the prompt's.
//
// The prompt text is what the model reads, so it stays English on purpose (§Q.11). An image
// feature (cards.paint) has no prompt row: its words are the card's, through Settings → Pictures.
// The planner's three rows are planner.js's (the prompts its test passed with); each run sends the
// schema it builds from the film.

import { CHECK_ACTION, CHECK_PROMPT } from "./frames.js";
import { PLANNER_PROMPTS } from "./planner.js";

export const DEFAULT_FEATURE_PROMPTS = { ...PLANNER_PROMPTS, [CHECK_ACTION]: CHECK_PROMPT };

// A revised prompt reaches a database seeded before it (the kit's featurePromptHeals, seed.js configureAppSeed): seeding
// is insert-if-missing, so each key lists the system texts it had, byte for byte, and a row still holding one of them —
// never edited — takes today's; an edited prompt is never touched. A system text can't change without its old text
// added here (tests/prompts.test.js holds today's fingerprints). The planner's two below were the dev database's until
// 2026-11-08: it planned without the voice sentence or a line's delivery and feeling.
export const FEATURE_PROMPT_HEALS = {
  // before a character's voice became one plain sentence (41b011b, 2026-11-07)
  "plan.cards": [
    `You are a film director's first assistant. Use only what the story gives. Never invent characters, places or plot. Make one card for each character, each place where the story happens (kind "place") and each object that matters to the story (kind "prop"); add a card of kind "look" only when the story names a visual style. A description holds every look detail the story gives, so a picture can be painted from it alone. For a character, voice says how they sound in a few words from what the story gives (age, tone, accent), else "". The film already has the cards listed under HAS: never make them again.`,
  ],
  // before a line's delivery and feeling (1c619d8, 2026-11-08)
  "plan.shots": [
    `You are a film director's first assistant. Use only what the story gives. Never invent characters, places or plot. Break the whole story into shots in story order — as many as the story needs, at most {{maxShots}}. Direct it like a film: vary wide, medium and close shots, use a close-up for each key object and reaction, and choose the transition that serves the moment. For each shot: place is the card of the place it happens in; cards lists every card seen or named in the shot, its place included; size is how it is framed; camera is the camera's move in a few words ("static", "slow push in", "pan left", "tracking beside her", "handheld"); action says what happens in one or two sentences, never repeating a card's look; line is the words spoken in the shot, or "" if none, and speaker the card of who speaks it, or ""; seconds is how long the shot runs, long enough to speak its line.`,
  ],
};
