// SPDX-License-Identifier: MIT
// Screenshot capture — drives the REAL desktop app (Electron, the built UI from app://) through every
// surface and saves PNGs of its real rendering into e2e/shots/ (gitignored). `npm run screenshots`
// from the app's root (app-structure §10). docgen's capture-direct.js is the donor.
//
// Hermetic like the smoke (lib/driver.js): a temp data folder with one example film (its story, two cards and three
// shots, made through the API — no AI runs), the harness's own server, the shell's <ID>_DEV_NO_SERVER=1 — the shots
// never show or change your own data.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Driver } from "./lib/driver.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(here, "shots");

const json = (body) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** The example film the shots show: a story, a character with a voice, a place, three shots with a line. */
async function exampleFilm(d) {
  const film = await d.api("/films", json({ title: "The Last Ferry", look: "moody 35mm film, overcast light", story: "Mara runs the last ferry across the grey sound. On its final crossing she paints over the boat's name and hands her thermos to Teo, the boy who rides it every day." }));
  const mara = await d.api(`/films/${film.id}/cards`, json({ kind: "character", name: "Mara", description: "a woman in her sixties, grey braid, yellow oilskin coat", voice: "a low, weathered woman's voice, calm and dry" }));
  const deck = await d.api(`/films/${film.id}/cards`, json({ kind: "place", name: "The ferry deck", description: "a small car ferry's open deck, rain-wet steel, grey sea" }));
  const shots = [
    { size: "wide", camera: "slow push in", action: "The ferry crosses the grey sound in the rain.", placeId: deck.id, cardIds: [], seconds: 5, transition: "dissolve" },
    { size: "medium", camera: "static", action: "Mara paints over the boat's name.", placeId: deck.id, cardIds: [mara.id], seconds: 4, line: "This is the last crossing, for good.", speakerId: mara.id },
    { size: "close-up", camera: "handheld", action: "Mara hands her thermos to Teo.", placeId: deck.id, cardIds: [mara.id], seconds: 3, transition: "fade" },
  ];
  for (const s of shots) await d.api(`/films/${film.id}/shots`, json(s));
  return film;
}

const SURFACES = (film) => [
  { name: "home", hash: "#/", ready: ".film-card" },
  { name: "film-story", hash: `#/films/${film.id}/story` },
  { name: "film-cards", hash: `#/films/${film.id}/cards` },
  { name: "film-shots", hash: `#/films/${film.id}/shots`, ready: ".shot-row" },
  { name: "film-cut", hash: `#/films/${film.id}/cut`, ready: ".cut-row" },
  // the kit's Motion capture screen: no takes in a fresh folder, so its empty state
  { name: "mocap", hash: "#/mocap", ready: ".mocap .ui-empty" },
  // the engines' tabs come once the server has checked each engine
  { name: "ai", hash: "#/ai", ready: '[role="tab"]:has-text("Images")' },
  { name: "settings-general", hash: "#/settings/general" },
  { name: "settings-appearance", hash: "#/settings/appearance" },
  { name: "settings-backups", hash: "#/settings/backups" },
  { name: "settings-storage", hash: "#/settings/storage" },
  { name: "settings-server", hash: "#/settings/server" },
  { name: "settings-logs", hash: "#/settings/logs" },
  { name: "settings-updates", hash: "#/settings/updates" },
  { name: "settings-about", hash: "#/settings/about" },
  { name: "not-found", hash: "#/no-such-page" },
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const d = new Driver();
  console.log("→ starting the server and the desktop app (hermetic)");
  await d.startServer();
  // one example film, through the API, so the screens have something to show
  const film = await exampleFilm(d);
  await d.api("/prefs", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ aiOfferShown: true }) });
  await d.launch();
  await d.maximize();
  await d.page.waitForSelector(".shell", { timeout: 30_000 });
  try {
    for (const s of SURFACES(film)) {
      console.log(`→ ${s.name} (${s.hash})`);
      await d.navigate(s.hash);
      if (s.ready) await d.page.waitForSelector(s.ready, { timeout: 10_000 }).catch(() => console.log(`  (${s.ready} not shown)`));
      await d.page.waitForLoadState("networkidle").catch(() => {});
      await d.page.waitForTimeout(600); // let transitions settle before the picture
      await d.screenshot(path.join(OUT_DIR, `${s.name}.png`));
    }
    // a shot open for a hand edit — a dialog never shows in a route's shot
    console.log("→ shot-editor (dialog)");
    await d.navigate(`#/films/${film.id}/shots`);
    await d.page.locator('[aria-label="Edit shot 2"]').click();
    await d.page.waitForSelector("#shot-action");
    await d.page.waitForTimeout(400);
    await d.screenshot(path.join(OUT_DIR, "shot-editor.png"));
    // a character's card open: its description, its voice words, Their voice (none made yet) and the recording
    console.log("→ card-editor (dialog)");
    await d.navigate(`#/films/${film.id}/cards`);
    await d.page.locator('[aria-label="Edit Mara"]').click();
    await d.page.waitForSelector("#card-name");
    await d.page.waitForTimeout(400);
    await d.screenshot(path.join(OUT_DIR, "card-editor.png"));
  } finally {
    console.log("→ closing");
    await d.close();
  }
  console.log(`done — ${OUT_DIR}`);
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
