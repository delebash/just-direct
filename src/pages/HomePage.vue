<script setup>
// SPDX-License-Identifier: MIT
// Home — your films (app-structure §17): each film a card with its shape and what is in it, opened with a click; New film
// opens the form (components/NewFilmDialog.vue); a delete asks first through the kit's confirmDialog, naming what is
// lost. The states every loading screen has: loading (q-inner-loading), empty (the kit's EmptyState with the one action
// that fills it), failed (UiBanner with the reason and Retry). Another window's change reads the list again in place.
import {
  confirmDialog,
  EmptyState,
  errorMessage,
  Icon,
  otherWindows,
  PaneHeader,
  pageFlow,
  relativeTime,
  reportError,
  UiBanner,
  UiButton,
  UiMenu,
  UiMenuItem,
} from "@delebash/ui";
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import NewFilmDialog from "../components/NewFilmDialog.vue";
import { useFilmsStore } from "../stores/films.js";
import { useSettingsStore } from "../stores/settings.js";
import { useUiStore } from "../stores/ui.js";

const { t } = useI18n();
const router = useRouter();
const films = useFilmsStore();
const settings = useSettingsStore();
const ui = useUiStore();

const loadFailed = ref(null);
const creating = ref(false);

async function load() {
  loadFailed.value = null;
  try {
    await Promise.all([films.load(), settings.load()]);
  } catch (e) {
    loadFailed.value = e;
  }
}
onMounted(load);
watch(() => otherWindows.changes, load);

const firstLoad = computed(() => films.loading && !films.loaded);
const failedReason = computed(() => {
  if (!loadFailed.value) return "";
  const { title, detail } = errorMessage(loadFailed.value);
  return [title, detail].filter(Boolean).join(" — ");
});

const open = (film) => router.push(`/films/${film.id}`);
function onCreated(film) {
  ui.maybeOfferAiSetup();
  open(film);
}
const shapeOf = (f) => (f.width > f.height ? "wide" : f.width < f.height ? "tall" : "square");

async function remove(film) {
  const yes = await confirmDialog({
    title: t("films.delete.title"),
    message: t("films.delete.message", { title: film.title }),
    confirmLabel: t("films.delete.confirm"),
    danger: true,
  });
  if (!yes) return;
  try {
    await films.remove(film);
  } catch (e) {
    reportError(e);
    if (e?.status === 412) films.load().catch(() => {});
  }
}
</script>

<template>
  <q-page :style-fn="pageFlow" class="page page--content">
    <PaneHeader :eyebrow="t('app.name')" :title="t('films.title')" help-key="getting-started">
      <UiButton intent="primary" :label="t('films.new.button')" :disabled="!films.loaded" @click="creating = true" />
    </PaneHeader>

    <UiBanner v-if="loadFailed" class="page__banner">
      {{ t("films.loadFailed", { reason: failedReason }) }}
      <template #action>
        <UiButton intent="secondary" size="small" :label="t('kit.common.retry')" @click="load" />
      </template>
    </UiBanner>

    <div v-else class="films">
      <EmptyState
        v-if="films.loaded && !films.items.length"
        icon="Film" :title="t('films.empty.title')" :message="t('films.empty.message')"
        :action-label="t('films.new.button')" @action="creating = true"
      />
      <ul v-else-if="films.loaded" class="films__grid" role="list">
        <li v-for="f in films.items" :key="f.id" class="film-card">
          <button type="button" class="film-card__open" :aria-label="t('films.open', { title: f.title })" @click="open(f)">
            <span class="film-card__frame" :class="`film-card__frame--${shapeOf(f)}`" aria-hidden="true">
              <Icon name="Film" :size="22" />
            </span>
            <span class="film-card__title">{{ f.title }}</span>
            <span class="film-card__meta muted">
              {{ t("films.counts", { cards: f.cardCount, shots: f.shotCount }) }} · {{ relativeTime(f.updatedAt) }}
            </span>
          </button>
          <UiMenu class="film-card__more" :label="t('films.more', { title: f.title })" align="end">
            <UiMenuItem @select="remove(f)">
              <Icon name="Trash" :size="14" /> {{ t("films.delete.action") }}
            </UiMenuItem>
          </UiMenu>
        </li>
      </ul>
      <q-inner-loading :showing="firstLoad" :label="t('kit.common.loading')" />
    </div>

    <NewFilmDialog v-if="creating" @created="onCreated" @close="creating = false" />
  </q-page>
</template>

<style scoped>
.films { position: relative; min-height: 120px; }
.films__grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
.film-card { position: relative; border: 1px solid var(--border); border-radius: var(--radius-md, 8px); background: var(--surface); }
.film-card__open { all: unset; box-sizing: border-box; display: flex; flex-direction: column; gap: 6px; width: 100%; padding: 12px; cursor: pointer; border-radius: inherit; }
.film-card__open:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.film-card__open:hover { background: var(--surface-hover, var(--surface-2)); }
.film-card__frame { display: grid; place-items: center; background: var(--surface-2); color: var(--muted); border-radius: 6px; aspect-ratio: 16 / 9; }
.film-card__frame--tall { aspect-ratio: 16 / 9; }
.film-card__title { font-weight: 600; overflow-wrap: anywhere; padding-right: 28px; }
.film-card__meta { font-size: 12.5px; }
.film-card__more { position: absolute; right: 6px; bottom: 30px; }
</style>
