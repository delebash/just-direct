// SPDX-License-Identifier: MIT
// The frames store — the first frames painted for a shot, each with what the vision check said of it (app-structure
// §16). `verdict` is the check's answer as it came (JSON): it is read whole, shown whole, never queried.

import { randomUUID } from "node:crypto";

const now = () => new Date().toISOString();
const COLUMNS = "id, shot_id, file, seed, score, verdict, created_at";

function fromRow(row) {
  if (!row) return null;
  let verdict = null;
  try {
    verdict = row.verdict ? JSON.parse(row.verdict) : null;
  } catch {
    verdict = null;
  }
  return { id: row.id, shotId: row.shot_id, file: row.file, seed: row.seed, score: row.score ?? null, verdict, createdAt: row.created_at };
}

/** A shot's frames: the best checked first, then the newest. */
export function listFrames(db, shotId) {
  return db.all(`SELECT ${COLUMNS} FROM frames WHERE shot_id = ? ORDER BY score IS NULL, score DESC, created_at DESC, id`, [shotId]).map(fromRow);
}

export function getFrame(db, id) {
  return fromRow(db.one(`SELECT ${COLUMNS} FROM frames WHERE id = ?`, [id]));
}

export function addFrame(db, { id = randomUUID(), shotId, file, seed }) {
  db.run(`INSERT INTO frames (${COLUMNS}) VALUES (?, ?, ?, ?, NULL, NULL, ?)`, [id, shotId, file, seed, now()]);
  return getFrame(db, id);
}

export function setVerdict(db, id, { score, verdict }) {
  db.run("UPDATE frames SET score = ?, verdict = ? WHERE id = ?", [score, verdict ? JSON.stringify(verdict) : null, id]);
  return getFrame(db, id);
}

export function deleteFrame(db, id) {
  return db.run("DELETE FROM frames WHERE id = ?", [id]).changes > 0;
}

/** Every frame file of a film's shots (for the files a deleted shot or a new plan leaves). */
export const frameFiles = (db, shotIds) =>
  shotIds.length ? db.all(`SELECT file FROM frames WHERE shot_id IN (${shotIds.map(() => "?").join(", ")})`, shotIds).map((r) => r.file) : [];
