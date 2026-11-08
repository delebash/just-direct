// SPDX-License-Identifier: MIT
// The sounds store — a shot's spoken line, and the music and effects placed in the film's cut (app-structure §16).

import { randomUUID } from "node:crypto";

const now = () => new Date().toISOString();
const COLUMNS = "id, film_id, shot_id, kind, prompt, file, seconds, start, volume, created_at";

function fromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    filmId: row.film_id,
    shotId: row.shot_id ?? null,
    kind: row.kind,
    prompt: row.prompt,
    file: row.file,
    seconds: row.seconds,
    start: row.start,
    volume: row.volume,
    createdAt: row.created_at,
  };
}

/** A film's sounds: its music and effects in the order they start, then the lines. */
export function listSounds(db, filmId) {
  return db.all(`SELECT ${COLUMNS} FROM sounds WHERE film_id = ? ORDER BY kind = 'line', start, created_at, id`, [filmId]).map(fromRow);
}

export function getSound(db, id) {
  return fromRow(db.one(`SELECT ${COLUMNS} FROM sounds WHERE id = ?`, [id]));
}

/** A shot's spoken line (the newest made), or null. */
export function lineOf(db, shotId) {
  return fromRow(db.one(`SELECT ${COLUMNS} FROM sounds WHERE shot_id = ? AND kind = 'line' ORDER BY created_at DESC, id LIMIT 1`, [shotId]));
}

export function addSound(db, { id = randomUUID(), filmId, shotId = null, kind, prompt = "", file, seconds, start = 0, volume = 1 }) {
  db.run(`INSERT INTO sounds (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, filmId, shotId, kind, prompt, file, seconds, start, volume, now()]);
  return getSound(db, id);
}

export function updateSound(db, id, { start, volume }) {
  const sets = [];
  const values = [];
  if (start !== undefined) {
    sets.push("start = ?");
    values.push(start);
  }
  if (volume !== undefined) {
    sets.push("volume = ?");
    values.push(volume);
  }
  if (sets.length) db.run(`UPDATE sounds SET ${sets.join(", ")} WHERE id = ?`, [...values, id]);
  return getSound(db, id);
}

export function deleteSound(db, id) {
  return db.run("DELETE FROM sounds WHERE id = ?", [id]).changes > 0;
}

/** Every sound file of these shots (for the files a deleted shot or a new plan leaves). */
export const soundFiles = (db, shotIds) =>
  shotIds.length ? db.all(`SELECT file FROM sounds WHERE shot_id IN (${shotIds.map(() => "?").join(", ")})`, shotIds).map((r) => r.file) : [];
