// SPDX-License-Identifier: MIT
// /v1/films/:id/make — Make the film: the refusals said before it starts, and a story made into a film by fake engines
// (the planner, the painter, the clip model — the real ones are the kit's) and this computer's real FFmpeg: each step in
// order, each doing only what's missing, so a second run finds nothing to do but the export.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { beforeEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { getDb } from "../src/app_state.js";
import { seedWorkspace } from "../src/database/seed.js";
import { testClient, tmpDir, useHermeticKit } from "./helpers.js";

useHermeticKit();

const FFMPEG =
  process.env.JD_TEST_FFMPEG || "E:\\Dev\\Web\\test-just-direct\\ai-cache\\kit-ffmpeg\\ffmpeg\\9.0.2\\cpu\\ffmpeg-9.0.2-essentials_build\\bin\\ffmpeg.exe";
const real = existsSync(FFMPEG);

const STORY = "Mara runs the last ferry on Lake Orsa. At dawn she paints over the boat's name.";
const PLAN = [
  { cards: [{ kind: "character", name: "Mara", description: "a ferry captain in her sixties, grey braid", voice: "" }] },
  {
    shots: [
      { place: "", cards: ["mara"], size: "wide", camera: "static", action: "Rain falls on the pier at dawn.", line: "", speaker: "", seconds: 2, transition: "cut" },
      { place: "", cards: ["mara"], size: "medium", camera: "slow push in", action: "Mara paints over the boat's name.", line: "", speaker: "", seconds: 2, transition: "dissolve" },
    ],
  },
];
const CHECK = { cards: [], extraPeople: 0, lettering: false, faults: [], match: 9, note: "" };

let client;
let needs;
let calls;
beforeEach(async () => {
  needs = [];
  calls = { run: 0, paint: 0, video: 0 };
  const answers = PLAN.map((a) => JSON.stringify(a));
  const run = async () => {
    calls.run++;
    return { content: answers.shift() ?? JSON.stringify(CHECK) };
  };
  const paintImage = async (feature, request) => {
    calls.paint++;
    return sharp({ create: { width: request.width / 16, height: request.height / 16, channels: 3, background: "#456" } }).png().toBuffer();
  };
  // a real second of video with its sound, as LTX-2.3's WebM would be, so the export can join it
  const makeVideo = async (feature, request) => {
    calls.video++;
    const out = path.join(tmpDir(), "clip.webm");
    execFileSync(FFMPEG, ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=gray:s=256x128:r=24:d=1", "-f", "lavfi", "-i", "sine=f=440:d=1", "-c:v", "libvpx-vp9", "-c:a", "libopus", "-shortest", out]);
    return { bytes: readFileSync(out), fps: 24, frames: 24, format: "webm" };
  };
  client = testClient(await createApp(tmpDir(), { services: { run, paintImage, makeVideo, filmNeeds: () => needs } }));
  seedWorkspace(getDb());
});

async function settle(job) {
  for (let i = 0; i < 1200; i++) {
    const r = (await client.get(`/v1/jobs/${job.id}`)).json();
    if (r.state !== "running") return r;
    await new Promise((res) => setTimeout(res, 25));
  }
  throw new Error("the job never ended");
}
const make = (filmId) => client.post(`/v1/films/${filmId}/make`, { json: {} });

describe("Make the film", () => {
  test("refused before it starts: no story and no shots; something it needs isn't installed — named", async () => {
    const empty = (await client.post("/v1/films", { json: { title: "Empty" } })).json();
    expect((await make(empty.id)).json()).toMatchObject({ status: 409, title: "The film has no story yet" });
    const film = (await client.post("/v1/films", { json: { title: "Ferry", story: STORY } })).json();
    needs = ["the clip model (Clips)", "FFmpeg (the export)"];
    const r = (await make(film.id)).json();
    expect(r).toMatchObject({ status: 409, title: "Something the film needs isn't installed", missing: needs });
    expect(r.detail).toBe("Install the clip model (Clips), FFmpeg (the export) on the AI page first.");
    expect(calls).toEqual({ run: 0, paint: 0, video: 0 });
    expect((await client.post("/v1/films/nope/make", { json: {} })).statusCode).toBe(404);
  });

  test.skipIf(!real)("a story made into a film in order — planned, framed, clipped, exported; again: only the export", { timeout: 120_000 }, async () => {
    expect((await client.put("/v1/ai/runtimes/ffmpeg/settings", { json: { settings: { path: FFMPEG } } })).statusCode).toBe(200);
    const film = (await client.post("/v1/films", { json: { title: "Ferry", story: STORY, width: 512, height: 384 } })).json();
    const done = await settle((await make(film.id)).json());
    expect(done.state).toBe("done");
    expect(done.result.steps.map((s) => [s.step, s.done])).toEqual([
      ["plan", true],
      ["frames", true],
      ["clips", true],
      ["export", true],
    ]);
    expect(done.result.steps[0]).toMatchObject({ cardsAdded: 1, shots: 2 });
    expect(done.result.steps[2]).toMatchObject({ shots: 2, made: 2, failed: [] });
    expect(done.result.steps[3].shots).toBe(2);
    const shots = (await client.get(`/v1/films/${film.id}/shots`)).json().items;
    expect(shots.every((s) => s.frameId && s.clipId)).toBe(true);
    expect((await client.get(`/v1/films/${film.id}/export`)).statusCode).toBe(200);
    // the card's picture was painted with the frames: one picture, then 3 frames a shot
    expect(calls.paint).toBe(1 + 2 * 3);

    // again: every shot has its frame and its clip — nothing but the export runs, nothing is made again
    const before = { ...calls };
    const again = await settle((await make(film.id)).json());
    expect(again.result.steps.map((s) => [s.step, s.done])).toEqual([
      ["plan", false],
      ["frames", false],
      ["clips", false],
      ["export", true],
    ]);
    expect(calls).toEqual(before);
  });
});
