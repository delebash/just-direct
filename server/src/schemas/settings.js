// SPDX-License-Identifier: MIT
// The app's settings — one schema per key (app-structure §16). A key is a `settings` row seeded
// with its first value (database/seed.js SETTING_DEFAULTS); /v1/settings reads and writes only the
// keys listed here, and Settings → General builds its form rules from the same schemas.
// Browser-safe: this file imports only the kit's `platform/schema` (TypeBox).

import { opt, strictObject, T } from "@delebash/core/platform/schema";

/** A picture side: sd.cpp's LTX wants multiples of 64 (schemas/films.js). */
const Side = T.Integer({ minimum: 384, maximum: 1920, multipleOf: 64 });
/** The words a card's picture is painted from: {name}, {description} and {look} are filled in. */
const PromptTemplate = T.String({ minLength: 1, maxLength: 600 });

export const SETTINGS = {
  // A new film's picture size (every first frame and clip is painted at it): 1280×704 is LTX-2.3's one-pass size on
  // 8 GB (feasibility §J.3).
  "films.width": Side,
  "films.height": Side,
  // The long side of a card's picture (a character is 3:4, a prop square, a place or a look the film's shape).
  "cards.pictureSide": T.Integer({ minimum: 512, maximum: 1536, multipleOf: 64 }),
  // The largest picture a card takes from a file, in MB.
  "cards.maxPictureMegabytes": T.Integer({ minimum: 1, maximum: 100 }),
  // The words each kind of card's picture is painted from.
  "cards.prompt.character": PromptTemplate,
  "cards.prompt.place": PromptTemplate,
  "cards.prompt.prop": PromptTemplate,
  "cards.prompt.look": PromptTemplate,
  // The planner: the most shots a plan may have, the room each answer has (thinking included), and how fast a line is
  // spoken (a shot with a line runs at least as long as it takes to say it).
  "planner.maxShots": T.Integer({ minimum: 1, maximum: 60 }),
  "planner.maxTokens": T.Integer({ minimum: 2000, maximum: 32768 }),
  "planner.wordsPerSecond": T.Number({ minimum: 1, maximum: 5 }),
  // First frames: how many candidates a shot gets, how many of its cards' pictures go with them and how small, whether
  // the vision check picks the best, and the words they are painted from ({size}, {action}, {cards}, {look}).
  "frames.candidates": T.Integer({ minimum: 1, maximum: 8 }),
  "frames.maxReferences": T.Integer({ minimum: 0, maximum: 6 }),
  "frames.referencePixels": T.Integer({ minimum: 65536, maximum: 1048576 }),
  "frames.check": T.Boolean(),
  "frames.prompt": T.String({ minLength: 1, maxLength: 600 }),
  // Clips: the frame rate, the words a clip is made from ({action}, {camera}, {size}, {cards}, {line}, {look}) and what
  // it should avoid, and the largest guide video a shot takes, in MB.
  "clips.fps": T.Integer({ minimum: 8, maximum: 30 }),
  "clips.prompt": T.String({ minLength: 1, maxLength: 600 }),
  "clips.negative": T.String({ maxLength: 600 }),
  "clips.maxGuideMegabytes": T.Integer({ minimum: 1, maximum: 2000 }),
  // Voices: the speech model a line is spoken with (an audio.cpp model that designs a voice from words), the language
  // it speaks, and the voice a character with no Voice words gets.
  "voices.model": T.String({ minLength: 1, maxLength: 120 }),
  "voices.language": T.String({ minLength: 1, maxLength: 40 }),
  "voices.default": T.String({ minLength: 1, maxLength: 600 }),
  // Music and effects: a new piece's length, and the steps it is made in.
  "sounds.musicSeconds": T.Integer({ minimum: 1, maximum: 60 }),
  "sounds.effectSeconds": T.Integer({ minimum: 1, maximum: 60 }),
  "sounds.steps": T.Integer({ minimum: 1, maximum: 100 }),
  // How often a window looks for what other windows changed on this server, in seconds.
  "windows.checkSeconds": T.Integer({ minimum: 1, maximum: 60 }),
};

export const SETTING_KEYS = Object.keys(SETTINGS);

/** PATCH /v1/settings — any of the keys, nothing else. */
export const SettingsPatch = strictObject(Object.fromEntries(SETTING_KEYS.map((k) => [k, opt(SETTINGS[k])])));
