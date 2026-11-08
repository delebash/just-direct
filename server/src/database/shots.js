// SPDX-License-Identifier: MIT
// The shots store — a film's shots in their order (app-structure §16). `card_ids` is the one JSON column: the cards a
// shot shows are a short list of ids read and written whole with the shot (a join table would add nothing a screen
// or a query needs). A route calls these; they take the open database first and speak the camelCase wire shape.

import { randomUUID } from "node:crypto";
import { touchFilm } from "./films.js";

const now = () => new Date().toISOString();

// what a new shot is written with (the clip's mode, paths and guide take their defaults); what a shot is read with
const INSERT_COLUMNS =
  "id, film_id, position, place_id, card_ids, size, camera, action, line, speaker_id, seconds, transition, edited, frame_id, clip_id, trim_in, trim_out, created_at, updated_at, delivery, emotion";
const COLUMNS = `${INSERT_COLUMNS}, mode, paths, guide_frames`;

/** The fields a shot's content is made of — a change to one is a hand edit (`edited`), which a revision keeps. */
export const CONTENT_FIELDS = Object.freeze(["placeId", "cardIds", "size", "camera", "action", "line", "speakerId", "delivery", "emotion", "seconds", "transition"]);

const FIELD_COLUMNS = {
  placeId: "place_id",
  cardIds: "card_ids",
  size: "size",
  camera: "camera",
  action: "action",
  line: "line",
  speakerId: "speaker_id",
  delivery: "delivery",
  emotion: "emotion",
  seconds: "seconds",
  transition: "transition",
  frameId: "frame_id",
  clipId: "clip_id",
  trimIn: "trim_in",
  trimOut: "trim_out",
  mode: "mode",
  paths: "paths",
  guideFrames: "guide_frames",
};

/** The drawn paths as kept: tracks of {x, y} points in 0..1, anything else dropped. */
function parsePaths(text) {
  try {
    const v = JSON.parse(text || "[]");
    if (!Array.isArray(v)) return [];
    return v
      .filter(Array.isArray)
      .map((track) => track.filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y)).map((p) => ({ x: p.x, y: p.y })))
      .filter((track) => track.length);
  } catch {
    return [];
  }
}

function parseIds(text) {
  try {
    const v = JSON.parse(text || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function fromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    filmId: row.film_id,
    position: row.position,
    placeId: row.place_id ?? null,
    cardIds: parseIds(row.card_ids),
    size: row.size,
    camera: row.camera,
    action: row.action,
    line: row.line,
    speakerId: row.speaker_id ?? null,
    delivery: row.delivery ?? "",
    emotion: row.emotion ?? "",
    seconds: row.seconds,
    transition: row.transition,
    edited: row.edited === 1,
    frameId: row.frame_id ?? null,
    clipId: row.clip_id ?? null,
    trimIn: row.trim_in,
    trimOut: row.trim_out,
    mode: row.mode ?? "auto",
    paths: parsePaths(row.paths),
    guideFrames: row.guide_frames ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const toColumn = (key, value) => (key === "cardIds" ? JSON.stringify([...new Set(value ?? [])]) : key === "paths" ? JSON.stringify(value ?? []) : value);

/** A film's shots in film order. */
export function listShots(db, filmId) {
  return db.all(`SELECT ${COLUMNS} FROM shots WHERE film_id = ? ORDER BY position, created_at, id`, [filmId]).map(fromRow);
}

export function getShot(db, id) {
  return fromRow(db.one(`SELECT ${COLUMNS} FROM shots WHERE id = ?`, [id]));
}

/** Add a shot after `after` (a shot id) or at the end; returns it. A shot added by hand counts as edited. */
export function createShot(db, filmId, shot, { after = null, edited = true } = {}) {
  const id = randomUUID();
  const at = now();
  db.tx(() => {
    const shots = listShots(db, filmId);
    const i = after ? shots.findIndex((s) => s.id === after) + 1 : shots.length;
    const pos = i <= 0 ? shots.length : i;
    // the ones after it move down one
    for (const s of shots.slice(pos)) db.run("UPDATE shots SET position = ? WHERE id = ?", [s.position + 1, s.id]);
    db.run(`INSERT INTO shots (${INSERT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, 0, ?, ?, ?, ?)`, [
      id,
      filmId,
      pos,
      shot.placeId ?? null,
      toColumn("cardIds", shot.cardIds),
      shot.size ?? "",
      shot.camera ?? "",
      shot.action ?? "",
      shot.line ?? "",
      shot.speakerId ?? null,
      shot.seconds,
      shot.transition ?? "cut",
      edited ? 1 : 0,
      at,
      at,
      shot.delivery ?? "",
      shot.emotion ?? "",
    ]);
    touchFilm(db, filmId);
  });
  return getShot(db, id);
}

/** Change a shot's fields; `edited` true when the change is a hand edit of its content (a revision keeps it). */
export function updateShot(db, id, patch, { edited = null } = {}) {
  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(FIELD_COLUMNS)) {
    if (patch[key] === undefined) continue;
    sets.push(`${column} = ?`);
    values.push(toColumn(key, patch[key]));
  }
  if (edited !== null) {
    sets.push("edited = ?");
    values.push(edited ? 1 : 0);
  }
  if (!sets.length) return getShot(db, id);
  sets.push("updated_at = ?");
  values.push(now());
  let shot = null;
  db.tx(() => {
    if (!db.run(`UPDATE shots SET ${sets.join(", ")} WHERE id = ?`, [...values, id]).changes) return;
    shot = getShot(db, id);
    touchFilm(db, shot.filmId);
  });
  return shot;
}

/** Delete a shot (its frames, clips and line go with it); the ones after it move up. False when there was none. */
export function deleteShot(db, id) {
  const shot = getShot(db, id);
  if (!shot) return false;
  db.tx(() => {
    db.run("DELETE FROM shots WHERE id = ?", [id]);
    db.run("UPDATE shots SET position = position - 1 WHERE film_id = ? AND position > ?", [shot.filmId, shot.position]);
    touchFilm(db, shot.filmId);
  });
  return true;
}

/** Put a film's shots in the order of `ids` (every shot of the film, each once); false when `ids` isn't that. */
export function orderShots(db, filmId, ids) {
  const shots = listShots(db, filmId);
  if (ids.length !== shots.length || new Set(ids).size !== ids.length || !shots.every((s) => ids.includes(s.id))) return false;
  db.tx(() => {
    ids.forEach((id, i) => db.run("UPDATE shots SET position = ? WHERE id = ?", [i, id]));
    touchFilm(db, filmId);
  });
  return true;
}

/** Replace a film's shots with `shots` (a plan) — the old ones, their frames, clips and lines go. */
export function replaceShots(db, filmId, shots) {
  const at = now();
  db.tx(() => {
    db.run("DELETE FROM shots WHERE film_id = ?", [filmId]);
    shots.forEach((s, i) => {
      db.run(`INSERT INTO shots (${INSERT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, 0, 0, ?, ?, ?, ?)`, [
        randomUUID(),
        filmId,
        i,
        s.placeId ?? null,
        toColumn("cardIds", s.cardIds),
        s.size ?? "",
        s.camera ?? "",
        s.action ?? "",
        s.line ?? "",
        s.speakerId ?? null,
        s.seconds,
        s.transition ?? "cut",
        at,
        at,
        s.delivery ?? "",
        s.emotion ?? "",
      ]);
    });
    touchFilm(db, filmId);
  });
  return listShots(db, filmId);
}

/** Whether any of a film's shots has a frame or a clip made for it (a new plan would delete them). */
export function shotsHaveWork(db, filmId) {
  return !!db.one(
    "SELECT 1 AS x FROM shots s WHERE s.film_id = ? AND (EXISTS (SELECT 1 FROM frames WHERE shot_id = s.id) OR EXISTS (SELECT 1 FROM clips WHERE shot_id = s.id)) LIMIT 1",
    [filmId],
  );
}

/** A card deleted: it leaves every shot that named it. */
export function dropCardFromShots(db, filmId, cardId) {
  for (const s of listShots(db, filmId)) {
    const patch = {};
    if (s.cardIds.includes(cardId)) patch.cardIds = s.cardIds.filter((id) => id !== cardId);
    if (s.placeId === cardId) patch.placeId = null;
    if (s.speakerId === cardId) patch.speakerId = null;
    if (Object.keys(patch).length) updateShot(db, s.id, patch);
  }
}
