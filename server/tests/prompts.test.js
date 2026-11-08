// SPDX-License-Identifier: MIT
// A revised prompt reaches a database seeded before it; one its owner edited is never touched — and a prompt can't
// change without its old text kept (seed_feature_prompts.js FEATURE_PROMPT_HEALS, the kit's featurePromptHeals). Found
// 2026-11-08: the dev database still planned with its first prompts, so a line came back without its delivery and
// feeling and a character without its voice words.
import { fingerprint } from "@delebash/core/platform";
import { expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { getDb } from "../src/app_state.js";
import { seedWorkspace } from "../src/database/seed.js";
import { DEFAULT_FEATURE_PROMPTS, FEATURE_PROMPT_HEALS } from "../src/seed_feature_prompts.js";
import { tmpDir, useHermeticKit } from "./helpers.js";

useHermeticKit();

// Today's system text of EVERY prompt row. A change here means a prompt changed: add its OLD text, byte for byte, to
// FEATURE_PROMPT_HEALS (so databases still holding it get the new one), then update this line.
const TODAY = {
  "plan.cards": "61f47bebffb32e38",
  "plan.shots": "9e06067986ae41a6",
  "plan.revise": "f6c507289af3678a",
  "frames.check": "71fb2a8e45c68512",
};

test("today's prompts are the ones this test knows, and none of them is listed as an earlier text", () => {
  expect(Object.fromEntries(Object.entries(DEFAULT_FEATURE_PROMPTS).map(([k, v]) => [k, fingerprint(v.system)]))).toEqual(TODAY);
  for (const [key, olds] of Object.entries(FEATURE_PROMPT_HEALS)) {
    expect(DEFAULT_FEATURE_PROMPTS[key], key).toBeTruthy();
    expect(olds, key).not.toContain(DEFAULT_FEATURE_PROMPTS[key].system);
  }
});

test("a prompt still at an earlier text takes today's at the next seed; an edited one is left alone", async () => {
  await createApp(tmpDir());
  const db = getDb();
  seedWorkspace(db);
  const system = (key) => db.get("feature_prompts", key).system;
  expect(system("plan.shots")).toBe(DEFAULT_FEATURE_PROMPTS["plan.shots"].system); // a fresh install holds today's
  // as a database seeded before the revisions would: the first shots prompt, and a cards prompt its owner changed
  db.update("feature_prompts", { system: FEATURE_PROMPT_HEALS["plan.shots"][0] }, { key: "plan.shots" });
  const edited = `${FEATURE_PROMPT_HEALS["plan.cards"][0]} Keep descriptions short.`;
  db.update("feature_prompts", { system: edited }, { key: "plan.cards" });
  seedWorkspace(db);
  expect(system("plan.shots")).toBe(DEFAULT_FEATURE_PROMPTS["plan.shots"].system);
  expect(system("plan.shots")).toContain("delivery is how the line is said");
  expect(system("plan.cards")).toBe(edited);
});
