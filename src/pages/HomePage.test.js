// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// The films screen mounted for real — Quasar installed as the app installs it and the kit's UI wired by installLlmUi
// (app-structure §18) — against a stand-in server answering /v1/films and /v1/settings the way the real one does: the
// states of §17 (loading, empty, failed with Retry, the list), New film's form of §15 (the schema's rules, a 422 under
// its field, the shape sent as its size), a film opened from its card, and a delete that asks first.
import { _resolveDialog, installLlmUi, LlmUiHosts } from "@delebash/ui";
import { QUASAR_TEST_OPTIONS } from "@delebash/ui/quasar/install.js";
import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import * as quasar from "quasar";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { h } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { i18n } from "../i18n/index.js";
import HomePage from "./HomePage.vue";

const reported = [];
vi.mock("@delebash/ui", async (importOriginal) => ({ ...(await importOriginal()), reportError: (e) => reported.push(e) }));

const QUASAR_COMPONENTS = Object.fromEntries(Object.entries(quasar).filter(([k, v]) => /^Q[A-Z]/.test(k) && v?.name));

let server;
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": status >= 400 ? "application/problem+json" : "application/json" } });
const at = () => new Date().toISOString();

function fakeFetch(input, init = {}) {
  const url = new URL(String(input));
  const method = (init.method || "GET").toUpperCase();
  server.calls.push([method, url.pathname, typeof init.body === "string" ? JSON.parse(init.body) : undefined]);
  if (server.down) return Promise.resolve(json({ type: "x/internal", title: "Internal Server Error", status: 500, detail: "disk on fire" }, 500));
  if (url.pathname === "/v1/settings") return Promise.resolve(json({ "films.width": 1280, "films.height": 704 }));
  if (url.pathname === "/v1/films" && method === "GET") return server.list ?? Promise.resolve(json({ items: server.films }));
  if (url.pathname === "/v1/films" && method === "POST") {
    const body = JSON.parse(init.body);
    if (!body.title) {
      return Promise.resolve(json({ type: "x/validation-error", title: "Validation Error", status: 422, errors: [{ loc: ["body", "title"], msg: "too short", type: "string_too_short", ctx: { min_length: 1 } }] }, 422));
    }
    const film = { id: `f${server.films.length + 1}`, story: "", look: "", cardCount: 0, shotCount: 0, createdAt: at(), updatedAt: at(), version: '"v1"', ...body };
    server.films.unshift(film);
    return Promise.resolve(json(film, 201));
  }
  const m = url.pathname.match(/^\/v1\/films\/(.+)$/);
  if (m && method === "DELETE") {
    server.films = server.films.filter((f) => f.id !== m[1]);
    return Promise.resolve(new Response(null, { status: 204 }));
  }
  return Promise.resolve(json({}));
}

let wrapper;
let router;
async function mountPage() {
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/", component: { render: () => null } }, { path: "/films/:id/:tab?", component: { render: () => null } }] });
  router.push("/");
  await router.isReady();
  const Host = { render: () => [h(quasar.QLayout, { view: "hhh lpr fff" }, () => h(quasar.QPageContainer, () => h(HomePage))), h(LlmUiHosts)] };
  wrapper = mount(Host, {
    attachTo: document.body,
    global: {
      plugins: [[quasar.Quasar, { ...QUASAR_TEST_OPTIONS, components: QUASAR_COMPONENTS }], i18n, createPinia(), router, { install: (app) => installLlmUi(app, { i18n, external: false }) }],
      directives: { tooltip: {} },
    },
  });
  await flushPromises();
  return wrapper;
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

beforeEach(() => {
  server = { films: [], calls: [] };
  reported.length = 0;
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })));
});
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("the states", () => {
  test("loading shows the loading state, never the empty one", async () => {
    let answer;
    server.list = new Promise((resolve) => (answer = resolve));
    try {
      await mountPage();
      expect(document.querySelector(".q-inner-loading")).not.toBeNull();
      expect(text()).not.toContain("No films yet");
    } finally {
      answer(json({ items: [] }));
      await flushPromises();
    }
    expect(text()).toContain("No films yet");
  });

  test("failed says why, and Retry reads again", async () => {
    server.down = true;
    await mountPage();
    expect(text()).toContain("Couldn't load your films");
    server.down = false;
    server.films = [{ id: "f1", title: "The Last Ferry", width: 1280, height: 704, cardCount: 3, shotCount: 12, updatedAt: at(), version: '"v"' }];
    await click(byText("button", "Retry"));
    expect(text()).toContain("The Last Ferry");
    expect(text()).toContain("3 cards · 12 shots");
  });
});

test("New film: the title's rule, the shape sent as its size, the film opened", async () => {
  await mountPage();
  await click(byText("button", "New film"));
  expect(text()).toContain("Wide · 1280×704");
  expect(text()).toContain("Tall · 704×1280");
  expect(text()).toContain("Square · 1024×1024");
  await click(byText("button", "Create film"));
  expect(server.calls.filter((c) => c[0] === "POST")).toHaveLength(0); // the schema's rule stopped it
  await type(document.getElementById("film-title"), "The Last Ferry");
  await click(byText('[role="radio"]', "Tall"));
  await click(byText("button", "Create film"));
  const posted = server.calls.find((c) => c[0] === "POST" && c[1] === "/v1/films");
  expect(posted[2]).toMatchObject({ title: "The Last Ferry", width: 704, height: 1280 });
  expect(router.currentRoute.value.path).toBe("/films/f1");
});

test("a film opens from its card's picture — a click, or Enter on it — its name the film's", async () => {
  server.films = [
    { id: "f1", title: "The Last Ferry", width: 1280, height: 704, cardCount: 3, shotCount: 12, updatedAt: at(), version: '"v"' },
    { id: "f2", title: "The Last Light", width: 1280, height: 704, cardCount: 8, shotCount: 3, updatedAt: at(), version: '"v"' },
  ];
  await mountPage();
  const link = document.querySelector('[role="link"][aria-label="Open “The Last Ferry”"]');
  expect(link.getAttribute("tabindex")).toBe("0");
  await click(link);
  expect(router.currentRoute.value.path).toBe("/films/f1");
  await new DOMWrapper(document.querySelector('[role="link"][aria-label="Open “The Last Light”"]')).trigger("keydown", { key: "Enter" });
  await flushPromises();
  expect(router.currentRoute.value.path).toBe("/films/f2");
  // no raw button on the page: the card is Quasar's, its menu the kit's
  expect(document.querySelectorAll(".film-card button:not(.ui-btn)")).toHaveLength(0);
});

test("a delete asks first, naming what is lost", async () => {
  server.films = [{ id: "f1", title: "The Last Ferry", width: 1280, height: 704, cardCount: 0, shotCount: 0, updatedAt: at(), version: '"v"' }];
  await mountPage();
  await click(document.querySelector('[aria-label="More for “The Last Ferry”"]'));
  await click(byText('[role="menuitem"]', "Delete film"));
  expect(text()).toContain("its cards, shots, pictures, clips and sounds");
  _resolveDialog(true);
  await flushPromises();
  expect(server.calls.some((c) => c[0] === "DELETE" && c[1] === "/v1/films/f1")).toBe(true);
  expect(text()).toContain("No films yet");
});
