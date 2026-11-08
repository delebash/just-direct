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

    /** Open a film: it and its cards. */
    async open(id) {
      if (this.film?.id !== id) {
        this.film = null;
        this.cards = [];
        this.cardsLoaded = false;
      }
      const [film, cards] = await Promise.all([get(`/v1/films/${enc(id)}`), get(`/v1/films/${enc(id)}/cards`)]);
      this.film = film;
      this.cards = cards.items;
      this.cardsLoaded = true;
      return film;
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
