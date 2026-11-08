// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// The kit's Motion capture screen (MocapArea, mounted by pages/MocapPage.vue) over a stand-in server in the kit's
// shapes (just-core llm/mocap_api.js; just-mocap's brief, docs/plans/2026-11-08-justdirect-mocap-brief.md §5): the
// engine ready, one captured take — its files listed, one saved (fetched from the take's folder), its foot contacts
// strip — and Capture again posting the take's run.
import { QUASAR_TEST_OPTIONS } from "@delebash/ui/quasar/install.js";
import MocapArea from "@delebash/ui/views/MocapArea.vue";
import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import * as quasar from "quasar";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { i18n } from "../i18n/index.js";

const QUASAR_COMPONENTS = Object.fromEntries(Object.entries(quasar).filter(([k, v]) => /^Q[A-Z]/.test(k) && v?.name));
const plugins = () => [[quasar.Quasar, { ...QUASAR_TEST_OPTIONS, components: QUASAR_COMPONENTS }], i18n, createPinia()];

let server;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const TAKE = { id: "t1", name: "Walk in the yard", sourceName: "walk.mp4", state: "done", error: "", files: ["bvh", "fbx", "preview", "contacts"], options: {}, job: null, createdAt: Date.now() - 60_000 };
function fakeFetch(input, init = {}) {
  const url = new URL(String(input), "http://127.0.0.1:17500");
  const method = (init.method || "GET").toUpperCase();
  const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
  server.calls.push([method, url.pathname, body]);
  const p = url.pathname;
  if (p === "/v1/mocap/readiness") return Promise.resolve(json({ ready: true, need: "" }));
  if (p === "/v1/mocap/takes" && method === "GET") return Promise.resolve(json({ takes: [server.take] }));
  // the take's foot contacts: two feet, each planted twice
  if (p === "/v1/mocap/takes/t1/contacts" && method === "GET") {
    const ranges = [
      [
        [0, 20],
        [40, 60],
      ],
      [
        [20, 40],
        [60, 80],
      ],
    ];
    return Promise.resolve(json({ fps: 30, frames: 90, mode: "flat", edited: false, automatic: ranges, applied: ranges }));
  }
  if (p === "/v1/mocap/takes/t1/run" && method === "POST") return Promise.resolve(json({ id: "job-take", state: "running", progress: 0 }, 202));
  if (p === "/v1/jobs/job-take") return Promise.resolve(json({ id: "job-take", state: "done", progress: 1, result: { ...server.take } }));
  return Promise.resolve(json({}));
}

let wrapper;
beforeEach(() => {
  server = { calls: [], take: { ...TAKE } };
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  // the browser's download takes the file as a blob URL (jsdom has none)
  URL.createObjectURL ??= () => "blob:take-file";
  URL.revokeObjectURL ??= () => {};
});
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});
const text = () => document.body.textContent;
const settle = async () => {
  for (let i = 0; i < 6; i++) await flushPromises();
};

test("the takes: one captured, its files to save, its foot contacts; Capture again posts the take's run from the start", async () => {
  wrapper = mount(MocapArea, { attachTo: document.body, global: { plugins: plugins() } });
  await settle();
  // the list, the take picked, its state
  expect(text()).toContain("Walk in the yard");
  expect(text()).toContain("Done");
  // its files, each with its own Download — the kit's saveUrlAs (the shell's Save dialog in the app; in a browser, the
  // file fetched from the take's own folder and handed to the browser's download)
  const rows = [...document.body.querySelectorAll(".take__files li")];
  expect(rows.map((li) => li.textContent.trim())).toEqual(expect.arrayContaining([expect.stringContaining("FBX"), expect.stringContaining("BVH")]));
  await new DOMWrapper(rows.find((li) => li.textContent.includes("BVH")).querySelector("button")).trigger("click");
  await settle();
  expect(server.calls.some(([m, p]) => m === "GET" && p === "/v1/mocap/takes/t1/files/bvh")).toBe(true);
  // the contacts strip, a row per foot with where it is planted
  const strips = [...document.body.querySelectorAll(".contacts__strip")].map((s) => s.getAttribute("aria-label"));
  expect(strips).toHaveLength(2);
  expect(strips[0]).toContain("0–20");
  expect(strips[1]).toContain("60–80");
  // Capture again: the run, made fresh
  const again = [...document.body.querySelectorAll("button")].find((b) => b.textContent.includes("Capture again from the start"));
  expect(again).toBeTruthy();
  await wrapper.findAll("button").find((b) => b.text().includes("Capture again from the start")).trigger("click");
  await settle();
  const run = server.calls.find(([m, p]) => m === "POST" && p === "/v1/mocap/takes/t1/run");
  expect(run?.[2]).toMatchObject({ fresh: true });
});
