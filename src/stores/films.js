// SPDX-License-Identifier: MIT
// The films store (app-structure §4: one store per domain): the list of films, and the film open on its page with its
// cards. The server owns them (family rule 2); this holds what the screens show and calls /v1/films and /v1/cards
// through the kit's transport. A failed call throws the kit's Error (§15) and the page decides how to show it.
// Long work (a card's picture painted) is a server job on the AI tasks strip (the kit's runServerJob).
import { del, get, patch as patchJson, post, postForm, runServerJob } from "@delebash/ui";
import { defineStore } from "pinia";

const enc = encodeURIComponent;
// a change or a delete made on what was read sends its version (If-Match — the kit's platform/versions.js): the server
// refuses one made on another (412, changed in another window)
const ifMatch = (version) => (version ? [{ headers: { "If-Match": version } }] : []);

/** The kinds of card, in the order the screens show them (the server's database/films.js CARD_KINDS). */
export const CARD_KINDS = ["character", "place", "prop", "look"];

export const useFilmsStore = defineStore("films", {
  state: () => ({
    items: [],
    loading: false,
    loaded: false,
    // the film open on its page, and its cards
    film: null,
    cards: [],
    cardsLoaded: false,
    // cards whose picture is being painted: id → true
    painting: {},
    // the open film's shots, in film order
    shots: [],
    shotsLoaded: false,
    // the film being planned, and the shot whose change is being carried forward
    planning: false,
    carrying: null,
    // shots whose first frames are being painted: id → true; the whole film's
    framing: {},
    framingFilm: false,
  }),
  getters: {
    cardsOf: (state) => (kind) => state.cards.filter((c) => c.kind === kind),
    cardById: (state) => (id) => state.cards.find((c) => c.id === id) ?? null,
  },
  actions: {
    async load() {
      this.loading = true;
      try {
        this.items = (await get("/v1/films")).items;
        this.loaded = true;
      } finally {
        this.loading = false;
      }
    },
    async create(input) {
      const film = await post("/v1/films", input);
      this.items = [film, ...this.items];
      return film;
    },
    async remove(film) {
      await del(`/v1/films/${enc(film.id)}`, ...ifMatch(film.version));
      this.items = this.items.filter((f) => f.id !== film.id);
      if (this.film?.id === film.id) this.film = null;
    },

    /** Open a film: it, its cards and its shots. */
    async open(id) {
      if (this.film?.id !== id) {
        this.film = null;
        this.cards = [];
        this.cardsLoaded = false;
        this.shots = [];
        this.shotsLoaded = false;
      }
      const [film, cards, shots] = await Promise.all([get(`/v1/films/${enc(id)}`), get(`/v1/films/${enc(id)}/cards`), get(`/v1/films/${enc(id)}/shots`)]);
      this.film = film;
      this.cards = cards.items;
      this.cardsLoaded = true;
      this.shots = shots.items;
      this.shotsLoaded = true;
      return film;
    },
    async loadShots() {
      this.shots = (await get(`/v1/films/${enc(this.film.id)}/shots`)).items;
      this.shotsLoaded = true;
    },
    async addShot(input) {
      const shot = await post(`/v1/films/${enc(this.film.id)}/shots`, input);
      await this.loadShots();
      return shot;
    },
    async saveShot(shot, changes) {
      const saved = await patchJson(`/v1/shots/${enc(shot.id)}`, changes, ...ifMatch(shot.version));
      this.shots = this.shots.map((s) => (s.id === saved.id ? saved : s));
      return saved;
    },
    async removeShot(shot) {
      await del(`/v1/shots/${enc(shot.id)}`, ...ifMatch(shot.version));
      await this.loadShots();
    },
    /** Move a shot one place earlier (-1) or later (+1). */
    async moveShot(shot, by) {
      const ids = this.shots.map((s) => s.id);
      const i = ids.indexOf(shot.id);
      const j = i + by;
      if (i < 0 || j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      this.shots = (await post(`/v1/films/${enc(this.film.id)}/shots/order`, { ids })).items;
    },
    /** The AI plans the film from its story: the cards it needs, then the shots (a server job on the AI tasks strip). */
    async plan(label, { replace = false } = {}) {
      this.planning = true;
      try {
        const done = await runServerJob({
          start: () => post(`/v1/films/${enc(this.film.id)}/plan`, { replace }),
          feature: "plan.shots",
          label,
          meta: { filmId: this.film.id },
          describe: (job, pct) => (job.message ? `${job.message} · ${pct}%` : `${pct}%`),
        });
        return done?.result ?? null;
      } finally {
        this.planning = false;
        await this.open(this.film.id).catch(() => {});
      }
    },
    /** A shot's first frames, the best checked first. */
    async framesOf(shot) {
      return (await get(`/v1/shots/${enc(shot.id)}/frames`)).items;
    },
    /** Paint a shot's first frames (a server job): candidates painted, checked, the best chosen. */
    async paintFrames(shot, label, { count } = {}) {
      this.framing = { ...this.framing, [shot.id]: true };
      try {
        const done = await runServerJob({
          start: () => post(`/v1/shots/${enc(shot.id)}/frames`, count ? { count } : {}),
          feature: "frames.paint",
          label,
          meta: { shotId: shot.id },
          describe: (job, pct) => (job.message ? `${job.message} · ${pct}%` : `${pct}%`),
        });
        return done?.result ?? null;
      } finally {
        const { [shot.id]: _, ...rest } = this.framing;
        this.framing = rest;
        await this.loadShots().catch(() => {});
      }
    },
    /** Paint the first frames of every shot that has none, or of every shot (a server job). */
    async paintAllFrames(label, { all = false } = {}) {
      this.framingFilm = true;
      try {
        const done = await runServerJob({
          start: () => post(`/v1/films/${enc(this.film.id)}/frames`, { all }),
          feature: "frames.paint",
          label,
          meta: { filmId: this.film.id },
          describe: (job, pct) => (job.message ? `${job.message} · ${pct}%` : `${pct}%`),
        });
        return done?.result ?? null;
      } finally {
        this.framingFilm = false;
        await this.loadShots().catch(() => {});
      }
    },
    async chooseFrame(shot, frameId) {
      const saved = await post(`/v1/shots/${enc(shot.id)}/frame`, { frameId });
      this.shots = this.shots.map((s) => (s.id === saved.id ? saved : s));
      return saved;
    },
    async deleteFrame(frame) {
      await del(`/v1/frames/${enc(frame.id)}`);
      await this.loadShots();
    },
    /** A hand edit to `shot` carried into the later shots nobody changed by hand (a server job). */
    async carry(shot, note, label) {
      this.carrying = shot.id;
      try {
        const done = await runServerJob({ start: () => post(`/v1/shots/${enc(shot.id)}/carry`, { note }), feature: "plan.revise", label, meta: { shotId: shot.id } });
        return done?.result ?? null;
      } finally {
        this.carrying = null;
        await this.loadShots().catch(() => {});
      }
    },
    async saveFilm(changes) {
      const film = await patchJson(`/v1/films/${enc(this.film.id)}`, changes, ...ifMatch(this.film.version));
      this.film = film;
      return film;
    },

    async addCard(input) {
      const card = await post(`/v1/films/${enc(this.film.id)}/cards`, input);
      this.cards = [...this.cards, card];
      return card;
    },
    _put(card) {
      this.cards = this.cards.map((c) => (c.id === card.id ? card : c));
      return card;
    },
    async saveCard(card, changes) {
      return this._put(await patchJson(`/v1/cards/${enc(card.id)}`, changes, ...ifMatch(card.version)));
    },
    async removeCard(card) {
      await del(`/v1/cards/${enc(card.id)}`, ...ifMatch(card.version));
      this.cards = this.cards.filter((c) => c.id !== card.id);
    },
    /** A picture from a file (PNG, JPEG or WebP). */
    async uploadPicture(card, file) {
      const form = new FormData();
      form.append("file", file, file.name);
      return this._put(await postForm(`/v1/cards/${enc(card.id)}/picture`, form));
    },
    async removePicture(card) {
      return this._put(await del(`/v1/cards/${enc(card.id)}/picture`));
    },
    /** The AI paints the card's picture (a server job on the AI tasks strip); the card comes back with it. */
    async paintPicture(card, label) {
      this.painting = { ...this.painting, [card.id]: true };
      try {
        const done = await runServerJob({ start: () => post(`/v1/cards/${enc(card.id)}/paint`, {}), feature: "cards.paint", label, meta: { cardId: card.id } });
        return done?.result ? this._put(done.result) : null;
      } finally {
        const { [card.id]: _, ...rest } = this.painting;
        this.painting = rest;
      }
    },
  },
});
