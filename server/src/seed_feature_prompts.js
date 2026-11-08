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

import { PLANNER_PROMPTS } from "./planner.js";

export const DEFAULT_FEATURE_PROMPTS = { ...PLANNER_PROMPTS };
