// SPDX-License-Identifier: MIT
// /v1/films/:id/shots, /v1/shots and the planner — each route's happy path, a 422 and a refusal (app-structure §18); a
// plan made by a fake model (the real one is the kit's runAction on the planner's thinking preset): its passes, the
// schemas each run sends, the repair of what comes back; a hand edit marked and carried into the later shots.
import { beforeEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { getDb, getState } from "../src/app_state.js";
import { seedWorkspace } from "../src/database/seed.js";
import { cardRefs, newCards, plannedVoice, shotFrom } from "../src/planner.js";
import { testClient, tmpDir, useHermeticKit } from "./helpers.js";

useHermeticKit();

let client;
let runs;
let answers;
beforeEach(async () => {
  runs = [];
  answers = [];
  const run = async (body) => {
    runs.push(body);
    const next = answers.shift();
    if (next instanceof Error) throw next;
    return { content: typeof next === "string" ? next : JSON.stringify(next) };
  };
  client = testClient(await createApp(tmpDir(), { services: { run } }));
  seedWorkspace(getDb());
});

const STORY = "Mara Voss runs the last ferry on Lake Orsa. A boy, Teo, arrives at Hollow Pier with a brass ticket from 1974.";
const newFilm = async (json = { title: "The Last Ferry", story: STORY }) => (await client.post("/v1/films", { json })).json();
const newCard = async (filmId, json) => (await client.post(`/v1/films/${filmId}/cards`, { json })).json();
const listShots = async (filmId) => (await client.get(`/v1/films/${filmId}/shots`)).json().items;
async function settle(job) {
  for (let i = 0; i < 200; i++) {
    const r = (await client.get(`/v1/jobs/${job.id}`)).json();
    if (r.state !== "running") return r;
    await new Promise((res) => setTimeout(res, 10));
  }
  throw new Error("the job never ended");
}

describe("shots by hand", () => {
  test("added at the end or after a shot, in order; a change to content marks it edited, a trim doesn't", async () => {
    const film = await newFilm();
    const a = (await client.post(`/v1/films/${film.id}/shots`, { json: { action: "The pier at dusk.", size: "wide", seconds: 5 } })).json();
    const c = (await client.post(`/v1/films/${film.id}/shots`, { json: { action: "Teo runs up." } })).json();
    const b = (await client.post(`/v1/films/${film.id}/shots`, { json: { action: "Mara paints.", after: a.id } })).json();
    expect((await listShots(film.id)).map((s) => s.action)).toEqual(["The pier at dusk.", "Mara paints.", "Teo runs up."]);
    expect(c).toMatchObject({ seconds: 4, transition: "cut", edited: true });
    // a planned shot isn't edited until someone changes what it shows
    getDb().run("UPDATE shots SET edited = 0");
    const trimmed = await client.patch(`/v1/shots/${b.id}`, { json: { trimIn: 0.5 } });
    expect(trimmed.json()).toMatchObject({ trimIn: 0.5, edited: false });
    const changed = await client.patch(`/v1/shots/${b.id}`, { json: { action: "Mara paints over the boat's name." }, headers: { "if-match": trimmed.json().version } });
    expect(changed.json()).toMatchObject({ edited: true });
    expect((await client.patch(`/v1/shots/${b.id}`, { json: { line: "x" }, headers: { "if-match": trimmed.json().version } })).statusCode).toBe(412);
  });

  test("the cards a shot names must be the film's: its place a place, its speaker a character", async () => {
    const film = await newFilm();
    const mara = await newCard(film.id, { kind: "character", name: "Mara" });
    const pier = await newCard(film.id, { kind: "place", name: "Hollow Pier" });
    const ok = await client.post(`/v1/films/${film.id}/shots`, { json: { placeId: pier.id, cardIds: [mara.id, pier.id], speakerId: mara.id, line: "Last crossing." } });
    expect(ok.statusCode).toBe(201);
    const wrong = await client.post(`/v1/films/${film.id}/shots`, { json: { placeId: mara.id } });
    expect(wrong.statusCode).toBe(422);
    expect(wrong.json().errors[0].loc).toEqual(["body", "placeId"]);
    expect((await client.post(`/v1/films/${film.id}/shots`, { json: { cardIds: ["nope"] } })).json().errors[0].loc).toEqual(["body", "cardIds"]);
    expect((await client.post(`/v1/films/${film.id}/shots`, { json: { seconds: 20 } })).statusCode).toBe(422);
    // a card deleted leaves the shots that named it
    await client.delete(`/v1/cards/${mara.id}`);
    expect((await listShots(film.id))[0]).toMatchObject({ cardIds: [pier.id], speakerId: null });
  });

  test("reordered only with every shot once; a deleted shot closes the gap", async () => {
    const film = await newFilm();
    const ids = [];
    for (const action of ["one", "two", "three"]) ids.push((await client.post(`/v1/films/${film.id}/shots`, { json: { action } })).json().id);
    const r = await client.post(`/v1/films/${film.id}/shots/order`, { json: { ids: [ids[2], ids[0], ids[1]] } });
    expect(r.json().items.map((s) => s.action)).toEqual(["three", "one", "two"]);
    expect((await client.post(`/v1/films/${film.id}/shots/order`, { json: { ids: [ids[0], ids[1]] } })).statusCode).toBe(422);
    expect((await client.delete(`/v1/shots/${ids[2]}`)).statusCode).toBe(204);
    expect((await listShots(film.id)).map((s) => [s.action, s.position])).toEqual([
      ["one", 0],
      ["two", 1],
    ]);
    expect((await client.delete(`/v1/shots/${ids[2]}`)).statusCode).toBe(404);
  });
});

describe("the planner", () => {
  const plan = (filmId, json = {}) => client.post(`/v1/films/${filmId}/plan`, { json });

  test("a plan: the cards the story needs, then the shots — each run with its own schema, the answer repaired", async () => {
    const film = await newFilm();
    // the user's own card is kept and never made again
    const mine = await newCard(film.id, { kind: "character", name: "Mara", description: "Sixty-one, grey braid, yellow oilskin coat" });
    answers.push(
      {
        cards: [
          { kind: "character", name: "mara", description: "a ferry captain", voice: "dry" }, // the film has her: dropped
          { kind: "character", name: "Teo", description: "eleven, thin, red wool hat", voice: "a boy's quick voice" },
          { kind: "place", name: "Hollow Pier", description: "a wooden pier at dusk", voice: "should be dropped" },
          { kind: "prop", name: "Brass ticket", description: "a brass ferry ticket from 1974", voice: "" },
        ],
      },
      {
        shots: [
          { place: "hollow_pier", cards: ["hollow_pier"], size: "wide", camera: "static", action: "Rain starts over Hollow Pier as Mara paints over the boat's name.", line: "", speaker: "", seconds: 5, transition: "fade" },
          { place: "hollow_pier", cards: ["teo"], size: "medium", camera: "handheld", action: "Teo runs up, out of breath, and holds up the Brass ticket.", line: "Is this still good? It was my grandfather's, from nineteen seventy-four.", speaker: "teo", seconds: 2, transition: "cut" },
        ],
      },
    );
    const r = await plan(film.id);
    expect(r.statusCode).toBe(202);
    const done = await settle(r.json());
    expect(done.state).toBe("done");
    expect(done.result).toEqual({ cardsAdded: 3, shots: 2 });

    // the passes: the cards with what the film has, then the shots with every card; both in JSON, their own schema
    expect(runs.map((x) => x.action)).toEqual(["plan.cards", "plan.shots"]);
    expect(runs[0].variables.cards).toContain('"card":"mara"');
    expect(runs[1].variables.maxShots).toBe(24);
    expect(runs[1].maxTokens).toBe(12000);
    // the cards pass: a character must carry its voice words, no other card any (two shapes, the model picks one)
    const [character, other] = JSON.parse(runs[0].jsonSchema).properties.cards.items.anyOf;
    expect(character.properties.kind.enum).toEqual(["character"]);
    expect(character.properties.voice.minLength).toBe(10);
    expect(other.properties.kind.enum).toEqual(["place", "prop", "look"]);
    expect(other.properties.voice.enum).toEqual([""]);
    // the shots pass: a shot with a line, or one without
    const [talking, silent] = JSON.parse(runs[1].jsonSchema).properties.shots.items.anyOf;
    for (const shape of [talking, silent]) {
      expect(shape.properties.cards.items.enum).toEqual(["mara", "teo", "hollow_pier", "brass_ticket"]);
      expect(shape.properties.place.enum).toEqual(["hollow_pier", ""]);
      expect(shape.required).toEqual(Object.keys(shape.properties));
    }
    // with a line: who says it (a character), how in words, and one of JustVoice's emotion labels — none of them empty
    expect(talking.properties.line.minLength).toBe(1);
    expect(talking.properties.speaker.enum).toEqual(["mara", "teo"]);
    expect(talking.properties.delivery.minLength).toBe(3);
    expect(talking.properties.emotion.enum).toEqual(["neutral", "happy", "sad", "angry", "fearful", "whispered", "shouted", "sarcastic", "contemptuous"]);
    // without: none of them
    for (const k of ["line", "speaker", "delivery", "emotion"]) expect(silent.properties[k].enum).toEqual([""]);

    const cards = (await client.get(`/v1/films/${film.id}/cards`)).json().items;
    expect(cards.map((c) => [c.kind, c.name])).toEqual([
      ["character", "Mara"],
      ["character", "Teo"],
      ["place", "Hollow Pier"],
      ["prop", "Brass ticket"],
    ]);
    expect(cards.find((c) => c.name === "Mara").description).toBe(mine.description); // never overwritten
    expect(cards.find((c) => c.name === "Hollow Pier").voice).toBe(""); // only a character speaks
    const id = Object.fromEntries(cards.map((c) => [c.name, c.id]));
    const shots = await listShots(film.id);
    expect(shots).toHaveLength(2);
    // the card its words name but its list missed (Mara in shot 1, the ticket in shot 2), the speaker among them
    expect(new Set(shots[0].cardIds)).toEqual(new Set([id["Hollow Pier"], id.Mara]));
    expect(new Set(shots[1].cardIds)).toEqual(new Set([id["Hollow Pier"], id.Teo, id["Brass ticket"]]));
    expect(shots[1]).toMatchObject({ speakerId: id.Teo, placeId: id["Hollow Pier"], edited: false, transition: "cut" });
    // 12 words at 2.5 a second: 6 s at least, not the 2 it was planned at
    expect(shots[1].seconds).toBe(6);
  });

  test("no story is a refusal; shots already there are kept unless the plan is asked to replace them", async () => {
    const empty = await newFilm({ title: "Nothing yet" });
    const r = await plan(empty.id);
    expect(r.statusCode).toBe(409);
    expect(r.json().type).toMatch(/no-story$/);
    const film = await newFilm();
    await client.post(`/v1/films/${film.id}/shots`, { json: { action: "mine" } });
    const kept = await plan(film.id);
    expect(kept.statusCode).toBe(409);
    expect(kept.json()).toMatchObject({ withWork: false });
    answers.push({ cards: [] }, { shots: [{ place: "", cards: [], size: "wide", camera: "static", action: "The lake.", line: "", speaker: "", seconds: 4, transition: "cut" }] });
    const done = await settle((await plan(film.id, { replace: true })).json());
    expect(done.state).toBe("done");
    expect((await listShots(film.id)).map((s) => s.action)).toEqual(["The lake."]);
  });

  test("an answer that isn't the plan fails the job in words; a model that fails, with its own", async () => {
    const film = await newFilm();
    answers.push("I think the story is lovely!");
    const bad = await settle((await plan(film.id)).json());
    expect(bad.state).toBe("error");
    expect(bad.error.title).toBe("The plan didn't come back whole");
    const refused = Object.assign(new Error("Set up a local model or connect a provider first."), { title: "No AI model is set up" });
    answers.push(refused);
    const none = await settle((await plan(film.id)).json());
    expect(none.error.title).toBe("No AI model is set up");
    expect(await listShots(film.id)).toEqual([]);
  });

  test("carry a hand edit forward: only later shots nobody changed by hand, each kept if changed meanwhile", async () => {
    const film = await newFilm();
    const teo = await newCard(film.id, { kind: "character", name: "Teo" });
    const thermos = await newCard(film.id, { kind: "prop", name: "Thermos" });
    getState().services.run = async (body) => {
      runs.push(body);
      return { content: JSON.stringify(answers.shift()) };
    };
    const ids = [];
    for (const action of ["Teo boards.", "Mara gives Teo her thermos.", "Teo sips from the thermos.", "Teo waves.", "Landing."]) {
      ids.push((await client.post(`/v1/films/${film.id}/shots`, { json: { action, cardIds: action.includes("Teo") ? [teo.id] : [] } })).json().id);
    }
    // planned, not edited; then shot 2 changed by hand, and shot 4 too
    getDb().run("UPDATE shots SET edited = 0");
    const shot2 = (await listShots(film.id))[1];
    await client.patch(`/v1/shots/${shot2.id}`, { json: { action: "Mara wraps her yellow coat around the shaking Teo." }, headers: { "if-match": shot2.version } });
    const shot4 = (await listShots(film.id))[3];
    await client.patch(`/v1/shots/${shot4.id}`, { json: { action: "Teo, in the coat, waves." }, headers: { "if-match": shot4.version } });

    answers.push({
      why: "There is no thermos now, and Teo keeps the coat.",
      shots: [
        { number: 3, place: "", cards: ["teo"], size: "close-up", camera: "static", action: "Teo, wrapped in the yellow coat, stops shaking.", line: "", speaker: "", seconds: 4, transition: "cut" },
        { number: 5, place: "", cards: ["teo"], size: "wide", camera: "static", action: "Teo steps onto the landing in the coat.", line: "", speaker: "", seconds: 4, transition: "cut" },
      ],
    });
    const r = await client.post(`/v1/shots/${shot2.id}/carry`, { json: { note: "There is no thermos. Teo keeps the coat." } });
    expect(r.statusCode).toBe(202);
    const done = await settle(r.json());
    expect(done.state).toBe("done");
    expect(done.result.why).toMatch(/no thermos/);
    expect(done.result.changed).toEqual([ids[2], ids[4]]);
    const run = runs.at(-1);
    expect(run.action).toBe("plan.revise");
    expect(run.variables).toMatchObject({ number: 2, editable: "3, 5" });
    expect(run.variables.change).toContain("The user says: There is no thermos.");
    // each shape a shot can take (with a line or without) is numbered only as the shots it may change
    const items = JSON.parse(run.jsonSchema).properties.shots.items;
    for (const shape of items.anyOf ?? [items]) expect(shape.properties.number.enum).toEqual([3, 5]);
    const after = await listShots(film.id);
    expect(after.map((s) => s.action)).toEqual([
      "Teo boards.",
      "Mara wraps her yellow coat around the shaking Teo.",
      "Teo, wrapped in the yellow coat, stops shaking.",
      "Teo, in the coat, waves.", // changed by hand: left
      "Teo steps onto the landing in the coat.",
    ]);
    expect(after[2]).toMatchObject({ edited: false });
    expect(after[2].cardIds).not.toContain(thermos.id);
    // the last shot: nothing after it to carry into
    expect((await client.post(`/v1/shots/${ids[4]}/carry`, { json: {} })).statusCode).toBe(409);
  });
});

describe("the planner's repairs", () => {
  const cards = [
    { id: "c1", kind: "character", name: "Mara" },
    { id: "c2", kind: "place", name: "Hollow Pier" },
    { id: "c3", kind: "look", name: "Noir" },
  ];
  const { refs } = cardRefs(cards);
  test("refs are unique slugs of the names", () => {
    const { byId } = cardRefs([...cards, { id: "c4", kind: "character", name: "MARA" }]);
    expect([...byId.values()]).toEqual(["mara", "hollow_pier", "noir", "mara_2"]);
  });
  test("an unknown or wrong-kind ref is dropped; a line clears no speaker; the length is held in range", () => {
    const shot = shotFrom({ place: "mara", cards: ["ghost", "noir"], speaker: "hollow_pier", size: "huge", line: "", action: "x", seconds: 99 }, cards, refs, { wordsPerSecond: 2.5 });
    expect(shot).toMatchObject({ placeId: null, speakerId: null, size: "", seconds: 13, transition: "cut" });
    expect(shot.cardIds).toEqual(["c3"]);
  });
  test("how a line is said comes with a line only; an emotion off JustVoice's list is none", () => {
    const said = shotFrom({ action: "x", line: "Go.", speaker: "mara", delivery: " barely a whisper ", emotion: "whispered", seconds: 3 }, cards, refs, { wordsPerSecond: 2.5 });
    expect(said).toMatchObject({ delivery: "barely a whisper", emotion: "whispered" });
    expect(shotFrom({ action: "x", line: "Go.", delivery: "", emotion: "furious", seconds: 3 }, cards, refs, { wordsPerSecond: 2.5 }).emotion).toBe("");
    expect(shotFrom({ action: "x", line: "", delivery: "loud", emotion: "angry", seconds: 3 }, cards, refs, { wordsPerSecond: 2.5 })).toMatchObject({ delivery: "", emotion: "" });
  });
  test("a look named in the words isn't added: it is a style, not something in the frame", () => {
    expect(shotFrom({ action: "A noir alley.", cards: [], seconds: 4 }, cards, refs, { wordsPerSecond: 2.5 }).cardIds).toEqual([]);
  });
  test("new cards: kinds checked, names trimmed and unique", () => {
    expect(newCards({ cards: [{ kind: "monster", name: "x" }, { kind: "prop", name: "  Ticket " }, { kind: "prop", name: "ticket" }, { kind: "prop", name: "" }] }, [])).toEqual([
      { kind: "prop", name: "Ticket", description: "", voice: "" },
    ]);
  });
  test("a planned voice that says too little is dropped, so Speak designs it from the description", () => {
    expect(plannedVoice('(sixties, "", "")')).toBe("");
    expect(plannedVoice("ten")).toBe("");
    expect(plannedVoice("an older woman's low, weathered voice")).toBe("an older woman's low, weathered voice");
    expect(plannedVoice('(deep, "gravelly")')).toBe("deep, gravelly");
    const [mara] = newCards({ cards: [{ kind: "character", name: "Mara", description: "a ferry captain in her sixties", voice: '(sixties, "", "")' }] }, []);
    expect(mara.voice).toBe("");
  });
});
