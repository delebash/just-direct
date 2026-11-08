// SPDX-License-Identifier: MIT
// The database layer (app-structure §16): the migrations bring a new file to the newest schema
// and are a no-op the second time; a file newer than the code is refused; the seed is
// insert-if-missing; the stores keep times in ISO UTC and ids random.
import { rmSync } from "node:fs";
import path from "node:path";
import { schemaVersion } from "@delebash/core/platform";
import { afterEach, expect, test } from "vitest";
import { DB_FILE, openAppDatabase } from "../src/database/index.js";
import * as films from "../src/database/films.js";
import { MIGRATIONS } from "../src/database/schema.js";
import { SETTING_DEFAULTS, seedSettings } from "../src/database/seed.js";
import { getSetting, setSetting } from "../src/database/settings.js";
import { tmpDir } from "./helpers.js";

const open = [];
const dirs = [];
afterEach(() => {
  for (const db of open.splice(0)) db.close(); // Windows can't delete an open file
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const fresh = () => {
  const dir = tmpDir();
  dirs.push(dir);
  const db = openAppDatabase(dir);
  open.push(db);
  return { db, dir };
};

test("a new database is migrated to the newest schema, once", () => {
  const { db, dir } = fresh();
  const newest = MIGRATIONS[MIGRATIONS.length - 1].version;
  expect(schemaVersion(db)).toBe(newest);
  expect(db.tableNames()).toEqual(expect.arrayContaining(["settings", "films", "cards", "shots", "frames", "clips", "sounds"]));
  db.close();
  open.pop();
  const again = openAppDatabase(dir); // reopening runs nothing
  open.push(again);
  expect(schemaVersion(again)).toBe(newest);
  expect(path.basename(again.raw.name)).toBe(DB_FILE);
});

test("a database newer than the code is refused", () => {
  const { db, dir } = fresh();
  db.raw.pragma(`user_version = ${MIGRATIONS.length + 1}`);
  db.close();
  open.pop();
  expect(() => openAppDatabase(dir)).toThrow(/newer than this app knows/);
});

test("the seed adds what is missing and never overwrites the user's value", () => {
  const { db } = fresh();
  expect(seedSettings(db)).toBe(Object.keys(SETTING_DEFAULTS).length);
  setSetting(db, "cards.pictureSide", 768);
  expect(seedSettings(db)).toBe(0);
  expect(getSetting(db, "cards.pictureSide")).toBe(768);
});

test("the films store keeps random ids and ISO UTC times; a film's cards and shots go with it", () => {
  const { db } = fresh();
  const a = films.createFilm(db, { title: "One", width: 1280, height: 704 });
  const b = films.createFilm(db, { title: "Two", width: 704, height: 1280 });
  expect(a.id).not.toBe(b.id);
  expect(new Date(a.createdAt).toISOString()).toBe(a.createdAt);
  expect(films.updateFilm(db, "missing", { title: "x" })).toBeNull();
  expect(films.updateFilm(db, a.id, {})).toEqual(a); // nothing to change → unchanged
  // a card moves its film to the top of the list
  const card = films.createCard(db, b.id, { kind: "character", name: "Mara" });
  films.createCard(db, a.id, { kind: "place", name: "The pier" });
  expect(films.listFilms(db).map((f) => [f.title, f.cardCount])).toEqual([
    ["One", 1],
    ["Two", 1],
  ]);
  // the cards by kind, then their own order
  films.createCard(db, b.id, { kind: "prop", name: "Ticket" });
  films.createCard(db, b.id, { kind: "character", name: "Teo" });
  expect(films.listCards(db, b.id).map((c) => [c.kind, c.name, c.position])).toEqual([
    ["character", "Mara", 0],
    ["character", "Teo", 1],
    ["prop", "Ticket", 0],
  ]);
  expect(films.updateCard(db, card.id, { picture: "x.png" }).picture).toBe("x.png");
  expect(films.deleteFilm(db, b.id)).toBe(true);
  expect(films.getCard(db, card.id)).toBeNull(); // cascaded
  expect(films.deleteFilm(db, b.id)).toBe(false);
});
