// SPDX-License-Identifier: MIT
// Where a film's files live — one folder per film under the data folder, so deleting a film is one folder and the kit's
// backup takes every film as one asset root (`films/`). A film's export is made again from its clips, so exports live
// apart (`exports/`) and stay out of the backup.
//
//   <dataDir>/films/<filmId>/cards/<name>.png     a card's picture (each new picture a new name: a window still showing
//                                                 the old one never reads half a file)
//   <dataDir>/films/<filmId>/frames/<id>.png      a shot's first frames
//   <dataDir>/films/<filmId>/clips/<id>.mp4       a shot's clips
//   <dataDir>/films/<filmId>/sounds/<id>.wav      spoken lines, music, effects
//   <dataDir>/films/<filmId>/guides/<shotId>/     a shot's guide frames (drawn paths, a guide video's frames)
//   <dataDir>/exports/<filmId>/<name>.mp4         the film, exported
//   <dataDir>/work/<id>/                          one job's scratch files (a guide video's frames, lip repair's raw
//                                                 frames), removed after it and at every start; never in the backup

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { getLogger } from "@delebash/core/platform/log";
import { renameHeld } from "@delebash/core/platform/rename_held";

const log = getLogger("just_direct.files");

const SAFE = /^[A-Za-z0-9_-]{1,80}$/;
/** The kinds of file a film keeps, each its own folder. */
export const FILM_PARTS = Object.freeze(["cards", "frames", "clips", "sounds", "guides"]);

/** A path part that came from a request or a row — refuse anything that could leave the folder. */
export function safeName(s) {
  if (!SAFE.test(String(s))) throw new Error(`unsafe file name: ${JSON.stringify(s)}`);
  return String(s);
}

/** A stored file name (`<id>.png`, `<id>.mp4`): the name, or null for anything else (a restored backup's row could hold
 *  anything). */
export const fileName = (file, ext) => (typeof file === "string" && new RegExp(`^[A-Za-z0-9_-]{1,80}\\.${ext}$`).test(file) ? file : null);

export const filmsRoot = (dataDir) => path.join(dataDir, "films");
export const exportsRoot = (dataDir) => path.join(dataDir, "exports");
export const filmDir = (dataDir, filmId) => path.join(filmsRoot(dataDir), safeName(filmId));
/** One file of a film: `part` one of FILM_PARTS, `name` its stored name. */
export function filmFile(dataDir, filmId, part, name) {
  if (!FILM_PARTS.includes(part)) throw new Error(`no film folder "${part}"`);
  return path.join(filmDir(dataDir, filmId), part, path.basename(String(name)));
}
export const exportDir = (dataDir, filmId) => path.join(exportsRoot(dataDir), safeName(filmId));
export const workRoot = (dataDir) => path.join(dataDir, "work");

/** A new scratch folder for one job, inside the data folder (a lip repair's frames run to hundreds of MB). */
export function newWorkDir(dataDir) {
  const dir = path.join(workRoot(dataDir), randomUUID());
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** At start: what a job that never finished left in the scratch folder goes. */
export async function clearWork(dataDir) {
  await rm(workRoot(dataDir), { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {});
}

export function ensureFilmDirs(dataDir, filmId) {
  for (const part of FILM_PARTS) mkdirSync(path.join(filmDir(dataDir, filmId), part), { recursive: true });
}

/** Write `bytes` to `file` whole or not at all: a `.part` beside it, then a rename (held a moment by a scanner on
 *  Windows — the kit's renameHeld retries). */
export async function writeWhole(file, bytes) {
  mkdirSync(path.dirname(file), { recursive: true });
  const part = `${file}.part`;
  writeFileSync(part, bytes);
  await renameHeld(part, file);
}

/** One file a film no longer needs: removed with retries (Windows holds a file just written for a moment); one that still
 *  can't go is left — a stray file costs nothing — and false comes back. */
export async function removeFile(file) {
  try {
    await rm(file, { force: true, maxRetries: 10, retryDelay: 100 });
    return true;
  } catch (e) {
    log.warning(`${path.basename(file)} couldn't be removed (${e.code || e.message}); left in place`);
    return false;
  }
}

// the mark a removal Windows held leaves in the folder: only a marked folder is ever swept — a database lost or
// replaced must never take every film's pictures and clips with it (house-paint's lesson, its files.js)
const GONE = ".removed";

/** A film's folder and its exports, removed with the same retries. False when something stayed: the folder is marked
 *  and the next start's sweep (sweepFilmDirs) finishes. */
export async function removeFilmDirs(dataDir, filmId) {
  let all = true;
  for (const dir of [filmDir(dataDir, filmId), exportDir(dataDir, filmId)]) {
    try {
      await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } catch (e) {
      log.warning(`film ${filmId}'s folder couldn't be removed (${e.code || e.message}); tried again at the next start`);
      try {
        writeFileSync(path.join(dir, GONE), "");
      } catch {
        // not even a mark: left
      }
      all = false;
    }
  }
  return all;
}

/** Every film's files (a reset): both roots removed with retries; a folder still held is marked for the next start. */
export async function removeAllFilmDirs(dataDir) {
  let all = true;
  for (const root of [filmsRoot(dataDir), exportsRoot(dataDir)]) {
    for (const name of existsSync(root) ? readdirSync(root) : []) {
      if (!SAFE.test(name)) continue;
      const dir = path.join(root, name);
      try {
        await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      } catch {
        all = false;
        try {
          writeFileSync(path.join(dir, GONE), "");
        } catch {
          // left
        }
      }
    }
  }
  return all;
}

/** At start: the marked folders of films that no longer exist go (`ids` the films that exist). An unmarked folder with
 *  no film stays. Returns how many went. */
export async function sweepFilmDirs(dataDir, ids) {
  const keep = new Set(ids);
  let gone = 0;
  for (const root of [filmsRoot(dataDir), exportsRoot(dataDir)]) {
    for (const name of existsSync(root) ? readdirSync(root) : []) {
      const dir = path.join(root, name);
      if (!SAFE.test(name) || keep.has(name) || !existsSync(path.join(dir, GONE))) continue;
      try {
        await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
        gone++;
      } catch {
        // still held: the next start
      }
    }
  }
  if (gone) log.info(`removed ${gone} folder(s) of deleted films`);
  return gone;
}
