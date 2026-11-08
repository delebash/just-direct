// SPDX-License-Identifier: MIT
// The films and cards store — with the other stores the only code that writes SQL (app-structure §16). A route calls
// these; they take the open database first and speak the camelCase wire shape.

import { randomUUID } from "node:crypto";

const now = () => new Date().toISOString();

const FILM_COLUMNS = "id, title, story, look, width, height, created_at, updated_at";
const CARD_COLUMNS = "id, film_id, kind, name, description, voice, picture, position, created_at, updated_at, voice_sample, voice_sample_text";

/** The kinds of card, in the order the screens show them. */
export const CARD_KINDS = Object.freeze(["character", "place", "prop", "look"]);

function filmFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    story: row.story,
    look: row.look,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function cardFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    filmId: row.film_id,
    kind: row.kind,
    name: row.name,
    description: row.description,
    voice: row.voice,
    voiceSample: row.voice_sample ?? null,
    voiceSampleText: row.voice_sample_text ?? "",
    picture: row.picture ?? null,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** A patch's known fields as SQL `SET` parts: `fields` maps a wire name to its column (and an optional value change). */
function setsOf(patch, fields) {
  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(fields)) {
    if (patch[key] === undefined) continue;
    sets.push(`${column} = ?`);
    values.push(patch[key]);
  }
  return { sets, values };
}

// ── films ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Every film, the most recently changed first, with how many cards and shots it has. */
export function listFilms(db) {
  return db
    .all(
      `SELECT ${FILM_COLUMNS.split(", ").map((c) => `f.${c}`).join(", ")},
         (SELECT COUNT(*) FROM cards WHERE film_id = f.id) AS card_count,
         (SELECT COUNT(*) FROM shots WHERE film_id = f.id) AS shot_count
       FROM films f ORDER BY f.updated_at DESC, f.id`,
    )
    .map((r) => ({ ...filmFromRow(r), cardCount: r.card_count, shotCount: r.shot_count }));
}

export function getFilm(db, id) {
  return filmFromRow(db.one(`SELECT ${FILM_COLUMNS} FROM films WHERE id = ?`, [id]));
}

export function createFilm(db, { title, story = "", look = "", width, height }) {
  const id = randomUUID();
  const at = now();
  db.run(`INSERT INTO films (${FILM_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [id, title, story, look, width, height, at, at]);
  return getFilm(db, id);
}

export function updateFilm(db, id, patch) {
  const { sets, values } = setsOf(patch, { title: "title", story: "story", look: "look", width: "width", height: "height" });
  if (!sets.length) return getFilm(db, id);
  sets.push("updated_at = ?");
  values.push(now());
  const { changes } = db.run(`UPDATE films SET ${sets.join(", ")} WHERE id = ?`, [...values, id]);
  return changes ? getFilm(db, id) : null;
}

/** A film changed by something inside it (a card, a shot): it moves to the top of the list. */
export function touchFilm(db, id) {
  db.run("UPDATE films SET updated_at = ? WHERE id = ?", [now(), id]);
}

/** Delete a film and everything in it (the foreign keys cascade); false when there was none. */
export function deleteFilm(db, id) {
  return db.run("DELETE FROM films WHERE id = ?", [id]).changes > 0;
}

export const filmIds = (db) => db.all("SELECT id FROM films").map((r) => r.id);

// ── cards ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** A film's cards: by kind (CARD_KINDS' order), then their own order. */
export function listCards(db, filmId) {
  const order = `CASE kind ${CARD_KINDS.map((k, i) => `WHEN '${k}' THEN ${i}`).join(" ")} END`;
  return db.all(`SELECT ${CARD_COLUMNS} FROM cards WHERE film_id = ? ORDER BY ${order}, position, id`, [filmId]).map(cardFromRow);
}

export function getCard(db, id) {
  return cardFromRow(db.one(`SELECT ${CARD_COLUMNS} FROM cards WHERE id = ?`, [id]));
}

/** Add a card at the end of its kind; returns it. */
export function createCard(db, filmId, { kind, name, description = "", voice = "" }) {
  const id = randomUUID();
  const at = now();
  const { n } = db.one("SELECT COALESCE(MAX(position), -1) + 1 AS n FROM cards WHERE film_id = ? AND kind = ?", [filmId, kind]);
  db.tx(() => {
    db.run(`INSERT INTO cards (${CARD_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, '')`, [id, filmId, kind, name, description, voice, n, at, at]);
    touchFilm(db, filmId);
  });
  return getCard(db, id);
}

export function updateCard(db, id, patch) {
  const { sets, values } = setsOf(patch, {
    name: "name",
    description: "description",
    voice: "voice",
    picture: "picture",
    voiceSample: "voice_sample",
    voiceSampleText: "voice_sample_text",
  });
  if (!sets.length) return getCard(db, id);
  sets.push("updated_at = ?");
  values.push(now());
  let card = null;
  db.tx(() => {
    if (!db.run(`UPDATE cards SET ${sets.join(", ")} WHERE id = ?`, [...values, id]).changes) return;
    card = getCard(db, id);
    touchFilm(db, card.filmId);
  });
  return card;
}

export function deleteCard(db, id) {
  const card = getCard(db, id);
  if (!card) return false;
  db.tx(() => {
    db.run("DELETE FROM cards WHERE id = ?", [id]);
    touchFilm(db, card.filmId);
  });
  return true;
}

/** Every picture file a film's cards name (the start's sweep keeps these). */
export const cardPictures = (db, filmId) =>
  db
    .all("SELECT picture FROM cards WHERE film_id = ? AND picture IS NOT NULL", [filmId])
    .map((r) => r.picture);
