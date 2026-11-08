// SPDX-License-Identifier: MIT
// /v1/films and /v1/cards — each route's happy path, a 422 from its schema and a refusal (app-structure §18); a card's
// picture added from a file and painted by a fake painter (the real one is the kit's image feature); a film's files
// going with it and coming back with a backup.
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { pictureSize, picturePrompt } from "../src/api/films_api.js";
import { createApp } from "../src/app.js";
import { getDb, getState } from "../src/app_state.js";
import { SETTING_DEFAULTS, seedWorkspace } from "../src/database/seed.js";
import { filmDir } from "../src/files.js";
import { testClient, tmpDir, useHermeticKit } from "./helpers.js";

useHermeticKit();

const png = (w = 8, h = 8, rgb = { r: 200, g: 40, b: 40 }) => sharp({ create: { width: w, height: h, channels: 3, background: rgb } }).png().toBuffer();

let client;
let dataDir;
let painted;
beforeEach(async () => {
  dataDir = tmpDir();
  painted = [];
  const paintImage = vi.fn(async (feature, request, { onProgress }) => {
    painted.push({ feature, ...request });
    onProgress?.({ fraction: 0.5 });
    return png(request.width / 64, request.height / 64);
  });
  client = testClient(await createApp(dataDir, { services: { paintImage } }));
  seedWorkspace(getDb());
});

const newFilm = async (json = { title: "The Last Ferry" }) => {
  const r = await client.post("/v1/films", { json });
  expect(r.statusCode).toBe(201);
  return r.json();
};
const newCard = async (filmId, json) => {
  const r = await client.post(`/v1/films/${filmId}/cards`, { json });
  expect(r.statusCode).toBe(201);
  return r.json();
};
/** Wait for a job to end; its last snapshot. */
async function settle(job) {
  for (let i = 0; i < 200; i++) {
    const r = (await client.get(`/v1/jobs/${job.id}`)).json();
    if (r.state !== "running") return r;
    await new Promise((res) => setTimeout(res, 10));
  }
  throw new Error("the job never ended");
}
const upload = (cardId, bytes, name = "pic.png", type = "image/png") => {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type }), name);
  return client.app.request(`http://testserver/v1/cards/${cardId}/picture`, { method: "POST", body: form, headers: { host: "testserver" } });
};

describe("films", () => {
  test("a new film takes the size setting, has a version and a folder of its own", async () => {
    const film = await newFilm();
    expect(film).toMatchObject({ title: "The Last Ferry", story: "", look: "", width: SETTING_DEFAULTS["films.width"], height: SETTING_DEFAULTS["films.height"] });
    expect(film.version).toMatch(/^"/);
    expect(existsSync(path.join(filmDir(dataDir, film.id), "cards"))).toBe(true);
    const portrait = await newFilm({ title: "Tall", width: 704, height: 1280 });
    expect([portrait.width, portrait.height]).toEqual([704, 1280]);
  });

  test("a size that isn't a step of 64, an empty title and an unknown field are 422s", async () => {
    const bad = await client.post("/v1/films", { json: { title: "x", width: 1000 } });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().errors[0].loc).toEqual(["body", "width"]);
    expect((await client.post("/v1/films", { json: { title: "" } })).json().errors[0]).toMatchObject({ loc: ["body", "title"], type: "string_too_short" });
    expect((await client.post("/v1/films", { json: { title: "x", colour: "red" } })).json().errors[0].type).toBe("extra_forbidden");
  });

  test("the list is the most recently changed first, with card and shot counts", async () => {
    const a = await newFilm({ title: "A" });
    await newFilm({ title: "B" });
    await newCard(a.id, { kind: "character", name: "Mara" });
    const items = (await client.get("/v1/films")).json().items;
    expect(items.map((f) => [f.title, f.cardCount, f.shotCount])).toEqual([
      ["A", 1, 0],
      ["B", 0, 0],
    ]);
  });

  test("a change made on another version is refused 412; a missing film is 404", async () => {
    const film = await newFilm();
    const ok = await client.patch(`/v1/films/${film.id}`, { json: { story: "Mara runs the last ferry." }, headers: { "if-match": film.version } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().story).toBe("Mara runs the last ferry.");
    const stale = await client.patch(`/v1/films/${film.id}`, { json: { title: "x" }, headers: { "if-match": film.version } });
    expect(stale.statusCode).toBe(412);
    expect(stale.json().type).toMatch(/film-changed$/);
    expect((await client.get("/v1/films/no-such-film")).statusCode).toBe(404);
    expect((await client.patch("/v1/films/no-such-film", { json: { title: "x" } })).statusCode).toBe(404);
  });

  test("a deleted film takes its cards and its folder with it", async () => {
    const film = await newFilm();
    const card = await newCard(film.id, { kind: "prop", name: "Ticket" });
    expect((await upload(card.id, await png())).status).toBe(200);
    expect((await client.delete(`/v1/films/${film.id}`)).statusCode).toBe(204);
    expect(existsSync(filmDir(dataDir, film.id))).toBe(false);
    expect((await client.patch(`/v1/cards/${card.id}`, { json: { name: "x" } })).statusCode).toBe(404);
    expect((await client.delete(`/v1/films/${film.id}`)).statusCode).toBe(404);
  });
});

describe("cards", () => {
  test("cards come by kind, then their own order; a kind that isn't one is a 422", async () => {
    const film = await newFilm();
    await newCard(film.id, { kind: "prop", name: "Ticket", description: "A brass ferry ticket from 1974" });
    await newCard(film.id, { kind: "character", name: "Mara", voice: "a low, weathered woman's voice" });
    await newCard(film.id, { kind: "place", name: "Hollow Pier" });
    const items = (await client.get(`/v1/films/${film.id}/cards`)).json().items;
    expect(items.map((c) => [c.kind, c.name])).toEqual([
      ["character", "Mara"],
      ["place", "Hollow Pier"],
      ["prop", "Ticket"],
    ]);
    expect(items[0]).toMatchObject({ voice: "a low, weathered woman's voice", picture: null, pictureUrl: null });
    const bad = await client.post(`/v1/films/${film.id}/cards`, { json: { kind: "monster", name: "x" } });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().errors[0].loc).toEqual(["body", "kind"]);
    expect((await client.post("/v1/films/nope/cards", { json: { kind: "prop", name: "x" } })).statusCode).toBe(404);
  });

  test("a card's change is versioned; a delete takes its picture file", async () => {
    const film = await newFilm();
    const card = await newCard(film.id, { kind: "character", name: "Mara" });
    const changed = await client.patch(`/v1/cards/${card.id}`, { json: { description: "Sixty-one, grey braid, yellow oilskin coat" }, headers: { "if-match": card.version } });
    expect(changed.statusCode).toBe(200);
    expect((await client.patch(`/v1/cards/${card.id}`, { json: { name: "x" }, headers: { "if-match": card.version } })).statusCode).toBe(412);
    expect((await upload(card.id, await png())).status).toBe(200);
    expect(readdirSync(path.join(filmDir(dataDir, film.id), "cards"))).toHaveLength(1);
    expect((await client.delete(`/v1/cards/${card.id}`)).statusCode).toBe(204);
    expect(readdirSync(path.join(filmDir(dataDir, film.id), "cards"))).toHaveLength(0);
  });

  test("a picture from a file: turned into a PNG, a new address each time, the old file gone; not a picture is 415", async () => {
    const film = await newFilm();
    const card = await newCard(film.id, { kind: "place", name: "Hollow Pier" });
    const jpeg = await sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 0, g: 0, b: 255 } } }).jpeg().toBuffer();
    const first = await upload(card.id, jpeg, "pier.jpg", "image/jpeg");
    expect(first.status).toBe(200);
    const one = await first.json();
    expect(one.pictureUrl).toMatch(new RegExp(`^/v1/cards/${card.id}/picture\\?v=`));
    const got = await client.get(one.pictureUrl);
    expect(got.headers["content-type"]).toBe("image/png");
    expect((await sharp(got.rawPayload).metadata()).width).toBe(40);
    const two = await (await upload(card.id, await png())).json();
    expect(two.pictureUrl).not.toBe(one.pictureUrl);
    expect(readdirSync(path.join(filmDir(dataDir, film.id), "cards"))).toEqual([two.picture]);
    const notPicture = await upload(card.id, Buffer.from("hello"), "a.txt", "text/plain");
    expect(notPicture.status).toBe(415);
    // and taken off again
    const off = await client.delete(`/v1/cards/${card.id}/picture`);
    expect(off.json().pictureUrl).toBeNull();
    expect(readdirSync(path.join(filmDir(dataDir, film.id), "cards"))).toEqual([]);
    expect((await client.get(`/v1/cards/${card.id}/picture`)).statusCode).toBe(404);
  });

  test("a picture over the size setting is refused 413", async () => {
    const film = await newFilm();
    const card = await newCard(film.id, { kind: "prop", name: "Ticket" });
    await client.patch("/v1/settings", { json: { "cards.maxPictureMegabytes": 1 } });
    const big = Buffer.alloc(1024 * 1024 + 10, 1);
    expect((await upload(card.id, big)).status).toBe(413);
  });

  test("Paint: a job that paints the picture from the kind's words at the kind's shape, and gives the card back", async () => {
    const film = await newFilm({ title: "Ferry", look: "moody 35mm film, overcast" });
    const mara = await newCard(film.id, { kind: "character", name: "Mara", description: "sixty-one, small and wiry, grey braid, yellow oilskin coat" });
    const r = await client.post(`/v1/cards/${mara.id}/paint`, { json: {} });
    expect(r.statusCode).toBe(202);
    const done = await settle(r.json());
    expect(done.state).toBe("done");
    expect(done.result.pictureUrl).toMatch(/picture\?v=/);
    expect(painted).toHaveLength(1);
    expect(painted[0]).toMatchObject({ feature: "cards.paint", width: 768, height: 1024 });
    expect(painted[0].prompt).toMatch(/^A full-length photograph of Mara: sixty-one, small and wiry, grey braid, yellow oilskin coat\. Standing/);
    expect(Number.isInteger(painted[0].seed)).toBe(true);
    // a place takes the film's shape and its look; a seed given repeats one
    const pier = await newCard(film.id, { kind: "place", name: "Hollow Pier", description: "A wooden pier at dusk on a grey lake" });
    await settle((await client.post(`/v1/cards/${pier.id}/paint`, { json: { seed: 7 } })).json());
    expect(painted[1]).toMatchObject({ width: 1024, height: 576, seed: 7 });
    expect(painted[1].prompt).toBe("A wooden pier at dusk on a grey lake. A wide photograph of the place, with no people in it. moody 35mm film, overcast");
  });

  test("Paint on a card deleted while it paints leaves no file; a painter's refusal fails the job with its words", async () => {
    const film = await newFilm();
    const card = await newCard(film.id, { kind: "prop", name: "Ticket" });
    getState().services.paintImage = async () => {
      getDb().run("DELETE FROM cards WHERE id = ?", [card.id]);
      return png();
    };
    const gone = await settle((await client.post(`/v1/cards/${card.id}/paint`, { json: {} })).json());
    expect(gone.state).toBe("error");
    expect(readdirSync(path.join(filmDir(dataDir, film.id), "cards"))).toEqual([]);
    const other = await newCard(film.id, { kind: "prop", name: "Thermos" });
    getState().services.paintImage = async () => {
      const e = new Error("install the image engine first");
      e.title = "The image engine isn't installed";
      throw e;
    };
    const refused = await settle((await client.post(`/v1/cards/${other.id}/paint`, { json: {} })).json());
    expect(refused.error).toMatchObject({ title: "The image engine isn't installed" });
  });
});

describe("the picture's words and shape", () => {
  const film = { width: 1280, height: 704, look: "" };
  test("each kind's shape, on steps of 64", () => {
    expect(pictureSize("character", film, 1024)).toEqual({ width: 768, height: 1024 });
    expect(pictureSize("prop", film, 1024)).toEqual({ width: 1024, height: 1024 });
    expect(pictureSize("place", film, 1024)).toEqual({ width: 1024, height: 576 });
    expect(pictureSize("look", { width: 704, height: 1280 }, 1024)).toEqual({ width: 576, height: 1024 });
  });
  test("the template filled in; an empty look leaves no stray space or dot", () => {
    expect(picturePrompt("{description}. A wide photograph. {look}", { name: "Pier", description: "A pier" }, film)).toBe("A pier. A wide photograph.");
    expect(picturePrompt("{description}.", { name: "Pier", description: "" }, film)).toBe("Pier.");
  });
});

test("a backup carries the films' pictures, and a restore brings them back", async () => {
  const film = await newFilm();
  const card = await newCard(film.id, { kind: "prop", name: "Ticket" });
  const withPicture = await (await upload(card.id, await png(16, 16))).json();
  const backup = await client.get("/v1/data/backup");
  expect((await client.delete(`/v1/films/${film.id}`)).statusCode).toBe(204);
  const form = new FormData();
  form.append("file", new Blob([backup.rawPayload], { type: "application/zip" }), "backup.zip");
  const restored = await client.app.request("http://testserver/v1/data/restore", { method: "POST", body: form, headers: { host: "testserver" } });
  expect(restored.status).toBe(200);
  const got = await client.get(withPicture.pictureUrl);
  expect(got.statusCode).toBe(200);
  expect((await sharp(got.rawPayload).metadata()).width).toBe(16);
});
