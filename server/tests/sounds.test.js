// SPDX-License-Identifier: MIT
// A shot's line spoken in its character's voice, and the film's music and effects — a fake JustVoice (the real voices
// come from its server, justvoice.js) and fake music (the real one is the kit's audio.cpp runtime): a character's voice
// made once from their card, the line said with its delivery, kept as the shot's (the old one gone); the whole film's
// lines as one batch after the card is let go; refusals said at once; music and effects made, placed, moved, deleted.
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { getDb, getState } from "../src/app_state.js";
import { getCard, updateCard } from "../src/database/films.js";
import { seedWorkspace } from "../src/database/seed.js";
import { filmDir } from "../src/files.js";
import { testClient, tmpDir, useHermeticKit } from "./helpers.js";

useHermeticKit();

/** A WAV of `seconds` of silence at 24 kHz mono 16-bit. */
function wav(seconds) {
  const rate = 24000;
  const data = Buffer.alloc(Math.round(seconds * rate) * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

/** A fake JustVoice in its client's shape (justvoice.js): what it was asked, in order. */
function fakeJustVoice() {
  const jv = {
    base: "http://127.0.0.1:17494",
    up: true,
    calls: [],
    async health() {
      return jv.up ? { clientApi: 1 } : null;
    },
    async characterVoice(body) {
      jv.calls.push(["characterVoice", body]);
      const n = jv.calls.filter((c) => c[0] === "characterVoice").length;
      return {
        voice_id: `v${n}`,
        name: body.name,
        gender: "female",
        description: `Written for ${body.name}`,
        described_by: "gemma",
        design: { model: "qwen3-vd", name: "Qwen3-TTS VoiceDesign", commercial: "Yes", summary: "", url: "" },
        clone: { model: "cosyvoice3", name: "CosyVoice3", commercial: "Yes", summary: "", url: "" },
        audition_url: `/v1/voices/v${n}/audition.wav`,
      };
    },
    async cloneVoice(body) {
      jv.calls.push(["cloneVoice", { ...body, wav: body.wav.length }]);
      return { id: "rec1", model: "cosyvoice3", licence: { commercial: "Yes", summary: "", url: "" } };
    },
    async fetchFile(p) {
      jv.calls.push(["fetchFile", p]);
      return wav(2);
    },
    async speak(req) {
      jv.calls.push(["speak", req]);
      return wav(1.5);
    },
    async speakBatch(lines) {
      jv.calls.push(["speakBatch", lines]);
      return lines.map((l) => (l.input.includes("fail") ? { id: l.id, wav: null, seconds: 0, error: "the model refused" } : { id: l.id, wav: wav(1.2), seconds: 1.2, error: null }));
    },
    async deleteVoice(id) {
      jv.calls.push(["deleteVoice", id]);
    },
  };
  return jv;
}

let client;
let dataDir;
let jv;
let freed;
let made;
beforeEach(async () => {
  dataDir = tmpDir();
  jv = fakeJustVoice();
  freed = 0;
  made = [];
  const services = {
    voices: () => jv,
    freeCard: async () => {
      freed++;
      jv.calls.push(["freeCard"]);
    },
    makeAudio: async (feature, request) => {
      made.push({ feature, ...request });
      return { audio: wav(request.duration_seconds).toString("base64") };
    },
  };
  client = testClient(await createApp(dataDir, { services }));
  seedWorkspace(getDb());
});
const callsOf = (name) => jv.calls.filter((c) => c[0] === name).map((c) => c[1]);

async function settle(job) {
  for (let i = 0; i < 300; i++) {
    const r = (await client.get(`/v1/jobs/${job.id}`)).json();
    if (r.state !== "running") return r;
    await new Promise((res) => setTimeout(res, 10));
  }
  throw new Error("the job never ended");
}

async function scene() {
  const film = (await client.post("/v1/films", { json: { title: "Ferry", story: "Mara runs the last ferry. A boy, Teo, arrives with a brass ticket." } })).json();
  const mara = (await client.post(`/v1/films/${film.id}/cards`, { json: { kind: "character", name: "Mara", description: "a ferry captain in her sixties", voice: "a low, weathered woman's voice, dry" } })).json();
  const teo = (await client.post(`/v1/films/${film.id}/cards`, { json: { kind: "character", name: "Teo" } })).json();
  const shot = (await client.post(`/v1/films/${film.id}/shots`, { json: { action: "Mara speaks.", line: "This is the last crossing.", speakerId: mara.id, delivery: "quietly, to herself", emotion: "sad" } })).json();
  return { film, mara, teo, shot };
}
const speakShot = async (shot) => settle((await client.post(`/v1/shots/${shot.id}/line`, { json: {} })).json());

describe("a line spoken by JustVoice", () => {
  test("the speaker's voice made once from their card; the line said as written; kept as the shot's, the old one gone", async () => {
    const { film, mara, shot } = await scene();
    const first = await speakShot(shot);
    expect(first.state).toBe("done");
    // her voice: who she is, her lines, the story's opening, in models a film made with it can be sold with
    expect(callsOf("characterVoice")).toEqual([
      {
        name: "Mara · Ferry",
        description: "a ferry captain in her sixties. Their voice: a low, weathered woman's voice, dry",
        lines: ["This is the last crossing."],
        context: "Mara runs the last ferry. A boy, Teo, arrives with a brass ticket.",
        language: "en-US",
        commercial_use: true,
      },
    ]);
    expect(callsOf("speak")[0]).toMatchObject({ voice: "v1", input: "This is the last crossing.", instructions: "quietly, to herself", emotion: "sad" });
    expect(first.result).toMatchObject({ kind: "line", shotId: shot.id, seconds: 1.5 });
    // the card keeps her voice, what JustVoice said of it and its audition
    const card = (await client.get(`/v1/films/${film.id}/cards`)).json().items.find((c) => c.id === mara.id);
    expect(card).toMatchObject({ voiceId: "v1", voiceInfo: { source: "made", description: "Written for Mara · Ferry", design: { commercial: "Yes" }, clone: { name: "CosyVoice3" } } });
    expect((await client.get(card.voiceAuditionUrl)).headers["content-type"]).toBe("audio/wav");
    // again: the same voice, a new take in place of the old
    const again = await speakShot(shot);
    expect(callsOf("characterVoice")).toHaveLength(1);
    const items = (await client.get(`/v1/films/${film.id}/sounds`)).json().items;
    expect(items.map((s) => s.id)).toEqual([again.result.id]);
    expect(readdirSync(path.join(filmDir(dataDir, film.id), "sounds"))).toEqual([again.result.file]);
    expect((await client.get(again.result.audioUrl)).headers["content-type"]).toBe("audio/wav");
  });

  test("refused at once: no line, no speaker, JustVoice not answering — naming where it looked", async () => {
    const { film, shot } = await scene();
    const silent = (await client.post(`/v1/films/${film.id}/shots`, { json: { action: "The lake." } })).json();
    expect((await client.post(`/v1/shots/${silent.id}/line`, { json: {} })).json()).toMatchObject({ status: 409, title: "The shot has no line" });
    const nobody = (await client.post(`/v1/films/${film.id}/shots`, { json: { line: "Who said that?" } })).json();
    expect((await client.post(`/v1/shots/${nobody.id}/line`, { json: {} })).json()).toMatchObject({ status: 409, title: "The line has no speaker" });
    jv.up = false;
    const off = (await client.post(`/v1/shots/${shot.id}/line`, { json: {} })).json();
    expect(off).toMatchObject({ status: 409, title: "JustVoice isn't running" });
    expect(off.detail).toContain("http://127.0.0.1:17494");
    expect((await client.post(`/v1/films/${film.id}/lines`, { json: {} })).statusCode).toBe(409);
    expect((await client.get("/v1/voices/status")).json()).toEqual({ reachable: false, address: "http://127.0.0.1:17494", clientApi: 0 });
    expect(callsOf("speak")).toHaveLength(0);
  });

  test("a character with a voice recording: JustVoice clones it, with its words or its sound alone", async () => {
    const { film, mara, shot } = await scene();
    mkdirSync(path.join(filmDir(dataDir, film.id), "cards"), { recursive: true });
    writeFileSync(path.join(filmDir(dataDir, film.id), "cards", "mara-voice.wav"), wav(3));
    updateCard(getDb(), mara.id, { voiceSample: "mara-voice.wav", voiceSampleText: "I've run this ferry for forty years." });
    await speakShot(shot);
    expect(callsOf("characterVoice")).toHaveLength(0);
    expect(callsOf("cloneVoice")[0]).toMatchObject({ name: "Mara · Ferry", transcript: "I've run this ferry for forty years.", language: "en-US" });
    expect(callsOf("speak")[0].voice).toBe("rec1");
    expect(getCard(getDb(), mara.id).voiceInfo).toMatchObject({ source: "recording", clone: { model: "cosyvoice3", commercial: "Yes" } });
  });

  test("the film's lines: every speaker's voice first, the card let go, one batch; a line JustVoice couldn't say is named", async () => {
    const { film, shot, teo } = await scene();
    await client.post(`/v1/films/${film.id}/shots`, { json: { line: "Hello?", speakerId: teo.id } });
    const bad = (await client.post(`/v1/films/${film.id}/shots`, { json: { line: "Please fail.", speakerId: teo.id } })).json();
    await client.post(`/v1/films/${film.id}/shots`, { json: { line: "Nobody speaks this." } });
    const done = await settle((await client.post(`/v1/films/${film.id}/lines`, { json: {} })).json());
    expect(done.result).toEqual({ spoken: 2, voicesMade: 2, failed: [{ shotId: bad.id, why: "the model refused" }] });
    // the voices, then the card handed over, then the batch — in that order
    expect(jv.calls.map((c) => c[0]).filter((n) => n !== "fetchFile")).toEqual(["characterVoice", "characterVoice", "freeCard", "speakBatch"]);
    const batch = callsOf("speakBatch")[0];
    expect(batch.map((l) => [l.id, l.voice, l.input])).toEqual([
      [shot.id, "v1", "This is the last crossing."],
      [expect.any(String), "v2", "Hello?"],
      [bad.id, "v2", "Please fail."],
    ]);
    // again: only what wasn't spoken
    jv.calls.length = 0;
    await settle((await client.post(`/v1/films/${film.id}/lines`, { json: {} })).json());
    expect(callsOf("speakBatch")[0].map((l) => l.id)).toEqual([bad.id]);
    expect(callsOf("characterVoice")).toHaveLength(0);
    expect(freed).toBe(2);
  });
});

describe("a character's voice on the card", () => {
  test("made on its own, made again (the old one gone from JustVoice), taken off; a new recording forgets it", async () => {
    const { film, mara } = await scene();
    const made1 = await settle((await client.post(`/v1/cards/${mara.id}/voice`, { json: {} })).json());
    expect(made1.result).toMatchObject({ voiceId: "v1" });
    expect(made1.result.voiceAuditionUrl).toMatch(/^\/v1\/cards\/.+\/voice-audition\?v=/);
    const made2 = await settle((await client.post(`/v1/cards/${mara.id}/voice`, { json: {} })).json());
    expect(made2.result.voiceId).toBe("v2");
    expect(callsOf("deleteVoice")).toEqual(["v1"]);
    const off = (await client.delete(`/v1/cards/${mara.id}/voice`)).json();
    expect(off).toMatchObject({ voiceId: null, voiceInfo: {}, voiceAuditionUrl: null });
    expect(callsOf("deleteVoice")).toEqual(["v1", "v2"]);
    expect(readdirSync(path.join(filmDir(dataDir, film.id), "cards")).filter((n) => n.includes("audition"))).toEqual([]);
    // a place has no voice
    const pier = (await client.post(`/v1/films/${film.id}/cards`, { json: { kind: "place", name: "Pier" } })).json();
    expect((await client.post(`/v1/cards/${pier.id}/voice`, { json: {} })).json()).toMatchObject({ status: 409, title: "Only a character speaks" });
  });

  test("the card's words changed after its voice was made: said, until it is made again", async () => {
    const { film, mara } = await scene();
    await settle((await client.post(`/v1/cards/${mara.id}/voice`, { json: {} })).json());
    const cardNow = async () => (await client.get(`/v1/films/${film.id}/cards`)).json().items.find((c) => c.id === mara.id);
    expect((await cardNow()).voiceStale).toBe(false);
    await client.patch(`/v1/cards/${mara.id}`, { json: { voice: "a bright, quick young voice" } });
    expect((await cardNow()).voiceStale).toBe(true);
    await settle((await client.post(`/v1/cards/${mara.id}/voice`, { json: {} })).json());
    expect((await cardNow()).voiceStale).toBe(false);
    expect(callsOf("characterVoice").at(-1).description).toContain("a bright, quick young voice");
  });

  test("a deleted character's voice leaves JustVoice with it", async () => {
    const { mara } = await scene();
    await settle((await client.post(`/v1/cards/${mara.id}/voice`, { json: {} })).json());
    expect((await client.delete(`/v1/cards/${mara.id}`)).statusCode).toBe(204);
    expect(callsOf("deleteVoice")).toEqual(["v1"]);
  });
});

describe("music and effects", () => {
  test("made from words, placed in the cut, moved, made quieter, deleted with its file", async () => {
    const { film } = await scene();
    const music = await settle((await client.post(`/v1/films/${film.id}/sounds`, { json: { kind: "music", prompt: "a slow piano and cello cue, rain", start: 2 } })).json());
    expect(made[0]).toMatchObject({ feature: "sounds.music", text: "a slow piano and cello cue, rain", duration_seconds: 30, num_inference_steps: 8, guidance_scale: 1 });
    expect(music.result).toMatchObject({ kind: "music", start: 2, volume: 0.6, seconds: 30, fadeIn: 0, fadeOut: 2 });
    const fx = await settle((await client.post(`/v1/films/${film.id}/sounds`, { json: { kind: "effect", prompt: "a ship's horn", seconds: 4, start: 9.5 } })).json());
    expect(made[1]).toMatchObject({ feature: "sounds.effect", duration_seconds: 4 });
    expect(made[1].guidance_scale).toBeUndefined();
    expect(fx.result).toMatchObject({ kind: "effect", volume: 1, fadeIn: 0, fadeOut: 0 });
    const moved = await client.patch(`/v1/sounds/${music.result.id}`, { json: { start: 12, volume: 0.3 } });
    expect(moved.json()).toMatchObject({ start: 12, volume: 0.3, fadeOut: 2 });
    // its fades, in seconds; past the longest sound is refused under its field
    expect((await client.patch(`/v1/sounds/${music.result.id}`, { json: { fadeIn: 10, fadeOut: 0 } })).json()).toMatchObject({ fadeIn: 10, fadeOut: 0, start: 12 });
    expect((await client.patch(`/v1/sounds/${music.result.id}`, { json: { fadeIn: 61 } })).statusCode).toBe(422);
    expect((await client.get(`/v1/films/${film.id}/sounds`)).json().items.map((s) => s.kind)).toEqual(["effect", "music"]);
    expect((await client.delete(`/v1/sounds/${fx.result.id}`)).statusCode).toBe(204);
    expect(readdirSync(path.join(filmDir(dataDir, film.id), "sounds"))).toEqual([music.result.file]);
  });

  test("music with lyrics is a song: sung by the song feature on ACE-Step's text-to-music route, its lyrics kept", async () => {
    const { film } = await scene();
    const lyrics = "Still here, still here,\nthe ferry and me.";
    const song = await settle((await client.post(`/v1/films/${film.id}/sounds`, { json: { kind: "music", prompt: "warm acoustic folk, a woman's voice", lyrics, seconds: 40 } })).json());
    expect(made[0]).toMatchObject({ feature: "sounds.song", text: "warm acoustic folk, a woman's voice", lyrics, task_route: "text2music", duration_seconds: 40, num_inference_steps: 8 });
    expect(made[0].options).toEqual({ enable_thinking: false, use_cot_metas: false, use_cot_caption: false, use_cot_language: false });
    expect(song.result).toMatchObject({ kind: "music", lyrics, seconds: 40 });
    // blank lyrics are no song; an effect never sings
    await settle((await client.post(`/v1/films/${film.id}/sounds`, { json: { kind: "music", prompt: "rain", lyrics: "   " } })).json());
    await settle((await client.post(`/v1/films/${film.id}/sounds`, { json: { kind: "effect", prompt: "a horn", lyrics: "la la" } })).json());
    expect(made.slice(1).map((m) => [m.feature, m.lyrics])).toEqual([
      ["sounds.music", undefined],
      ["sounds.effect", undefined],
    ]);
    expect((await client.get(`/v1/films/${film.id}/sounds`)).json().items.map((s) => s.lyrics)).toEqual(expect.arrayContaining([lyrics, "", ""]));
  });

  test("words required, a length past 60 s refused, an unknown kind refused", async () => {
    const { film } = await scene();
    expect((await client.post(`/v1/films/${film.id}/sounds`, { json: { kind: "music", prompt: "" } })).statusCode).toBe(422);
    expect((await client.post(`/v1/films/${film.id}/sounds`, { json: { kind: "music", prompt: "x", seconds: 90 } })).statusCode).toBe(422);
    expect((await client.post(`/v1/films/${film.id}/sounds`, { json: { kind: "voice", prompt: "x" } })).statusCode).toBe(422);
  });

  test("an empty answer fails the job in words", async () => {
    const { film } = await scene();
    getState().services.makeAudio = async () => ({ audio: "" });
    const r = await settle((await client.post(`/v1/films/${film.id}/sounds`, { json: { kind: "effect", prompt: "x" } })).json());
    expect(r.error.title).toBe("The sound came back empty");
  });
});
