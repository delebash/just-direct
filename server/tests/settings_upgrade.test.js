// SPDX-License-Identifier: MIT
// A setting still at an earlier default takes today's; one its owner edited is never touched — and a default can't
// change without its old fingerprint being kept (database/seed.js PREVIOUS_DEFAULTS, the kit's upgradeSettings).
import { defaultsFingerprints, fingerprint, upgradeSettings as upgradeToToday } from "@delebash/core/platform";
import { afterEach, expect, test } from "vitest";
import { openAppDatabase } from "../src/database/index.js";
import { PREVIOUS_DEFAULTS, SETTING_DEFAULTS, seedSettings, upgradeSettings } from "../src/database/seed.js";
import { getSetting, setSetting } from "../src/database/settings.js";
import { tmpDir } from "./helpers.js";

const open = [];
afterEach(() => {
  for (const db of open.splice(0)) db.close(); // Windows can't delete an open file
});

// Today's default of EVERY setting. A change here means a default changed: add the OLD fingerprint to
// PREVIOUS_DEFAULTS (so installs still holding it get the new one), then update this line.
const TODAY = {
  "films.width": "6f13d39f5c466596",
  "films.height": "e4e5494084228759",
  "cards.pictureSide": "e39eef82f61b21e2",
  "cards.maxPictureMegabytes": "f5ca38f748a1d6ea",
  "cards.prompt.character": "864e7a68afac8683",
  "cards.prompt.place": "c639ed750f83ea61",
  "cards.prompt.prop": "895aa78746aa882d",
  "cards.prompt.look": "65e0bd3396eee9b8",
  "planner.maxShots": "c2356069e9d1e79c",
  "planner.maxTokens": "c5d1866aabc15dda",
  "planner.wordsPerSecond": "b8736b9999090496",
  "frames.candidates": "4e07408562bedb8b",
  "frames.maxReferences": "4e07408562bedb8b",
  "frames.referencePixels": "54faea9b3eeffce2",
  "frames.check": "b5bea41b6c623f7c",
  "frames.prompt": "fb613ab9128df2c0",
  "clips.fps": "c2356069e9d1e79c",
  "clips.prompt": "2111f1cebac53983",
  "clips.negative": "12ae32cb1ec02d01",
  "clips.maxGuideMegabytes": "27badc983df1780b",
  "windows.checkSeconds": "4e07408562bedb8b",
};

test("today's defaults are the ones this test knows, and none of them is listed as earlier", () => {
  expect(defaultsFingerprints(SETTING_DEFAULTS)).toEqual(TODAY);
  for (const [key, print] of Object.entries(TODAY)) expect(PREVIOUS_DEFAULTS[key] ?? []).not.toContain(print);
});

test("a setting still at an earlier default takes today's; an edited one, and today's, are left alone", () => {
  const db = openAppDatabase(tmpDir());
  open.push(db);
  seedSettings(db);
  expect(upgradeSettings(db)).toEqual([]); // a fresh install holds today's
  // as an install made before a change would: an earlier picture side, and the owner's own picture limit
  setSetting(db, "cards.pictureSide", 768);
  setSetting(db, "cards.maxPictureMegabytes", 50);
  const previous = { "cards.pictureSide": [fingerprint(768)], "cards.maxPictureMegabytes": [fingerprint(10)] };
  expect(upgradeToToday(db, { defaults: SETTING_DEFAULTS, previous, getSetting, setSetting })).toEqual(["cards.pictureSide"]);
  expect(getSetting(db, "cards.pictureSide")).toBe(1024);
  expect(getSetting(db, "cards.maxPictureMegabytes")).toBe(50);
});
