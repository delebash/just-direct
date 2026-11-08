// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// A film's page mounted for real (app-structure §18) against a stand-in server in the real one's shapes: the tab in the
// address; the Story form's save with its version; a card added on the Cards tab; Plan the shots as a server job on the
// AI tasks strip (its result read again); a hand edit to a shot, then Carry it forward with the user's note; a line
// spoken and played; the Cut tab's trims, transitions, export and music.
import { installLlmUi, LlmUiHosts } from "@delebash/ui";
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
vi.mock("@delebash/ui", async (importOriginal) => ({ ...(await importOriginal()), reportError: (e) => reported.push(e) }));

const QUASAR_COMPONENTS = Object.fromEntries(Object.entries(quasar).filter(([k, v]) => /^Q[A-Z]/.test(k) && v?.name));

let server;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": status >= 400 ? "application/problem+json" : "application/json" } });

function fakeFetch(input, init = {}) {
  const url = new URL(String(input));
  const method = (init.method || "GET").toUpperCase();
  const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
  server.calls.push([method, url.pathname, body, init.headers?.["If-Match"] ?? init.headers?.["if-match"]]);
  const p = url.pathname;
  if (p === "/v1/settings") return Promise.resolve(json({ "films.width": 1280, "films.height": 704 }));
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
    server.sounds = [...server.sounds, sound({ id: "m1", kind: body.kind, prompt: body.prompt, seconds: 30, start: body.start, volume: 0.6 })];
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
  if (p.endsWith("/readiness")) return Promise.resolve(json({ ready: true, need: "", model: "sa3", modelState: { name: "Stable Audio 3 Medium", license: "Stability AI Community License" } }));
  if (p === "/v1/jobs/job-line") return Promise.resolve(json({ id: "job-line", state: "done", progress: 1, result: server.sounds.at(-1) }));
  if (p === "/v1/jobs/job-sound") return Promise.resolve(json({ id: "job-sound", state: "done", progress: 1, result: server.sounds.at(-1) }));
  if (p === "/v1/jobs/job-export") return Promise.resolve(json({ id: "job-export", state: "done", progress: 1, result: { file: server.exported.file, seconds: 7.5, shots: 2, skipped: 1 } }));
  if (p === "/v1/jobs/job-plan") return Promise.resolve(json({ id: "job-plan", state: "done", progress: 1, result: { shots: 3, cardsAdded: 2 } }));
  if (p === "/v1/jobs/job-carry") return Promise.resolve(json({ id: "job-carry", state: "done", progress: 1, result: { why: "Teo keeps the coat.", changed: ["s3"] } }));
  return Promise.resolve(json({}));
}
const shot = (n, action) => ({
  id: `s${n}`, filmId: "f1", position: n - 1, placeId: null, cardIds: [], size: "wide", camera: "static", action, line: "", speakerId: null,
  seconds: 4, transition: "cut", edited: false, frameId: null, clipId: null, clipSeconds: null, trimIn: 0, trimOut: 0, version: `"s${n}"`,
});
const sound = (s) => ({ filmId: "f1", shotId: null, start: 0, volume: 1, file: `${s.id}.wav`, audioUrl: `/v1/sounds/${s.id}/audio`, ...s });

let wrapper;
let router;
async function mountPage(path) {
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/films/:id/:tab?", component: FilmPage, props: true }, { path: "/", component: { render: () => null } }] });
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
  server = { calls: [], n: 1, film: { id: "f1", title: "The Last Ferry", story: "", look: "", width: 1280, height: 704, version: '"v1"' }, cards: [], shots: [], sounds: [], exported: null };
  reported.length = 0;
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

test("Cards: a character added from its kind's button", async () => {
  await mountPage("/films/f1/cards");
  expect(text()).toContain("No characters yet.");
  await click(byText("button", "Add a character"));
  await type(document.getElementById("card-name"), "Mara");
  await type(document.getElementById("card-voice"), "a low, weathered voice");
  await click(byText(".form__actions button", "Add"));
  expect(server.calls.find((c) => c[0] === "POST" && c[1] === "/v1/films/f1/cards")[2]).toEqual({ kind: "character", name: "Mara", description: "", voice: "a low, weathered voice" });
  expect(document.querySelector(".card-tile")?.textContent).toContain("Mara");
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
