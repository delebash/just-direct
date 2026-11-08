// SPDX-License-Identifier: MIT
// The smoke suite — the REAL desktop app (Electron, the built UI from app://) driven through
// Playwright (app-structure §10, §18). It asserts the CONTRACT, not pixels: the shell mounts, the
// nav works, the AI status button and the AI-tasks toggle behave, a film and its card are made through the
// window and reach the server, the once-ever AI offer comes once, Settings shows the family's
// sections in their order. Hermetic (lib/driver.js): a temp data folder, the harness's own server,
// the shell's <ID>_DEV_NO_SERVER=1. One launch shared by the tests, in order.
//
// Before: `npm run build:unpacked` (the harness drives what was last built). Run: `npm test` from
// the app's root.

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { Driver, waitFor } from "../lib/driver.js";

// The version About shows: the app's own, where `npm run bump` writes it (a literal broke on the first bump).
const VERSION = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;

const d = new Driver();
let page;

before(async () => {
  await d.launch();
  page = d.page;
  await page.waitForSelector(".shell", { timeout: 30_000 });
});

after(async () => {
  await d.close();
});

test("the window is the app's", async () => {
  assert.equal(await page.title(), "JustDirect");
  assert.match(page.url(), /^app:\/\/justdirect\//);
});

test("the shell mounts: the title bar, the nav and the AI status button", async () => {
  await page.locator(".titlebar").waitFor();
  await page.locator(".shell__nav").waitFor();
  const labels = await page.locator(".shell__nav .navlink").allTextContents();
  for (const word of ["Films", "Motion capture", "AI Settings", "App Settings", "AI tasks"]) {
    assert.ok(labels.some((l) => l.includes(word)), `the nav has "${word}" (${labels.join(" | ")})`);
  }
  assert.equal(await page.locator(".titlebar .ai-status-btn").count(), 1, "the kit's AiStatusButton is in the title bar");
});

test("the boot plate is gone once the app shows", async () => {
  assert.equal(await page.locator("#app-boot").count(), 0);
});

test("the nav works: Motion capture, AI Settings, App Settings and Films open their pages", async () => {
  // the kit's Motion capture screen (MocapArea) mounts inside the app's page, its readiness asked of the server
  await page.locator(".navlink", { hasText: "Motion capture" }).click();
  await page.waitForURL(/#\/mocap$/);
  await page.locator(".pane-h1", { hasText: "Motion capture" }).waitFor();

  await page.locator(".navlink", { hasText: "AI Settings" }).click();
  await page.waitForURL(/#\/ai$/);
  await page.locator(".pane-h1", { hasText: "Providers, models and usage" }).waitFor();

  await page.locator(".navlink", { hasText: "App Settings" }).click();
  await page.waitForURL(/#\/settings/);
  await page.locator(".pane-h1", { hasText: "Settings" }).waitFor();

  await page.locator(".navlink", { hasText: "Films" }).click();
  await page.waitForURL(/#\/$/);
  await page.locator(".pane-h1", { hasText: "Your films" }).waitFor();
});

test("the AI-tasks row is a real toggle: it opens, stays open, and a second click closes it", async () => {
  // Behaviour, not presence: without the kit's navAttrs the opening click was also the panel's
  // outside-click, and it shut at once (docgen, 2026-08-03).
  const row = page.locator(".navlink", { hasText: "AI tasks" });
  await row.click();
  await page.waitForTimeout(400); // long enough for a wrong dismiss to have fired
  assert.equal(await page.locator('[role="dialog"][aria-label="AI tasks"]').count(), 1, "the panel opens and stays open");
  // a modal panel since the sixteenth review (Quasar's QDialog): the second click lands on its backdrop, over the
  // row, and closes it; Escape closes it too and gives the focus back to the row
  await row.click({ force: true });
  await page.locator('[role="dialog"][aria-label="AI tasks"]').waitFor({ state: "detached" });
  await row.click();
  await page.locator('[role="dialog"][aria-label="AI tasks"]').waitFor();
  await page.keyboard.press("Escape");
  await page.locator('[role="dialog"][aria-label="AI tasks"]').waitFor({ state: "detached" });
  assert.equal(await row.evaluate((el) => el === document.activeElement || el.contains(document.activeElement)), true, "the focus is back on the row");
});

test("Settings shows General, then the family's seven sections in canon order", async () => {
  await d.navigate("#/settings/general");
  await page.locator(".set-shell").waitFor();
  const tabs = (await page.locator(".set-shell [role=tab]").allTextContents()).map((s) => s.trim()).filter(Boolean);
  assert.deepEqual(tabs, ["General", "Appearance", "Backups", "Storage", "Server", "Logs", "Updates", "About"]);
  await d.navigate("#/settings/about");
  await page.locator(".ui-formgrid td", { hasText: VERSION }).waitFor(); // the version, from the server (the kit's AboutPanel)
});

test("a film and its card are made through the window, saved by the server, and the AI offer comes once", async () => {
  await d.navigate("#/");
  await page.locator(".ui-empty", { hasText: "No films yet" }).waitFor();

  // the form refuses an empty title before anything is sent
  await page.locator(".ui-empty button", { hasText: "New film" }).click();
  await page.locator("#film-title").waitFor();
  await page.locator(".form__actions button", { hasText: "Create film" }).click();
  await page.locator(".ui-modal", { hasText: "Required" }).waitFor();
  assert.deepEqual((await d.api("/films")).items, []);

  await page.locator("#film-title").fill("From the real window");
  await page.locator("#film-look").fill("moody 35mm film");
  await page.locator(".form__actions button", { hasText: "Create film" }).click();
  // the new film opens on its Story tab
  await page.waitForURL(/#\/films\/[0-9a-f-]+$/);
  await page.locator(".pane-h1", { hasText: "From the real window" }).waitFor();

  const saved = (await d.api("/films")).items;
  assert.equal(saved.length, 1);
  assert.equal(saved[0].title, "From the real window");
  assert.equal(saved[0].look, "moody 35mm film");
  assert.deepEqual([saved[0].width, saved[0].height], [1280, 704]);

  // the first film is this app's moment for the once-ever AI offer (no AI set up in a fresh folder)
  const offer = page.locator(".ui-modal", { hasText: "Set up AI features" });
  await offer.waitFor();
  await offer.locator("button", { hasText: "Skip for now" }).click();
  await offer.waitFor({ state: "detached" });
  // the kit batches preference writes: wait for this one to reach the server
  const kept = await waitFor(async () => (await d.api("/prefs")).aiOfferShown === true);
  assert.ok(kept, "the flag is kept by the server");

  // a character card on the Cards tab; the painter's engine isn't installed in a fresh folder, and the tab says so
  await page.locator('[role="tab"]', { hasText: "Cards" }).click();
  await page.locator(".lu-needed", { hasText: "Painting a card's picture" }).waitFor();
  await page.locator(".cards-kind button", { hasText: "Add a character" }).click();
  await page.locator("#card-name").fill("Mara");
  await page.locator("#card-description").fill("Sixty-one, grey braid, yellow oilskin coat");
  await page.locator(".form__actions button", { hasText: "Add" }).click();
  await page.locator(".card-tile", { hasText: "Mara" }).waitFor();
  const cards = (await d.api(`/films/${saved[0].id}/cards`)).items;
  assert.deepEqual(
    cards.map((c) => [c.kind, c.name]),
    [["character", "Mara"]],
  );

  // the Cut tab: no shots yet, and the way to them; the tab is in the address
  await page.locator('[role="tab"]', { hasText: "Cut" }).click();
  await page.locator(".ui-empty", { hasText: "Nothing to cut yet" }).waitFor();
  assert.match(await page.evaluate(() => location.hash), /\/cut$/);
  await page.locator(".ui-empty button", { hasText: "Go to the shots" }).click();
  await page.locator('[role="tab"][aria-selected="true"]', { hasText: "Shots" }).waitFor();

  // a second film: no offer again
  await d.navigate("#/");
  await page.locator(".pane-actions button", { hasText: "New film" }).click();
  await page.locator("#film-title").fill("The second one");
  await page.locator(".form__actions button", { hasText: "Create film" }).click();
  await page.locator(".pane-h1", { hasText: "The second one" }).waitFor();
  await page.waitForTimeout(600);
  assert.equal(await page.locator(".ui-modal", { hasText: "Set up AI features" }).count(), 0, "the offer never comes twice");
});

// The kit's second windows (2026-10-29, JustWrite's "Open in new window"): window.open of the app's own page is another
// window of the app — the shell's preload bridge, its server — and any other window.open is refused.
test("window.open of the app's own page opens another window of the app, which closes alone; a data: page is refused", async () => {
  const [child] = await Promise.all([d.app.waitForEvent("window"), page.evaluate(() => void window.open("#/settings/about", "_blank", "noopener"))]);
  await child.waitForSelector(".shell", { timeout: 30_000 });
  assert.match(child.url(), /^app:\/\/justdirect\/.*#\/settings\/about/);
  assert.equal(await child.evaluate(() => typeof window.appShell?.invoke), "function", "the shell's preload ran in it");
  assert.equal(await child.evaluate(() => window.appShell.invoke("updateStatus").then((s) => typeof s.state)), "string", "the shell answers it");
  const open = d.app.windows().length;
  await page.evaluate(() => void window.open("data:text/html,refused"));
  await new Promise((r) => setTimeout(r, 1000));
  assert.equal(d.app.windows().length, open, "no window for a data: page");
  await child.close();
  await waitFor(async () => d.app.windows().length === 1, { what: "the second window closed, the app still open" });
  assert.ok(await page.evaluate(() => !!document.querySelector(".shell")));
});
