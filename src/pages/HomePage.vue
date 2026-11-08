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
        <!-- house-paint's card (its HomePage): Quasar's q-card, its picture the link that opens it — a name of its own
             and no words to differ from it (WCAG 2.5.3), Enter as well as a click -->
        <li v-for="f in films.items" :key="f.id">
          <q-card flat bordered class="film-card">
            <div
              class="film-card__frame" :class="`film-card__frame--${shapeOf(f)}`" role="link" tabindex="0"
              :aria-label="t('films.open', { title: f.title })" @click="open(f)" @keydown.enter="open(f)"
            >
              <Icon name="Film" :size="22" aria-hidden="true" />
            </div>
            <q-card-section class="film-card__meta">
              <div class="film-card__title">{{ f.title }}</div>
              <div class="muted">{{ t("films.counts", { cards: f.cardCount, shots: f.shotCount }) }} · {{ relativeTime(f.updatedAt) }}</div>
            </q-card-section>
            <UiMenu class="film-card__more" trigger-class="ui-btn ui-btn--ghost ui-btn--icon" :label="t('films.more', { title: f.title })" align="end">
              <template #trigger>⋯</template>
              <UiMenuItem @select="remove(f)">
                <Icon name="Trash" :size="14" /> {{ t("films.delete.action") }}
              </UiMenuItem>
            </UiMenu>
          </q-card>
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
.film-card { position: relative; height: 100%; }
.film-card__frame {
  display: grid; place-items: center; background: var(--surface-2); color: var(--muted); aspect-ratio: 16 / 9; cursor: pointer;
  border-top-left-radius: inherit; border-top-right-radius: inherit;
}
.film-card__frame:hover { background: var(--surface-hover, var(--surface-2)); }
.film-card__frame:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.film-card__frame--tall { aspect-ratio: 16 / 9; }
.film-card__meta { padding: var(--sp-2) var(--sp-3) var(--sp-3); padding-right: 40px; font-size: var(--fs-small); }
.film-card__title { font-size: var(--fs-body); font-weight: 600; overflow-wrap: anywhere; }
.film-card__more { position: absolute; right: 6px; bottom: 10px; }
</style>
