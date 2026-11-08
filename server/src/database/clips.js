// SPDX-License-Identifier: MIT
// The clips store — the clips made for a shot, and how each was made (app-structure §16). `recipe` is the request's
// settings as they were sent (JSON): read whole and shown, never queried.

import { randomUUID } from "node:crypto";

const now = () => new Date().toISOString();
const COLUMNS = "id, shot_id, file, seed, seconds, recipe, created_at";

function fromRow(row) {
  if (!row) return null;
  let recipe = {};
  try {
    recipe = JSON.parse(row.recipe || "{}");
  } catch {
    recipe = {};
  }
  return { id: row.id, shotId: row.shot_id, file: row.file, seed: row.seed, seconds: row.seconds, recipe, createdAt: row.created_at };
}

/** A shot's clips, the newest first. */
export function listClips(db, shotId) {
  return db.all(`SELECT ${COLUMNS} FROM clips WHERE shot_id = ? ORDER BY created_at DESC, id`, [shotId]).map(fromRow);
}

export function getClip(db, id) {
  return fromRow(db.one(`SELECT ${COLUMNS} FROM clips WHERE id = ?`, [id]));
}

export function addClip(db, { id = randomUUID(), shotId, file, seed, seconds, recipe }) {
  db.run(`INSERT INTO clips (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?)`, [id, shotId, file, seed, seconds, JSON.stringify(recipe ?? {}), now()]);
  return getClip(db, id);
}

export function deleteClip(db, id) {
  return db.run("DELETE FROM clips WHERE id = ?", [id]).changes > 0;
}

/** Every clip file of these shots (for the files a deleted shot or a new plan leaves). */
export const clipFiles = (db, shotIds) =>
  shotIds.length ? db.all(`SELECT file FROM clips WHERE shot_id IN (${shotIds.map(() => "?").join(", ")})`, shotIds).map((r) => r.file) : [];
