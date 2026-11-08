// SPDX-License-Identifier: MIT
// /v1/shots/:id/frames, /v1/films/:id/frames and /v1/frames — a shot's first frames painted by a fake painter with its
// cards' pictures as references, checked by a fake vision model, the best chosen; a choice by hand; a delete; the files
// going with a shot. And the method's own pieces: the words, the references, the score.
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { beforeEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { getDb, getState } from "../src/app_state.js";
import { seedWorkspace } from "../src/database/seed.js";
import { filmDir } from "../src/files.js";
import { framePrompt, referenceCards, scoreOf } from "../src/frames.js";
import { testClient, tmpDir, useHermeticKit } from "./helpers.js";

useHermeticKit();

const png = (w, h, r = 100) => sharp({ create: { width: w, height: h, channels: 3, background: { r, g: 50, b: 50 } } }).png().toBuffer();

let client;
let dataDir;
let painted;
let checks;
// the check's answers, by seed order; each painting gets the next seed's verdict
let verdicts;
beforeEach(async () => {
  dataDir = tmpDir();
  painted = [];
  checks = [];
  verdicts = [];
  const paintImage = async (feature, request) => {
    // a card's picture is painted with no references
    painted.push({ feature, ...request, refSizes: await Promise.all((request.refs ?? []).map(async (b) => (await sharp(b).metadata()).width)) });
    return png(request.width / 64, request.height / 64, painted.length * 20);
  };
  const run = async (body) => {
    checks.push(body);
    const v = verdicts.shift();
    if (v instanceof Error) throw v;
    return { content: JSON.stringify(v) };
  };
  client = testClient(await createApp(dataDir, { services: { paintImage, run } }));
  seedWorkspace(getDb());
});

async function settle(job) {
  for (let i = 0; i < 300; i++) {
    const r = (await client.get(`/v1/jobs/${job.id}`)).json();
    if (r.state !== "running") return r;
    await new Promise((res) => setTimeout(res, 10));
  }
  throw new Error("the job never ended");
}
const upload = async (cardId, bytes) => {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "image/png" }), "p.png");
  return client.app.request(`http://testserver/v1/cards/${cardId}/picture`, { method: "POST", body: form, headers: { host: "testserver" } });
};

/** A film with Mara (a picture), Teo (none), the pier (a picture), a ticket (a picture), a noir look, and one shot. */
async function scene() {
  const film = (await client.post("/v1/films", { json: { title: "Ferry", look: "moody 35mm film" } })).json();
  const card = async (json, pic) => {
    const c = (await client.post(`/v1/films/${film.id}/cards`, { json })).json();
    if (pic) await upload(c.id, await png(1024, 1024));
    return c;
  };
  const mara = await card({ kind: "character", name: "Mara", description: "sixty-one, grey braid, yellow oilskin coat" }, true);
  const teo = await card({ kind: "character", name: "Teo", description: "eleven, red wool hat" }, false);
  const pier = await card({ kind: "place", name: "Hollow Pier", description: "a wooden pier at dusk" }, true);
  const ticket = await card({ kind: "prop", name: "Ticket", description: "a brass ferry ticket" }, true);
  const noir = await card({ kind: "look", name: "Noir", description: "hard shadows" }, false);
  const shot = (
    await client.post(`/v1/films/${film.id}/shots`, {
      json: { size: "medium", action: "Teo holds up the ticket to Mara", cardIds: [ticket.id, mara.id, teo.id, noir.id], placeId: pier.id, speakerId: teo.id, line: "Is it still good?" },
    })
  ).json();
  return { film, shot, mara, teo, pier, ticket, noir };
}
const verdict = (match, { missing = [], extra = 0 } = {}) => ({
  cards: ["ticket", "mara", "teo", "hollow_pier"].map((card) => ({ card, visible: !missing.includes(card) })),
  extraPeople: extra,
  lettering: false,
  faults: [],
  match,
  note: "ok",
});

describe("a shot's first frames", () => {
  test("painted at the film's size with up to three small references, checked, the best chosen", async () => {
    const { film, shot } = await scene();
    verdicts.push(verdict(6, { extra: 2 }), verdict(8), verdict(9, { missing: ["mara"] }));
    const r = await client.post(`/v1/shots/${shot.id}/frames`, { json: {} });
    expect(r.statusCode).toBe(202);
    const done = await settle(r.json());
    expect(done.state).toBe("done");
    expect(done.result).toMatchObject({ frames: 3, cardsPainted: 1, checked: true, checkSkipped: "" });

    // Teo speaks but had no picture: his card's picture is painted first (a character, 3:4 at the long side's 1024)
    expect(painted).toHaveLength(4);
    expect(painted[0]).toMatchObject({ feature: "cards.paint", width: 768, height: 1024 });
    expect((await client.get(`/v1/films/${film.id}/cards`)).json().items.find((c) => c.name === "Teo").picture).toBeTruthy();
    const frameRuns = painted.slice(1);
    expect(frameRuns[0]).toMatchObject({ feature: "frames.paint", width: film.width, height: film.height });
    // then the frames' references: Teo (who speaks — the fake's tiny picture, kept as it is), Mara, the pier — each at
    // most 512 × 512 (262,144 pixels)
    expect(frameRuns[0].refSizes).toEqual([12, 512, 512]);
    expect(new Set(frameRuns.map((p) => p.seed)).size).toBe(3);
    expect(frameRuns[0].prompt).toBe(
      "A medium shot. Teo holds up the ticket to Mara. Ticket: a brass ferry ticket. Mara: sixty-one, grey braid, yellow oilskin coat. Teo: eleven, red wool hat. Hollow Pier: a wooden pier at dusk. moody 35mm film. hard shadows.",
    );
    // the check saw each frame, with the shot's cards to look for, in the schema built for it
    expect(checks).toHaveLength(3);
    expect(checks[0]).toMatchObject({ action: "frames.check" });
    expect(checks[0].images[0]).toMatch(/^data:image\/png;base64,/);
    expect(JSON.parse(checks[0].jsonSchema).properties.cards.items.properties.card.enum).toEqual(["ticket", "mara", "teo", "hollow_pier"]);

    const items = (await client.get(`/v1/shots/${shot.id}/frames`)).json().items;
    // scores: 6 − 4 = 2 · 8 · 9 − 3 = 6 → the second is best, chosen, listed first
    expect(items.map((f) => f.score)).toEqual([8, 6, 2]);
    expect(items[0]).toMatchObject({ chosen: true, verdict: { match: 8, missing: [], extraPeople: 0 } });
    expect(items[2].verdict).toMatchObject({ extraPeople: 2 });
    expect((await client.get(`/v1/films/${film.id}/shots`)).json().items[0].frameId).toBe(items[0].id);
    const pic = await client.get(items[0].pictureUrl);
    expect(pic.headers["content-type"]).toBe("image/png");
  });

  test("a check that can't run leaves the frames unchecked, says why, and the first is chosen", async () => {
    const { shot } = await scene();
    verdicts.push(Object.assign(new Error("Set up a model that can see pictures."), { title: "No vision model" }));
    const done = await settle((await client.post(`/v1/shots/${shot.id}/frames`, { json: { count: 2 } })).json());
    expect(done.result).toMatchObject({ frames: 2, checked: false, checkSkipped: "No vision model" });
    const items = (await client.get(`/v1/shots/${shot.id}/frames`)).json().items;
    expect(items.map((f) => f.score)).toEqual([null, null]);
    expect(items.filter((f) => f.chosen)).toHaveLength(1);
  });

  test("the check off in Settings: painted, not checked", async () => {
    const { shot } = await scene();
    await client.patch("/v1/settings", { json: { "frames.check": false } });
    const done = await settle((await client.post(`/v1/shots/${shot.id}/frames`, { json: { count: 1 } })).json());
    expect(done.result).toMatchObject({ frames: 1, checked: false, checkSkipped: "" });
    expect(checks).toHaveLength(0);
  });

  test("chosen by hand; another shot's frame refused; a deleted chosen frame hands the choice on", async () => {
    const { film, shot } = await scene();
    verdicts.push(verdict(5), verdict(7));
    await settle((await client.post(`/v1/shots/${shot.id}/frames`, { json: { count: 2 } })).json());
    const [best, other] = (await client.get(`/v1/shots/${shot.id}/frames`)).json().items;
    const r = await client.post(`/v1/shots/${shot.id}/frame`, { json: { frameId: other.id } });
    expect(r.json().frameId).toBe(other.id);
    const shot2 = (await client.post(`/v1/films/${film.id}/shots`, { json: { action: "x" } })).json();
    expect((await client.post(`/v1/shots/${shot2.id}/frame`, { json: { frameId: best.id } })).statusCode).toBe(422);
    expect((await client.delete(`/v1/frames/${other.id}`)).statusCode).toBe(204);
    expect((await client.get(`/v1/films/${film.id}/shots`)).json().items[0].frameId).toBe(best.id);
    expect(readdirSync(path.join(filmDir(dataDir, film.id), "frames"))).toEqual([best.file]);
  });

  test("a deleted shot takes its frames' files with it", async () => {
    const { film, shot } = await scene();
    verdicts.push(verdict(5));
    await settle((await client.post(`/v1/shots/${shot.id}/frames`, { json: { count: 1 } })).json());
    expect(readdirSync(path.join(filmDir(dataDir, film.id), "frames"))).toHaveLength(1);
    expect((await client.delete(`/v1/shots/${shot.id}`)).statusCode).toBe(204);
    expect(readdirSync(path.join(filmDir(dataDir, film.id), "frames"))).toHaveLength(0);
  });
});

test("the film's first frames: every shot without one painted first, then all checked", async () => {
  const { film, shot } = await scene();
  const second = (await client.post(`/v1/films/${film.id}/shots`, { json: { action: "The lake." } })).json();
  await client.patch("/v1/settings", { json: { "frames.candidates": 1 } });
  getDb().run("UPDATE shots SET frame_id = 'kept' WHERE id = ?", [second.id]); // it has one already
  verdicts.push(verdict(7));
  const order = [];
  const { paintImage, run } = getState().services;
  getState().services.paintImage = async (...a) => (order.push("paint"), paintImage(...a));
  getState().services.run = async (...a) => (order.push("check"), run(...a));
  const done = await settle((await client.post(`/v1/films/${film.id}/frames`, { json: {} })).json());
  // Teo's missing picture, then the shot's frame, then its check
  expect(done.result).toEqual({ shots: 1, cardsPainted: 1, checked: 1, checkSkipped: "" });
  expect(order).toEqual(["paint", "paint", "check"]);
  expect(painted.map((p) => p.feature)).toEqual(["cards.paint", "frames.paint"]);
  expect((await client.get(`/v1/films/${film.id}/shots`)).json().items.find((s) => s.id === shot.id).frameId).toBeTruthy();
  expect(existsSync(path.join(filmDir(dataDir, film.id), "frames"))).toBe(true);
});

test("a card that already has its picture, a look, or a card the frames won't take isn't painted again", async () => {
  const { film, teo } = await scene();
  await upload(teo.id, await png(1024, 1024));
  await client.patch("/v1/settings", { json: { "frames.candidates": 1, "frames.check": false } });
  const done = await settle((await client.post(`/v1/films/${film.id}/frames`, { json: {} })).json());
  expect(done.result).toMatchObject({ shots: 1, cardsPainted: 0 });
  expect(painted.map((p) => p.feature)).toEqual(["frames.paint"]);
});

describe("the method", () => {
  const cards = [
    { id: "m", kind: "character", name: "Mara", description: "grey braid", picture: "m.png" },
    { id: "t", kind: "character", name: "Teo", description: "", picture: "t.png" },
    { id: "p", kind: "place", name: "Pier", description: "a pier", picture: "p.png" },
    { id: "k", kind: "prop", name: "Key", description: "a key", picture: "k.png" },
  ];
  test("the speaker's picture first, then the other characters, the place, the props; at most the setting's", () => {
    const shot = { cardIds: ["k", "p", "m", "t"], speakerId: "t" };
    expect(referenceCards(shot, cards, 3).map((c) => c.id)).toEqual(["t", "m", "p"]);
    expect(referenceCards(shot, cards, 0)).toEqual([]);
  });
  test("the words: a missing size or look leaves no stray dot", () => {
    expect(framePrompt("{size} {action} {cards} {look}", { size: "", action: "The pier", cardIds: ["p"] }, cards, { look: "" })).toBe("The pier. Pier: a pier.");
  });
  test("the score: a card not mentioned counts as not seen; extras count to three; faults and lettering cost", () => {
    const { score, verdict: v } = scoreOf({ cards: [{ card: "a", visible: true }], extraPeople: 9, lettering: true, faults: ["doubled object", "nonsense"], match: 10, note: "x" }, ["a", "b"]);
    expect(v).toMatchObject({ missing: ["b"], extraPeople: 9, faults: ["doubled object"] });
    expect(score).toBe(10 - 3 - 6 - 2 - 1.5);
  });
});
