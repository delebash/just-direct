<script setup>
// SPDX-License-Identifier: MIT
// A film — its work in tabs (the v1 plan's decision 1: Story · Cards · Shots · Cut), the tab in the address
// (/films/:id/:tab) so a reload or another window opens the same one. The film and its cards load once here; each tab
// is its own component. The states: loading, failed (its reason and Retry), and gone (deleted in another window).
import { errorMessage, otherWindows, PaneHeader, pageFlow, tabPanelAttrs, UiBanner, UiButton, UiTabStrip } from "@delebash/ui";
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import CardsPanel from "../components/film/CardsPanel.vue";
import ShotsPanel from "../components/film/ShotsPanel.vue";
import StoryPanel from "../components/film/StoryPanel.vue";
import { useFilmsStore } from "../stores/films.js";
import { useSettingsStore } from "../stores/settings.js";

const props = defineProps({
  id: { type: String, required: true },
  tab: { type: String, default: "" },
});
const { t } = useI18n();
const router = useRouter();
const films = useFilmsStore();
const settings = useSettingsStore();

const TABS = computed(() => [
  { id: "story", label: t("film.tabs.story") },
  { id: "cards", label: t("film.tabs.cards") },
  { id: "shots", label: t("film.tabs.shots") },
]);
const active = computed(() => (TABS.value.some((x) => x.id === props.tab) ? props.tab : "story"));
const pick = (tab) => router.replace(`/films/${props.id}/${tab}`);

const loadFailed = ref(null);
async function load() {
  loadFailed.value = null;
  try {
    await Promise.all([films.open(props.id), settings.load()]);
  } catch (e) {
    loadFailed.value = e;
  }
}
onMounted(load);
watch(() => props.id, load);
watch(() => otherWindows.changes, load);

const film = computed(() => (films.film?.id === props.id ? films.film : null));
const gone = computed(() => loadFailed.value?.status === 404);
const failedReason = computed(() => {
  if (!loadFailed.value) return "";
  const { title, detail } = errorMessage(loadFailed.value);
  return [title, detail].filter(Boolean).join(" — ");
});
</script>

<template>
  <q-page :style-fn="pageFlow" class="page page--content">
    <PaneHeader
      :crumbs="[{ label: t('films.title'), to: '/' }]" :title="film?.title || ''"
      :sub="film ? t('film.size', { w: film.width, h: film.height }) : ''" help-key="films"
    />

    <UiBanner v-if="gone" class="page__banner">
      {{ t("film.gone") }}
      <template #action>
        <UiButton intent="secondary" size="small" :label="t('film.backToFilms')" @click="router.push('/')" />
      </template>
    </UiBanner>
    <UiBanner v-else-if="loadFailed" class="page__banner">
      {{ t("film.loadFailed", { reason: failedReason }) }}
      <template #action>
        <UiButton intent="secondary" size="small" :label="t('kit.common.retry')" @click="load" />
      </template>
    </UiBanner>

    <template v-else-if="film">
      <UiTabStrip :model-value="active" :tabs="TABS" id-prefix="film" :aria-label="t('film.tabs.label')" @update:model-value="pick" />
      <div v-bind="tabPanelAttrs('film', active)" class="film__panel">
        <StoryPanel v-if="active === 'story'" :key="`story-${film.id}`" />
        <CardsPanel v-else-if="active === 'cards'" :key="`cards-${film.id}`" />
        <ShotsPanel v-else-if="active === 'shots'" :key="`shots-${film.id}`" @go="pick" />
      </div>
    </template>
    <q-inner-loading v-else :showing="true" :label="t('kit.common.loading')" />
  </q-page>
</template>

<style scoped>
.film__panel { padding-top: 16px; }
</style>
