<script setup>
// SPDX-License-Identifier: MIT
// A film's Cards tab — the characters, places, props and looks it reuses in every shot, each with its picture. A card
// is added per kind and edited in components/film/CardDialog.vue; Paint asks the AI for its picture (a server job on
// the AI tasks strip — the kit's runServerJob). What the painter still needs (its engine, its model) is the kit's
// LuEngineNeeded banner above, with its install and download in place.
import { EmptyState, Icon, LuEngineNeeded, reportError, UiButton, UiServerImage } from "@delebash/ui";
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { CARD_KINDS, useFilmsStore } from "../../stores/films.js";
import CardDialog from "./CardDialog.vue";

const { t } = useI18n();
const films = useFilmsStore();

// the card being edited: false closed, {kind} a new card of that kind, or the card
const editing = ref(false);
const ratio = (kind) => (kind === "character" ? 3 / 4 : kind === "prop" ? 1 : films.film.width / films.film.height);

async function paint(card) {
  try {
    await films.paintPicture(card, t("cards.paintTask", { name: card.name }));
  } catch (e) {
    if (e?.name !== "AbortError") reportError(e, { title: t("cards.paintFailed", { name: card.name }) });
  }
}
</script>

<template>
  <div class="cards-panel">
    <LuEngineNeeded feature="cards.paint" :label="t('cards.paintFeature')" />
    <section v-for="kind in CARD_KINDS" :key="kind" class="cards-kind" :aria-labelledby="`kind-${kind}`">
      <header class="cards-kind__head">
        <h2 :id="`kind-${kind}`">{{ t(`cards.kinds.${kind}`) }}</h2>
        <UiButton intent="secondary" size="small" :label="t(`cards.add.${kind}`)" @click="editing = { kind }">
          <template #icon><Icon name="Plus" :size="14" /></template>
        </UiButton>
      </header>
      <p class="hint">{{ t(`cards.hints.${kind}`) }}</p>
      <EmptyState v-if="!films.cardsOf(kind).length" compact icon="Image" :message="t(`cards.empty.${kind}`)" />
      <ul v-else class="cards-grid" role="list">
        <li v-for="card in films.cardsOf(kind)" :key="card.id" class="card-tile">
          <button type="button" class="card-tile__open" :aria-label="t('cards.edit', { name: card.name })" @click="editing = card">
            <UiServerImage v-if="card.pictureUrl" :path="card.pictureUrl" :ratio="ratio(kind)" fit="cover" class="card-tile__picture" :alt="card.name" />
            <span v-else class="card-tile__picture card-tile__picture--none" :style="{ aspectRatio: ratio(kind) }" aria-hidden="true">
              <Icon name="Image" :size="22" />
            </span>
            <span class="card-tile__name">{{ card.name }}</span>
            <span v-if="card.description" class="card-tile__words muted">{{ card.description }}</span>
          </button>
          <UiButton
            class="card-tile__paint" intent="secondary" size="small" focusable-when-disabled :disabled="!!films.painting[card.id]"
            :label="films.painting[card.id] ? t('cards.painting') : card.pictureUrl ? t('cards.paintAgain') : t('cards.paint')"
            @click="paint(card)"
          >
            <template #icon><Icon name="Sparkle" :size="14" /></template>
          </UiButton>
        </li>
      </ul>
    </section>

    <CardDialog v-if="editing" :card="editing.id ? editing : null" :kind="editing.kind" @paint="paint" @close="editing = false" />
  </div>
</template>

<style scoped>
.cards-panel { display: flex; flex-direction: column; gap: 22px; }
.cards-kind__head { display: flex; align-items: center; gap: 12px; }
.cards-kind__head h2 { margin: 0; font-size: 15px; }
.cards-grid { list-style: none; margin: 8px 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; }
.card-tile { display: flex; flex-direction: column; gap: 6px; border: 1px solid var(--border); border-radius: 8px; padding: 8px; background: var(--surface); }
.card-tile__open { all: unset; box-sizing: border-box; display: flex; flex-direction: column; gap: 4px; cursor: pointer; border-radius: 6px; }
.card-tile__open:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.card-tile__picture { border-radius: 6px; width: 100%; }
.card-tile__picture--none { display: grid; place-items: center; background: var(--surface-2); color: var(--muted); }
.card-tile__name { font-weight: 600; overflow-wrap: anywhere; }
.card-tile__words { font-size: 12.5px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.card-tile__paint { align-self: flex-start; }
</style>
