// SPDX-License-Identifier: MIT
// The app's own tables, as numbered migrations (app-structure §16). The kit's `migrate` keeps the
// version in SQLite's own counter (PRAGMA user_version) and runs each newer migration once, in one
// transaction with the counter. Newest last; an applied migration is never edited — a schema
// change is a new entry.
//
// Ids are random text (crypto.randomUUID — a table that may sync never uses AUTOINCREMENT), times
// are ISO-8601 UTC text, columns are typed (snake_case here; the stores map them to the camelCase
// wire). The shared LLM stack's tables ride the same database: installLlm creates them.

export const MIGRATIONS = [
  {
    version: 1,
    // the template's notes example was taken out before any database existed (2026-11-07): this is the first schema
    name: "settings; films with their cards, shots, frames, clips and sounds",
    up: `
      -- The app's settings (one row per key, the value JSON), the renderer's preferences
      -- ("pref.<key>" rows, behind /v1/prefs) and the server's access tokens (the "auth" row).
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      -- A film: its story, the words for its look, its picture size (every first frame and clip is painted at it).
      CREATE TABLE films (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        story TEXT NOT NULL DEFAULT '',
        look TEXT NOT NULL DEFAULT '',
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- What the film reuses in every shot: a character, a place, a prop or a look. Its picture is a file in the
      -- film's folder (files.js); a character's voice is the words the voice model designs it from.
      CREATE TABLE cards (
        id TEXT PRIMARY KEY,
        film_id TEXT NOT NULL REFERENCES films(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('character', 'place', 'prop', 'look')),
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        voice TEXT NOT NULL DEFAULT '',
        picture TEXT,
        position INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX cards_by_film ON cards (film_id, kind, position);

      -- A shot, in film order: what happens (action), how it is framed and moves, who and what is in it (card_ids,
      -- JSON), its spoken line, how long it runs, how it joins the next. edited = changed by hand, which the planner's
      -- revision keeps. frame_id and clip_id are the chosen first frame and clip; trim_in/trim_out cut the clip in
      -- the film (seconds).
      CREATE TABLE shots (
        id TEXT PRIMARY KEY,
        film_id TEXT NOT NULL REFERENCES films(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        place_id TEXT,
        card_ids TEXT NOT NULL DEFAULT '[]',
        size TEXT NOT NULL DEFAULT '',
        camera TEXT NOT NULL DEFAULT '',
        action TEXT NOT NULL DEFAULT '',
        line TEXT NOT NULL DEFAULT '',
        speaker_id TEXT,
        seconds REAL NOT NULL,
        transition TEXT NOT NULL DEFAULT 'cut' CHECK (transition IN ('cut', 'dissolve', 'fade')),
        edited INTEGER NOT NULL DEFAULT 0 CHECK (edited IN (0, 1)),
        frame_id TEXT,
        clip_id TEXT,
        trim_in REAL NOT NULL DEFAULT 0,
        trim_out REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX shots_by_film ON shots (film_id, position);

      -- A first frame painted for a shot; verdict holds the vision check's answer (JSON) and score its rank.
      CREATE TABLE frames (
        id TEXT PRIMARY KEY,
        shot_id TEXT NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
        file TEXT NOT NULL,
        seed INTEGER NOT NULL,
        score REAL,
        verdict TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX frames_by_shot ON frames (shot_id, created_at);

      -- A clip made for a shot (an MP4 in the film's folder) and how it was made (recipe, JSON).
      CREATE TABLE clips (
        id TEXT PRIMARY KEY,
        shot_id TEXT NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
        file TEXT NOT NULL,
        seed INTEGER NOT NULL,
        seconds REAL NOT NULL,
        recipe TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
      CREATE INDEX clips_by_shot ON clips (shot_id, created_at);

      -- A sound: a shot's spoken line (kind line, shot_id set), or music or an effect placed in the cut at start
      -- seconds; volume 0 to 1.
      CREATE TABLE sounds (
        id TEXT PRIMARY KEY,
        film_id TEXT NOT NULL REFERENCES films(id) ON DELETE CASCADE,
        shot_id TEXT REFERENCES shots(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('line', 'music', 'effect')),
        prompt TEXT NOT NULL DEFAULT '',
        file TEXT NOT NULL,
        seconds REAL NOT NULL,
        start REAL NOT NULL DEFAULT 0,
        volume REAL NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );
      CREATE INDEX sounds_by_film ON sounds (film_id, kind);
    `,
  },
  {
    version: 2,
    name: "a shot's clip: how it is made, its drawn paths, its guide video",
    up: `
      -- How the shot's clip is made: auto (the app picks: talking, one pass or a long take from its length and line),
      -- one (one pass at the film's size), long (half size, then the upscale pass), paths (the drawn paths lead where
      -- things and the camera go), guide (a guide video leads the shapes and motion).
      ALTER TABLE shots ADD COLUMN mode TEXT NOT NULL DEFAULT 'auto' CHECK (mode IN ('auto', 'one', 'long', 'paths', 'guide'));
      -- The drawn paths: a list of tracks, each a list of control points {x, y} in 0..1 of the frame (JSON, read whole).
      ALTER TABLE shots ADD COLUMN paths TEXT NOT NULL DEFAULT '[]';
      -- The guide video's frame count (its PNG frames are in the film's guides/<shotId>/ folder), 0 for none.
      ALTER TABLE shots ADD COLUMN guide_frames INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 3,
    name: "a song's lyrics",
    up: `
      -- The words a piece of music sings (a song, made by ACE-Step); '' for music without words and for effects.
      ALTER TABLE sounds ADD COLUMN lyrics TEXT NOT NULL DEFAULT '';
    `,
  },
  {
    version: 4,
    name: "a character's voice from a recording",
    up: `
      -- A recording of the voice a character speaks with (a WAV in the film's cards/ folder, 24 kHz mono), cloned by
      -- Speak in place of a voice designed from words; NULL for none. What the recording says, '' when it isn't known.
      ALTER TABLE cards ADD COLUMN voice_sample TEXT;
      ALTER TABLE cards ADD COLUMN voice_sample_text TEXT NOT NULL DEFAULT '';
    `,
  },
  {
    version: 5,
    name: "a sound's fades",
    up: `
      -- Seconds a piece of music or an effect fades in from silence at its start, and out to silence before it stops
      -- being heard (its end, or the film's when that comes first); 0 for none.
      ALTER TABLE sounds ADD COLUMN fade_in REAL NOT NULL DEFAULT 0;
      ALTER TABLE sounds ADD COLUMN fade_out REAL NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 6,
    name: "voices from JustVoice; how a line is said",
    up: `
      -- A character's voice is JustVoice's (docs/plans/2026-11-08-justvoice-voices.md): its id there, NULL for none; what
      -- JustVoice said of it (JSON: the description it wrote, its models and their licences, the audition kept in the
      -- film's cards/ folder).
      ALTER TABLE cards ADD COLUMN voice_id TEXT;
      ALTER TABLE cards ADD COLUMN voice_info TEXT NOT NULL DEFAULT '{}';
      -- How a shot's line is said: in words ("whispered, afraid"), and as one of JustVoice's emotion labels; '' for none.
      ALTER TABLE shots ADD COLUMN delivery TEXT NOT NULL DEFAULT '';
      ALTER TABLE shots ADD COLUMN emotion TEXT NOT NULL DEFAULT '';
      -- The settings of JustDirect's own speech models, which JustVoice's voices replace.
      DELETE FROM settings WHERE key IN ('voices.model', 'voices.language', 'voices.default', 'voices.cloneModel');
    `,
  },
];

/**
 * The tables a migration's SQL creates, as the kit's backup router reads them ({ name, ddl }): the
 * DDL names each table's parents (REFERENCES), so a reset drops children first and a restore fills
 * parents first — an app's tables get foreign keys (just-house-paint's design_colors → designs).
 */
export function tableDefs(sql) {
  const out = [];
  for (const m of sql.matchAll(/CREATE TABLE\s+"?(\w+)"?\s*\(([\s\S]*?)\n\s*\);/gi)) out.push({ name: m[1], ddl: m[0] });
  return out;
}

/** The app's tables, for the kit's backup/restore/reset (makeDataRouter's `metadata`). */
export const APP_TABLES = MIGRATIONS.flatMap((m) => tableDefs(m.up));
