// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// A film's page mounted for real (app-structure §18) against a stand-in server in the real one's shapes: the tab in the
// address; the Story form's save with its version; a card added on the Cards tab; Plan the shots as a server job on the
// AI tasks strip (its result read again); a hand edit to a shot, then Carry it forward with the user's note; a line
// spoken and played; a motion capture take's pose as a clip's guide; the Cut tab's trims, transitions, export and music.
import { installLlmUi, LlmUiHosts, useResolvedRoute } from "@delebash/ui";
import { QUASAR_TEST_OPTIONS } from "@delebash/ui/quasar/install.js";
import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import * as quasar from "quasar";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { h } from "vue";
import { createMemoryHistory, createRouter, RouterView } from "vue-router";
import { i18n } from "../i18n/index.js";
import FilmPage from "./FilmPage.vue";

const reported = [];
// the microphone: a stand-in recorder whose recording is a few bytes
const mic = { started: 0 };
vi.mock("@delebash/ui", async (importOriginal) => ({
  ...(await importOriginal()),
  reportError: (e) => reported.push(e),
  recordMicrophone: async () => {
    mic.started++;
    return { stop: async () => new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }) };
  },
}));

const QUASAR_COMPONENTS = Object.fromEntries(Object.entries(quasar).filter(([k, v]) => /^Q[A-Z]/.test(k) && v?.name));

let server;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": status >= 400 ? "application/problem+json" : "application/json" } });

function fakeFetch(input, init = {}) {
  // the kit's AI client asks by path alone
  const url = new URL(String(input), "http://127.0.0.1:17500");
  const method = (init.method || "GET").toUpperCase();
  const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
  server.calls.push([method, url.pathname, body, init.headers?.["If-Match"] ?? init.headers?.["if-match"]]);
  const p = url.pathname;
  if (p === "/v1/settings") return Promise.resolve(json({ "films.width": 1280, "films.height": 704, "clips.lipRepair": server.lipRepair }));
  if (p === "/v1/films/f1" && method === "GET") return Promise.resolve(json(server.film));
  if (p === "/v1/films/f1" && method === "PATCH") {
    server.film = { ...server.film, ...body, version: `"v${++server.n}"` };
    return Promise.resolve(json(server.film));
  }
  if (p === "/v1/films/f1/cards" && method === "GET") return Promise.resolve(json({ items: server.cards }));
  if (p === "/v1/films/f1/cards" && method === "POST") {
    const card = { id: `c${server.cards.length + 1}`, filmId: "f1", description: "", voice: "", picture: null, pictureUrl: null, position: 0, version: '"c"', ...body };
    server.cards.push(card);
    return Promise.resolve(json(card, 201));
  }
  if (p === "/v1/films/f1/shots" && method === "GET") return Promise.resolve(json({ items: server.shots }));
  if (p === "/v1/films/f1/plan" && method === "POST") {
    server.shots = [1, 2, 3].map((n) => shot(n, `Shot ${n} happens.`));
    return Promise.resolve(json({ id: "job-plan", state: "running", progress: 0 }, 202));
  }
  if (p.startsWith("/v1/shots/") && method === "PATCH") {
    const id = p.split("/")[3];
    server.shots = server.shots.map((s) => (s.id === id ? { ...s, ...body, edited: true, version: '"e"' } : s));
    return Promise.resolve(json(server.shots.find((s) => s.id === id)));
  }
  if (p.endsWith("/carry") && method === "POST") return Promise.resolve(json({ id: "job-carry", state: "running", progress: 0 }, 202));
  // the film's sounds: a shot's line spoken, music made, a sound's place changed
  if (p === "/v1/films/f1/sounds" && method === "GET") return Promise.resolve(json({ items: server.sounds }));
  if (/^\/v1\/shots\/s\d+\/line$/.test(p) && method === "POST") {
    const shotId = p.split("/")[3];
    const said = server.shots.find((s) => s.id === shotId).line;
    server.sounds = [...server.sounds.filter((s) => s.shotId !== shotId), sound({ id: `l-${shotId}`, shotId, kind: "line", prompt: said, seconds: 2.1 })];
    return Promise.resolve(json({ id: "job-line", state: "running", progress: 0 }, 202));
  }
  if (p === "/v1/films/f1/sounds" && method === "POST") {
    server.sounds = [...server.sounds, sound({ id: "m1", kind: body.kind, prompt: body.prompt, lyrics: body.lyrics ?? "", seconds: 30, start: body.start, volume: 0.6 })];
    return Promise.resolve(json({ id: "job-sound", state: "running", progress: 0 }, 202));
  }
  if (p.startsWith("/v1/sounds/") && method === "PATCH") {
    const id = p.split("/")[3];
    server.sounds = server.sounds.map((s) => (s.id === id ? { ...s, ...body } : s));
    return Promise.resolve(json(server.sounds.find((s) => s.id === id)));
  }
  if (p === "/v1/films/f1/export" && method === "GET") {
    return Promise.resolve(server.exported ? json(server.exported) : json({ title: "Not found", status: 404 }, 404));
  }
  if (p === "/v1/films/f1/export" && method === "POST") {
    server.exported = { file: "the-last-ferry-1.mp4", createdAt: new Date().toISOString(), name: "The-Last-Ferry.mp4", videoUrl: "/v1/films/f1/export/video?v=the-last-ferry-1.mp4" };
    return Promise.resolve(json({ id: "job-export", state: "running", progress: 0 }, 202));
  }
  if (p === "/v1/ai/resolved-route") return Promise.resolve(json(server.route));
  if (p.endsWith("/readiness")) return Promise.resolve(json({ ready: true, need: "", model: "sa3", modelState: { name: "Stable Audio 3 Medium", license: "Stability AI Community License" } }));
  if (/^\/v1\/cards\/c\d+\/voice-sample$/.test(p) && (method === "POST" || method === "DELETE")) {
    const id = p.split("/")[3];
    const on = method === "POST";
    const text = on && init.body instanceof FormData ? String(init.body.get("text") ?? "") : "";
    server.cards = server.cards.map((c) => (c.id === id ? { ...c, voiceSample: on ? "v.wav" : null, voiceSampleText: text, voiceSampleUrl: on ? `/v1/cards/${id}/voice-sample?v=v.wav` : null, version: `"${method}"` } : c));
    return Promise.resolve(json(server.cards.find((c) => c.id === id)));
  }
  if (/^\/v1\/cards\/c\d+$/.test(p) && method === "PATCH") {
    const id = p.split("/")[3];
    server.cards = server.cards.map((c) => (c.id === id ? { ...c, ...body, version: '"patched"' } : c));
    return Promise.resolve(json(server.cards.find((c) => c.id === id)));
  }
  if (/^\/v1\/cards\/c\d+\/paint$/.test(p) && method === "POST") return Promise.resolve(json({ id: "job-paint", state: "running", progress: 0 }, 202));
  // a character's voice made in JustVoice (a job), taken off
  if (/^\/v1\/cards\/c\d+\/voice$/.test(p) && method === "POST") return Promise.resolve(json({ id: "job-voice", state: "running", progress: 0 }, 202));
  if (p === "/v1/jobs/job-voice") {
    const voiceInfo = {
      source: "made",
      description: "Female, in her sixties, low and weathered.",
      design: { model: "qwen3-vd", name: "Qwen3-TTS VoiceDesign", commercial: "Yes" },
      clone: { model: "cosyvoice3", name: "CosyVoice3", commercial: "Yes" },
      audition: "c1-audition.wav",
    };
    server.cards = server.cards.map((c) => ({ ...c, voiceId: "v1", voiceInfo, voiceAuditionUrl: "/v1/cards/c1/voice-audition?v=c1-audition.wav", version: '"v"' }));
    return Promise.resolve(json({ id: "job-voice", state: "done", progress: 1, result: server.cards[0] }));
  }
  if (/^\/v1\/cards\/c\d+\/voice$/.test(p) && method === "DELETE") {
    server.cards = server.cards.map((c) => ({ ...c, voiceId: null, voiceInfo: {}, voiceAuditionUrl: null, version: '"off"' }));
    return Promise.resolve(json(server.cards[0]));
  }
  if (p === "/v1/jobs/job-paint") {
    server.cards = server.cards.map((c) => ({ ...c, picture: "c1-1.png", pictureUrl: "/v1/cards/c1/picture?v=c1-1.png", version: '"p"' }));
    return Promise.resolve(json({ id: "job-paint", state: "done", progress: 1, result: server.cards[0] }));
  }
  if (p.startsWith("/v1/cards/") && p.includes("/picture")) return Promise.resolve(new Response(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" })));
  if (p === "/v1/jobs/job-line") return Promise.resolve(json({ id: "job-line", state: "done", progress: 1, result: server.sounds.at(-1) }));
  if (p === "/v1/jobs/job-sound") return Promise.resolve(json({ id: "job-sound", state: "done", progress: 1, result: server.sounds.at(-1) }));
  if (p === "/v1/jobs/job-export") return Promise.resolve(json({ id: "job-export", state: "done", progress: 1, result: { file: server.exported.file, seconds: 7.5, shots: 2, skipped: 1 } }));
  if (p === "/v1/jobs/job-plan") return Promise.resolve(json({ id: "job-plan", state: "done", progress: 1, result: { shots: 3, cardsAdded: 2 } }));
  // Make the film: every step it lacked, done
  if (p === "/v1/films/f1/make" && method === "POST") return Promise.resolve(json({ id: "job-make", state: "running", progress: 0, data: { step: "frames" } }, 202));
  if (p === "/v1/jobs/job-make") {
    const steps = ["plan", "frames", "clips", "export"].map((step) => ({ step, done: step !== "plan" }));
    steps.splice(2, 0, { step: "voices", done: false, skipped: "justvoice-offline", address: "http://127.0.0.1:17494" });
    return Promise.resolve(json({ id: "job-make", state: "done", progress: 1, result: { steps } }));
  }
  if (p === "/v1/jobs/job-carry") return Promise.resolve(json({ id: "job-carry", state: "done", progress: 1, result: { why: "Teo keeps the coat.", changed: ["s3"] } }));
  // a shot's clips; the kit's motion capture takes (just-core llm/mocap_api.js), a take's pose file, a guide video added
  if (/^\/v1\/shots\/s\d+\/clips$/.test(p) && method === "GET") return Promise.resolve(json({ items: server.clips }));
  // lip repair on a talking clip (a job): a new clip as long as the old one, chosen
  if (/^\/v1\/clips\/k\d+\/lips$/.test(p) && method === "POST") return Promise.resolve(json({ id: "job-lips", state: "running", progress: 0 }, 202));
  if (p === "/v1/jobs/job-lips") {
    const fixed = clip({ id: "k2", recipe: { mode: "lips", talking: true, frames: 97, fps: 24, repairedFrom: "k1" } });
    if (!server.clips.some((c) => c.id === "k2")) server.clips = [fixed, ...server.clips];
    server.shots = server.shots.map((s) => ({ ...s, clipId: "k2" }));
    return Promise.resolve(json({ id: "job-lips", state: "done", progress: 1, result: { clip: fixed, shot: server.shots[0] } }));
  }
  if (p === "/v1/mocap/takes") return Promise.resolve(json({ takes: server.takes }));
  if (p === "/v1/mocap/takes/t1/files/pose") return Promise.resolve(new Response(new Blob([new Uint8Array([0, 0, 0, 24])], { type: "video/mp4" })));
  if (/^\/v1\/shots\/s\d+\/guide$/.test(p) && method === "POST") {
    const id = p.split("/")[3];
    server.guideFile = init.body.get("file");
    server.shots = server.shots.map((s) => (s.id === id ? { ...s, mode: "guide", guideFrames: 24, version: '"g"' } : s));
    return Promise.resolve(json(server.shots.find((s) => s.id === id)));
  }
  return Promise.resolve(json({}));
}
const shot = (n, action) => ({
  id: `s${n}`, filmId: "f1", position: n - 1, placeId: null, cardIds: [], size: "wide", camera: "static", action, line: "", speakerId: null,
  seconds: 4, transition: "cut", edited: false, frameId: null, clipId: null, clipSeconds: null, trimIn: 0, trimOut: 0, version: `"s${n}"`,
});
const sound = (s) => ({ filmId: "f1", shotId: null, start: 0, volume: 1, file: `${s.id}.wav`, audioUrl: `/v1/sounds/${s.id}/audio`, ...s });
const clip = (c) => ({ shotId: "s1", seed: 1, seconds: 97 / 24, file: `${c.id}.webm`, videoUrl: `/v1/clips/${c.id}/video`, chosen: false, ...c });

let wrapper;
let router;
async function mountPage(path) {
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/films/:id/:tab?", component: FilmPage, props: true }, { path: "/", component: { render: () => null } }, { path: "/ai", component: { render: () => null } }] });
  router.push(path);
  await router.isReady();
  const Host = { render: () => [h(quasar.QLayout, { view: "hhh lpr fff" }, () => h(quasar.QPageContainer, () => h(RouterView))), h(LlmUiHosts)] };
  wrapper = mount(Host, {
    attachTo: document.body,
    global: {
      plugins: [[quasar.Quasar, { ...QUASAR_TEST_OPTIONS, components: QUASAR_COMPONENTS }], i18n, createPinia(), router, { install: (app) => installLlmUi(app, { i18n, external: false }) }],
      directives: { tooltip: {} },
    },
  });
  await flushPromises();
}
const text = () => document.body.textContent;
const byText = (selector, words) => [...document.body.querySelectorAll(selector)].find((el) => el.textContent.includes(words));
const click = async (el) => {
  await new DOMWrapper(el).trigger("click");
  await flushPromises();
};
const type = async (el, value) => {
  el.value = value;
  el.dispatchEvent(new Event("input"));
  await flushPromises();
};
/** A server job polls every 400 ms (the kit's runServerJob): let the clock run. */
const settle = async () => {
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r, 450));
    await flushPromises();
  }
};

beforeEach(() => {
  server = { calls: [], n: 1, film: { id: "f1", title: "The Last Ferry", story: "", look: "", width: 1280, height: 704, version: '"v1"' }, cards: [], shots: [], sounds: [], takes: [], guideFile: null, clips: [], lipRepair: false, exported: null, route: { configured: true } };
  reported.length = 0;
  // the kit keeps resolved routes for the session: each test asks its own server
  useResolvedRoute().invalidateRoutes();
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  // jsdom has no scrolling; a select's option list scrolls to its choice
  Element.prototype.scrollTo ??= () => {};
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })));
});
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

test("the Story tab saves what changed, with the version it read", async () => {
  await mountPage("/films/f1");
  expect(text()).toContain("The Last Ferry");
  await type(document.getElementById("story-story"), "Mara runs the last ferry.");
  await click(byText("button", "Save"));
  const patch = server.calls.find((c) => c[0] === "PATCH");
  expect(patch[2]).toEqual({ story: "Mara runs the last ferry." });
  expect(patch[3]).toBe('"v1"');
});

test("Make the film: asked first, then one server job; what it did said, a skipped step too; the Cut tab once it exported", async () => {
  server.film.story = "Mara runs the last ferry.";
  await mountPage("/films/f1/story");
  await click(byText("button", "Make the film"));
  expect(text()).toContain("Make the whole film?");
  expect(server.calls.some(([m, p]) => m === "POST" && p === "/v1/films/f1/make")).toBe(false);
  // the dialog's own button, the last one with the words
  await click([...document.body.querySelectorAll("button")].filter((b) => b.textContent.includes("Make the film")).at(-1));
  await settle();
  expect(server.calls.filter(([m, p]) => m === "POST" && p === "/v1/films/f1/make")).toHaveLength(1);
  expect(text()).toContain("The film is made: First frames, Clips, Export");
  // the voices step was skipped: said, with where JustVoice was looked for
  expect(text()).toContain("JustVoice isn't answering at http://127.0.0.1:17494");
  expect(router.currentRoute.value.params.tab).toBe("cut");
  expect(reported).toHaveLength(0);
});

test("Cards: a character added from its kind's button", async () => {
  await mountPage("/films/f1/cards");
  expect(text()).toContain("No characters yet.");
  await click(byText("button", "Add a character"));
  await type(document.getElementById("card-name"), "Mara");
  await type(document.getElementById("card-voice"), "a low, weathered voice");
  await click(byText(".form__actions button", "Add"));
  expect(server.calls.find((c) => c[0] === "POST" && c[1] === "/v1/films/f1/cards")[2]).toEqual({ kind: "character", name: "Mara", description: "", voice: "a low, weathered voice" });
  expect(document.querySelector(".card-tile")?.textContent).toContain("Mara");
  // painted by the AI (a job): the card shows its picture at once — the job's result is the card
  await click(byText(".card-tile button", "Paint"));
  await settle();
  expect(server.calls.some((c) => c[0] === "POST" && c[1] === "/v1/cards/c1/paint")).toBe(true);
  expect(byText(".card-tile button", "Paint again")).toBeTruthy();
});

test("Cards: a character's voice made in JustVoice — its audition, the words it was made from, its models' licences; taken off", async () => {
  server.cards = [{ id: "c1", filmId: "f1", kind: "character", name: "Mara", description: "a ferry captain", voice: "", voiceSample: null, voiceSampleText: "", voiceSampleUrl: null, voiceId: null, voiceInfo: {}, voiceAuditionUrl: null, picture: null, pictureUrl: null, position: 0, version: '"c"' }];
  await mountPage("/films/f1/cards");
  await click(document.querySelector('[aria-label="Edit Mara"]'));
  expect(text()).toContain("No voice yet.");
  await click(byText(".card-dialog__sample button", "Make the voice"));
  await settle();
  expect(server.calls.filter(([m, p]) => m === "POST" && p === "/v1/cards/c1/voice")).toHaveLength(1);
  expect(document.querySelector('audio[aria-label="Mara\'s voice, as JustVoice auditioned it"]')?.getAttribute("src")).toContain("/v1/cards/c1/voice-audition");
  expect(text()).toContain("Made from: “Female, in her sixties, low and weathered.”");
  expect(text()).toContain("CosyVoice3 — selling what it makes: Yes");
  expect(byText(".card-dialog__sample button", "Make it again")).toBeTruthy();
  await click(byText(".card-dialog__sample button", "Take it off"));
  expect(server.calls.some(([m, p]) => m === "DELETE" && p === "/v1/cards/c1/voice")).toBe(true);
  expect(text()).toContain("No voice yet.");
  expect(reported).toHaveLength(0);
});

test("Cards: a character's voice recorded here, kept, its words saved with the card, then taken off", async () => {
  server.cards = [{ id: "c1", filmId: "f1", kind: "character", name: "Mara", description: "", voice: "", voiceSample: null, voiceSampleText: "", voiceSampleUrl: null, picture: null, pictureUrl: null, position: 0, version: '"c"' }];
  await mountPage("/films/f1/cards");
  await click(document.querySelector('[aria-label="Edit Mara"]'));
  expect(text()).toContain("Voice from a recording");
  expect(document.querySelector('audio[aria-label="Mara\'s voice recording"]')).toBeNull();
  await click(byText(".card-dialog__sample button", "Record"));
  expect(mic.started).toBe(1);
  await click(byText(".card-dialog__sample button", "Stop and keep"));
  const sent = server.calls.find((c) => c[0] === "POST" && c[1] === "/v1/cards/c1/voice-sample");
  expect(sent).toBeTruthy();
  expect(document.querySelector('audio[aria-label="Mara\'s voice recording"]')?.getAttribute("src")).toContain("/v1/cards/c1/voice-sample");
  // what it says, saved with the card's own Save
  await type(document.getElementById("card-sample-text"), "I've run this ferry for forty years.");
  await click(byText(".form__actions button", "Save"));
  expect(server.calls.find((c) => c[0] === "PATCH" && c[1] === "/v1/cards/c1")?.[2]).toEqual({ voiceSampleText: "I've run this ferry for forty years." });
  // taken off (the dialog Save closed has gone first)
  await new Promise((r) => setTimeout(r, 450));
  await flushPromises();
  await click(document.querySelector('[aria-label="Edit Mara"]'));
  await click(byText(".card-dialog__sample button", "Take off"));
  expect(server.calls.some((c) => c[0] === "DELETE" && c[1] === "/v1/cards/c1/voice-sample")).toBe(true);
  expect(document.querySelector('audio[aria-label="Mara\'s voice recording"]')).toBeNull();
});

test("Shots: no story, no plan; with one, Plan the shots runs as a job and shows the shots", async () => {
  await mountPage("/films/f1/shots");
  expect(text()).toContain("Write the story first");
  server.film.story = "Mara runs the last ferry.";
  await wrapper.unmount();
  await mountPage("/films/f1/shots");
  await click(byText(".ui-empty button", "Plan the shots"));
  await settle();
  expect(server.calls.some((c) => c[0] === "POST" && c[1] === "/v1/films/f1/plan")).toBe(true);
  expect(text()).toContain("Shot 2 happens.");
  expect(text()).toContain("3 shots · 12 s");
});

test("Shots: no language model set up — said before Plan the shots, with the way to the AI page", async () => {
  server.film.story = "Mara runs the last ferry.";
  server.route = { configured: false, detail: "No model is set." };
  await mountPage("/films/f1/shots");
  expect(text()).toContain("Planning the shots needs a language model");
  await click(byText(".ui-banner button", "Set up the AI"));
  expect(router.currentRoute.value.path).toBe("/ai");
});

test("a hand edit offers to carry it forward; the note goes with it", async () => {
  server.film.story = "x";
  server.shots = [shot(1, "Teo boards."), shot(2, "Mara gives Teo her thermos."), shot(3, "Teo sips.")];
  await mountPage("/films/f1/shots");
  await click(document.querySelector('[aria-label="Edit shot 2"]'));
  await type(document.getElementById("shot-action"), "Mara wraps her coat around Teo.");
  await click(byText(".form__actions button", "Save"));
  expect(server.calls.find((c) => c[0] === "PATCH")[2]).toMatchObject({ action: "Mara wraps her coat around Teo." });
  expect(text()).toContain("You changed shot 2.");
  await type(document.querySelector('[aria-label="What changed"]'), "Teo keeps the coat");
  await click(byText("button", "Carry it forward"));
  await settle();
  expect(server.calls.find((c) => c[1] === "/v1/shots/s2/carry")[2]).toEqual({ note: "Teo keeps the coat" });
  expect(text()).not.toContain("You changed shot 2.");
});

test("Shots: Speak runs as a job and the spoken line plays; a line changed after it says so", async () => {
  server.film.story = "x";
  server.shots = [{ ...shot(1, "Mara looks out."), line: "Last crossing.", speakerId: null }, shot(2, "The ferry leaves.")];
  await mountPage("/films/f1/shots");
  expect(document.querySelector("audio")).toBeNull();
  await click(document.querySelector('[aria-label="Speak shot 1\'s line"]'));
  await settle();
  expect(server.calls.some((c) => c[0] === "POST" && c[1] === "/v1/shots/s1/line")).toBe(true);
  const audio = document.querySelector('audio[aria-label="Shot 1\'s line, spoken"]');
  expect(audio?.getAttribute("src")).toContain("/v1/sounds/l-s1/audio");
  expect(text()).not.toContain("Words changed");
  // no speaker on the line: Speak lines has nothing to speak
  expect(byText("button", "Every line spoken")).toBeTruthy();
  // the words changed after the line was spoken
  server.shots = server.shots.map((s) => (s.id === "s1" ? { ...s, line: "The last crossing, for good." } : s));
  await wrapper.unmount();
  await mountPage("/films/f1/shots");
  expect(text()).toContain("Words changed");
});

test("Shots: a motion capture take's pose leads a clip; a take captured before takes kept their pose says so", async () => {
  server.film.story = "x";
  server.shots = [{ ...shot(1, "Mara crosses the deck."), mode: "guide", guideFrames: 0 }];
  server.takes = [
    { id: "t1", name: "Walk to the door", state: "done", files: ["bvh", "fbx", "pose"] },
    { id: "t0", name: "Before r4", state: "done", files: ["bvh", "fbx"] },
    { id: "t2", name: "Still running", state: "running", files: [] },
  ];
  await mountPage("/films/f1/shots");
  await click(document.querySelector('[aria-label="Shot 1\'s clip"]'));
  expect(text()).toContain("No guide video yet.");
  expect(text()).toContain("Or from a motion capture take");
  expect(text()).toContain("One take was captured before takes kept their pose");
  await click(byText("button", "Use its pose"));
  // the take's pose file, fetched from the kit's take, is the shot's guide video
  expect(server.calls.some((c) => c[0] === "GET" && c[1] === "/v1/mocap/takes/t1/files/pose")).toBe(true);
  expect(server.guideFile.name).toBe("Walk to the door-pose.mp4");
  expect(server.guideFile.type).toBe("video/mp4");
  expect(text()).toContain("Guide video: 24 frames");
  expect(reported).toEqual([]);
});

test("Shots: Repair lips only once Settings offers it; it says what it needs, runs as a job, and the repaired clip is listed", async () => {
  server.film.story = "x";
  server.shots = [{ ...shot(1, "Mara looks at Teo."), line: "The last crossing.", clipId: "k1", clipSeconds: 97 / 24 }];
  server.clips = [clip({ id: "k1", chosen: true, recipe: { mode: "one", talking: true, frames: 97, fps: 24 } })];
  await mountPage("/films/f1/shots");
  await click(document.querySelector('[aria-label="Shot 1\'s clip"]'));
  expect(byText("button", "Repair lips")).toBeUndefined();
  expect(text()).not.toContain("needs a face turned toward the camera");
  // turned on in Settings
  server.lipRepair = true;
  await wrapper.unmount();
  await mountPage("/films/f1/shots");
  await click(document.querySelector('[aria-label="Shot 1\'s clip"]'));
  expect(text()).toContain("It needs a face turned toward the camera");
  await click(byText("button", "Repair lips"));
  await settle();
  expect(server.calls.some((c) => c[0] === "POST" && c[1] === "/v1/clips/k1/lips")).toBe(true);
  expect(text()).toContain("4 s · Lips repaired");
  expect(reported).toEqual([]);
});

test("Cut: a shot without a clip is left out; a trim and a transition save; Export runs as a job and plays the film", async () => {
  server.shots = [
    { ...shot(1, "Mara looks out."), clipId: "c1", clipSeconds: 4, transition: "cut" },
    { ...shot(2, "The ferry leaves."), clipId: "c2", clipSeconds: 4 },
    shot(3, "Teo waves."),
  ];
  await mountPage("/films/f1/cut");
  expect(text()).toContain("2 of 3 shots in the film · 8 s");
  expect(text()).toContain("No clip yet — left out of the film");
  expect(document.querySelectorAll(".cut-timeline__piece")).toHaveLength(2);
  expect(document.querySelector("video")).toBeNull();

  await type(document.getElementById("trim-in-s1"), "0.5");
  await new Promise((r) => setTimeout(r, 450));
  await flushPromises();
  expect(server.calls.find((c) => c[0] === "PATCH" && c[1] === "/v1/shots/s1")?.[2]).toEqual({ trimIn: 0.5 });
  expect(text()).toContain("2 of 3 shots in the film · 7.5 s");

  wrapper.findAllComponents(quasar.QSelect).find((s) => s.element.querySelector("#transition-s1") || s.element.id === "transition-s1").vm.showPopup();
  await flushPromises();
  await click(byText(".ui-select-content .ui-select-item", "Dissolve"));
  expect(server.calls.filter((c) => c[0] === "PATCH" && c[1] === "/v1/shots/s1").at(-1)[2]).toEqual({ transition: "dissolve" });

  await click(byText("button", "Export the film"));
  await settle();
  expect(server.calls.some((c) => c[0] === "POST" && c[1] === "/v1/films/f1/export")).toBe(true);
  expect(document.querySelector('video[aria-label="The exported film"]')?.getAttribute("src")).toContain("/v1/films/f1/export/video");
  expect(text()).toContain("Download the film");
});

test("Cut: music made from words is laid over the film, its licence shown; its start saves", async () => {
  server.shots = [{ ...shot(1, "Mara looks out."), clipId: "c1", clipSeconds: 4 }];
  await mountPage("/films/f1/cut");
  expect(text()).toContain("No music or sound effects yet.");
  expect(text()).toContain("Made with Stable Audio 3 Medium · Stability AI Community License");
  await type(document.getElementById("sound-prompt"), "A slow string swell");
  await click(byText("button", "Make it"));
  await settle();
  expect(server.calls.find((c) => c[0] === "POST" && c[1] === "/v1/films/f1/sounds")[2]).toEqual({ kind: "music", prompt: "A slow string swell", start: 0 });
  expect(document.querySelector(".cut-sound")?.textContent).toContain("A slow string swell");
  expect(document.querySelectorAll(".cut-timeline__sound")).toHaveLength(1);
  await type(document.getElementById("start-m1"), "1.5");
  await new Promise((r) => setTimeout(r, 450));
  await flushPromises();
  expect(server.calls.find((c) => c[0] === "PATCH" && c[1] === "/v1/sounds/m1")?.[2]).toEqual({ start: 1.5 });
});

test("Cut: lyrics make the music a song — asked of the song feature, listed as Song", async () => {
  server.shots = [{ ...shot(1, "Mara looks out."), clipId: "c1", clipSeconds: 4 }];
  await mountPage("/films/f1/cut");
  await type(document.getElementById("sound-prompt"), "warm acoustic folk, a woman's voice");
  await type(document.getElementById("sound-lyrics"), "Still here, still here");
  // the banner and the model line follow the song's own feature
  expect(server.calls.some((c) => c[1] === "/v1/ai/features/sounds.song/readiness")).toBe(true);
  await click(byText("button", "Make it"));
  await settle();
  expect(server.calls.find((c) => c[0] === "POST" && c[1] === "/v1/films/f1/sounds")[2]).toEqual({ kind: "music", prompt: "warm acoustic folk, a woman's voice", start: 0, lyrics: "Still here, still here" });
  expect(document.querySelector(".cut-sound .ui-tag")?.textContent).toContain("Song");
  expect(document.getElementById("sound-prompt").value).toBe("");
  expect(document.getElementById("sound-lyrics").value).toBe("");
});
