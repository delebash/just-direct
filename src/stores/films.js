// SPDX-License-Identifier: MIT
// The films store (app-structure §4: one store per domain): the list of films, and the film open on its page with its
// cards. The server owns them (family rule 2); this holds what the screens show and calls /v1/films and /v1/cards
// through the kit's transport. A failed call throws the kit's Error (§15) and the page decides how to show it.
// Long work (a card's picture painted) is a server job on the AI tasks strip (the kit's runServerJob, which resolves
// with the job's result itself — not a job wrapped around it).
import { del, get, patch as patchJson, post, postForm, runServerJob, saveUrlAs } from "@delebash/ui";
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
    // shots whose clip is being made: id → true; the whole film's
    clipping: {},
    clippingFilm: false,
    // the film's sounds: the shots' spoken lines, its music and its effects
    sounds: [],
    // shots whose line is being spoken: id → true; the whole film's; music or effects being made (how many)
    speaking: {},
    speakingFilm: false,
    makingSounds: 0,
    // the film's latest export ({file, createdAt, name, videoUrl}) or null, and whether one is being made
    exported: null,
    exporting: false,
  }),
  getters: {
    cardsOf: (state) => (kind) => state.cards.filter((c) => c.kind === kind),
    cardById: (state) => (id) => state.cards.find((c) => c.id === id) ?? null,
    /** The shot's spoken line, or null. */
    lineOf: (state) => (shotId) => state.sounds.find((s) => s.kind === "line" && s.shotId === shotId) ?? null,
    /** The music and effects laid over the film, in start order. */
    laidSounds: (state) => state.sounds.filter((s) => s.kind !== "line"),
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

    /** Open a film: it, its cards, its shots and its sounds. */
    async open(id) {
      if (this.film?.id !== id) {
        this.film = null;
        this.cards = [];
        this.cardsLoaded = false;
        this.shots = [];
        this.shotsLoaded = false;
        this.sounds = [];
        this.exported = null;
      }
      const [film, cards, shots, sounds] = await Promise.all([
        get(`/v1/films/${enc(id)}`),
        get(`/v1/films/${enc(id)}/cards`),
        get(`/v1/films/${enc(id)}/shots`),
        get(`/v1/films/${enc(id)}/sounds`),
      ]);
      this.film = film;
      this.cards = cards.items;
      this.cardsLoaded = true;
      this.shots = shots.items;
      this.shotsLoaded = true;
      this.sounds = sounds.items;
      return film;
    },
    async loadSounds() {
      this.sounds = (await get(`/v1/films/${enc(this.film.id)}/sounds`)).items;
    },
    /** Speak a shot's line in its speaker's voice (a server job); it replaces the line spoken before. */
    async speakLine(shot, label) {
      this.speaking = { ...this.speaking, [shot.id]: true };
      try {
        const done = await runServerJob({ start: () => post(`/v1/shots/${enc(shot.id)}/line`, {}), feature: "voices.line", label, meta: { shotId: shot.id } });
        return done ?? null;
      } finally {
        const { [shot.id]: _, ...rest } = this.speaking;
        this.speaking = rest;
        await this.loadSounds().catch(() => {});
      }
    },
    /** Speak every line that has a speaker and no voice yet (a server job). */
    async speakAllLines(label) {
      this.speakingFilm = true;
      try {
        const done = await runServerJob({ start: () => post(`/v1/films/${enc(this.film.id)}/lines`, {}), feature: "voices.line", label, meta: { filmId: this.film.id } });
        return done ?? null;
      } finally {
        this.speakingFilm = false;
        await this.loadSounds().catch(() => {});
      }
    },
    /** Make music or a sound effect from words (a server job): `{kind, prompt, seconds?, start?}`, placed in the cut. */
    async makeSound(input, label) {
      this.makingSounds += 1;
      try {
        const feature = input.kind === "music" ? "sounds.music" : "sounds.effect";
        const done = await runServerJob({ start: () => post(`/v1/films/${enc(this.film.id)}/sounds`, input), feature, label, meta: { filmId: this.film.id } });
        return done ?? null;
      } finally {
        this.makingSounds -= 1;
        await this.loadSounds().catch(() => {});
      }
    },
    /** A sound's place in the cut: `{start?, volume?}`. */
    async saveSound(sound, changes) {
      const saved = await patchJson(`/v1/sounds/${enc(sound.id)}`, changes);
      this.sounds = this.sounds.map((s) => (s.id === saved.id ? saved : s));
      return saved;
    },
    async deleteSound(sound) {
      await del(`/v1/sounds/${enc(sound.id)}`);
      this.sounds = this.sounds.filter((s) => s.id !== sound.id);
    },
    /** The film's latest export, or null when it has none yet. */
    async loadExport() {
      try {
        this.exported = await get(`/v1/films/${enc(this.film.id)}/export`);
      } catch (e) {
        if (e?.status !== 404) throw e;
        this.exported = null;
      }
      return this.exported;
    },
    /** Join the film into one MP4 (a server job): every shot with a clip, in order, its sounds laid over. */
    async exportFilm(label) {
      this.exporting = true;
      try {
        const done = await runServerJob({
          start: () => post(`/v1/films/${enc(this.film.id)}/export`, {}),
          feature: "cut.export",
          label,
          meta: { filmId: this.film.id },
          describe: (job, pct) => (job.message ? `${job.message} · ${pct}%` : `${pct}%`),
        });
        return done ?? null;
      } finally {
        this.exporting = false;
        await this.loadExport().catch(() => {});
      }
    },
    /** Save the export where the user picks (the desktop app's Save dialog; a browser's Downloads). */
    async saveExport(opts = {}) {
      if (!this.exported) return null;
      return saveUrlAs(`/v1/films/${enc(this.film.id)}/export/video`, this.exported.name, { filterExt: "mp4", ...opts });
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
        return done ?? null;
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
        return done ?? null;
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
        return done ?? null;
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
    /** A shot's clips, the newest first. */
    async clipsOf(shot) {
      return (await get(`/v1/shots/${enc(shot.id)}/clips`)).items;
    },
    /** Make a shot's clip (a server job): from its chosen first frame, the way its mode says; the clip is chosen. */
    async makeClip(shot, label) {
      this.clipping = { ...this.clipping, [shot.id]: true };
      try {
        const done = await runServerJob({ start: () => post(`/v1/shots/${enc(shot.id)}/clips`, {}), feature: "clips.make", label, meta: { shotId: shot.id } });
        return done ?? null;
      } finally {
        const { [shot.id]: _, ...rest } = this.clipping;
        this.clipping = rest;
        await this.loadShots().catch(() => {});
      }
    },
    /** Make the clips of every shot that has none, or of every shot (a server job). */
    async makeAllClips(label, { all = false } = {}) {
      this.clippingFilm = true;
      try {
        const done = await runServerJob({
          start: () => post(`/v1/films/${enc(this.film.id)}/clips`, { all }),
          feature: "clips.make",
          label,
          meta: { filmId: this.film.id },
          describe: (job, pct) => (job.data?.at ? `${job.data.at}/${job.data.shots} · ${pct}%` : `${pct}%`),
        });
        return done ?? null;
      } finally {
        this.clippingFilm = false;
        await this.loadShots().catch(() => {});
      }
    },
    /** Repair a talking clip's lips (a server job): LatentSync redraws its mouth to the line's voice — a new clip, chosen. */
    async repairLips(shot, clip, label) {
      this.clipping = { ...this.clipping, [shot.id]: true };
      try {
        const done = await runServerJob({ start: () => post(`/v1/clips/${enc(clip.id)}/lips`, {}), feature: "clips.lips", label, meta: { shotId: shot.id } });
        return done ?? null;
      } finally {
        const { [shot.id]: _, ...rest } = this.clipping;
        this.clipping = rest;
        await this.loadShots().catch(() => {});
      }
    },
    async chooseClip(shot, clipId) {
      const saved = await post(`/v1/shots/${enc(shot.id)}/clip`, { clipId });
      this.shots = this.shots.map((s) => (s.id === saved.id ? saved : s));
      return saved;
    },
    async deleteClip(clip) {
      await del(`/v1/clips/${enc(clip.id)}`);
      await this.loadShots();
    },
    /** A guide video for a shot (its frames read by the server's FFmpeg); the shot's clip is then led by it. */
    async uploadGuide(shot, file) {
      const form = new FormData();
      form.append("file", file, file.name);
      const saved = await postForm(`/v1/shots/${enc(shot.id)}/guide`, form);
      this.shots = this.shots.map((s) => (s.id === saved.id ? saved : s));
      return saved;
    },
    async removeGuide(shot) {
      const saved = await del(`/v1/shots/${enc(shot.id)}/guide`);
      this.shots = this.shots.map((s) => (s.id === saved.id ? saved : s));
      return saved;
    },
    /** A hand edit to `shot` carried into the later shots nobody changed by hand (a server job). */
    async carry(shot, note, label) {
      this.carrying = shot.id;
      try {
        const done = await runServerJob({ start: () => post(`/v1/shots/${enc(shot.id)}/carry`, { note }), feature: "plan.revise", label, meta: { shotId: shot.id } });
        return done ?? null;
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
    /** A character's voice from a recording (a file, or the window's own recording — any audio; the server's FFmpeg
     *  reads it), with what it says (`text`, may be ""). */
    async uploadVoiceSample(card, blob, fileName, text = "") {
      const form = new FormData();
      form.append("file", blob, fileName);
      form.append("text", text);
      return this._put(await postForm(`/v1/cards/${enc(card.id)}/voice-sample`, form));
    },
    async removeVoiceSample(card) {
      return this._put(await del(`/v1/cards/${enc(card.id)}/voice-sample`));
    },
    /** The AI paints the card's picture (a server job on the AI tasks strip); the card comes back with it. */
    async paintPicture(card, label) {
      this.painting = { ...this.painting, [card.id]: true };
      try {
        const done = await runServerJob({ start: () => post(`/v1/cards/${enc(card.id)}/paint`, {}), feature: "cards.paint", label, meta: { cardId: card.id } });
        return done ? this._put(done) : null;
      } finally {
        const { [card.id]: _, ...rest } = this.painting;
        this.painting = rest;
      }
    },
  },
});
