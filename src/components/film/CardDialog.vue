<script setup>
// SPDX-License-Identifier: MIT
// A card's editor — the §15 form in the kit's AppModal: its name, the words its picture is painted from, and for a
// character the voice it speaks with (the words the voice model designs it from). Its picture: painted by the AI (the
// panel's Paint, a server job), taken from a file (PNG, JPEG or WebP), or taken off. The rules are the route's own
// schemas (CardIn for a new card, CardPatch for a change); a 422 lands under its field, a change another window made
// first (412) is said and the cards read again. Delete asks first, naming what is lost.
import {
  AppModal,
  confirmDialog,
  fieldErrors,
  Icon,
  reportError,
  schemaRules,
  UiButton,
  UiField,
  UiInput,
  UiServerImage,
  UiTextarea,
} from "@delebash/ui";
import { CardIn } from "just-direct-server/schemas/films.js";
import { computed, nextTick, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useFilmsStore } from "../../stores/films.js";

const props = defineProps({
  // the card to edit; null for a new one of `kind`
  card: { type: Object, default: null },
  kind: { type: String, default: "character" },
});
const emit = defineEmits(["close", "paint"]);
const { t } = useI18n();
const films = useFilmsStore();

const FIELDS = ["name", "description", "voice"];
const rules = schemaRules(CardIn);
const kind = computed(() => props.card?.kind ?? props.kind);
const isNew = computed(() => !props.card);
// the card as the store has it now (its picture changes while the dialog is open)
const current = computed(() => (props.card ? films.cardById(props.card.id) : null));
const draft = reactive({ name: props.card?.name ?? "", description: props.card?.description ?? "", voice: props.card?.voice ?? "" });
const serverErrors = ref({});
const saving = ref(false);
const busy = ref(false);
const modal = ref(null);
const picker = ref(null);

const changes = () => Object.fromEntries(FIELDS.filter((k) => (k !== "voice" || kind.value === "character") && draft[k] !== (current.value?.[k] ?? "")).map((k) => [k, draft[k]]));

async function save() {
  saving.value = true;
  serverErrors.value = {};
  try {
    if (isNew.value) await films.addCard({ kind: kind.value, name: draft.name, description: draft.description, ...(kind.value === "character" ? { voice: draft.voice } : {}) });
    else if (Object.keys(changes()).length) await films.saveCard(current.value, changes());
    modal.value?.close();
  } catch (e) {
    if (e?.status === 412) {
      reportError(e);
      await films.open(films.film.id).catch(() => {});
      modal.value?.close();
      return;
    }
    const fields = fieldErrors(e);
    const mine = Object.fromEntries(Object.entries(fields).filter(([k]) => FIELDS.includes(k)));
    serverErrors.value = mine;
    if (!Object.keys(mine).length) reportError(e);
    saving.value = false;
    await nextTick();
    document.getElementById(mine.description && !mine.name ? "card-description" : "card-name")?.focus();
  } finally {
    saving.value = false;
  }
}

/** Save the words first (the picture is painted from them), then paint. */
async function paintNow() {
  if (Object.keys(changes()).length) {
    try {
      await films.saveCard(current.value, changes());
    } catch (e) {
      reportError(e);
      return;
    }
  }
  emit("paint", current.value);
}

async function onFile(file) {
  if (!file || !current.value) return;
  busy.value = true;
  try {
    await films.uploadPicture(current.value, file);
  } catch (e) {
    reportError(e);
  } finally {
    busy.value = false;
  }
}

async function takeOff() {
  busy.value = true;
  try {
    await films.removePicture(current.value);
  } catch (e) {
    reportError(e);
  } finally {
    busy.value = false;
  }
}

async function remove() {
  const yes = await confirmDialog({
    title: t("cards.delete.title"),
    message: t("cards.delete.message", { name: current.value.name }),
    confirmLabel: t("cards.delete.confirm"),
    danger: true,
  });
  if (!yes) return;
  try {
    await films.removeCard(current.value);
    modal.value?.close();
  } catch (e) {
    reportError(e);
  }
}
</script>

<template>
  <AppModal ref="modal" :title="isNew ? t(`cards.add.${kind}`) : t('cards.editTitle', { name: card.name })" max-width="880px" @close="emit('close')">
    <div class="card-dialog">
      <q-form class="form card-dialog__form" greedy @submit="save">
        <UiField :label="t('cards.fields.name')" layout="block" for="card-name">
          <UiInput
            id="card-name" v-model="draft.name" width="name" autofocus lazy-rules
            :rules="rules.name" :error="!!serverErrors.name" :error-message="serverErrors.name"
          />
        </UiField>
        <UiField :label="t('cards.fields.description')" :hint="t(`cards.fields.descriptionHint.${kind}`)" layout="block" for="card-description">
          <UiTextarea
            id="card-description" v-model="draft.description" width="prose" :rows="5" lazy-rules
            :rules="rules.description" :error="!!serverErrors.description" :error-message="serverErrors.description"
          />
        </UiField>
        <UiField v-if="kind === 'character'" :label="t('cards.fields.voice')" :hint="t('cards.fields.voiceHint')" layout="block" for="card-voice">
          <UiTextarea
            id="card-voice" v-model="draft.voice" width="prose" :rows="2" lazy-rules
            :rules="rules.voice" :error="!!serverErrors.voice" :error-message="serverErrors.voice"
          />
        </UiField>
        <div class="form__actions">
          <UiButton v-if="!isNew" intent="danger-outline" :label="t('cards.delete.action')" @click="remove">
            <template #icon><Icon name="Trash" :size="14" /></template>
          </UiButton>
          <span class="form__spacer" />
          <UiButton intent="ghost" :label="t('kit.common.cancel')" @click="modal?.close()" />
          <UiButton type="submit" intent="primary" :disabled="saving" :label="saving ? t('kit.common.saving') : isNew ? t('cards.addButton') : t('kit.common.save')" />
        </div>
      </q-form>

      <aside v-if="current" class="card-dialog__picture" :aria-label="t('cards.picture')">
        <UiServerImage v-if="current.pictureUrl" :path="current.pictureUrl" fit="contain" class="card-dialog__img" :alt="current.name" />
        <div v-else class="card-dialog__img card-dialog__img--none"><Icon name="Image" :size="28" /><span class="muted">{{ t("cards.noPicture") }}</span></div>
        <div class="card-dialog__picture-actions">
          <UiButton intent="secondary" size="small" focusable-when-disabled :disabled="!!films.painting[current.id] || busy" :label="films.painting[current.id] ? t('cards.painting') : t('cards.paint')" @click="paintNow">
            <template #icon><Icon name="Sparkle" :size="14" /></template>
          </UiButton>
          <UiButton intent="secondary" size="small" :disabled="busy" :label="t('cards.fromFile')" @click="picker?.pickFiles()" />
          <UiButton v-if="current.pictureUrl" intent="ghost" size="small" :disabled="busy" :label="t('cards.takeOff')" @click="takeOff" />
        </div>
        <q-file ref="picker" class="card-dialog__file" :model-value="null" accept="image/png,image/jpeg,image/webp" :aria-label="t('cards.fromFile')" @update:model-value="onFile" />
      </aside>
      <p v-else class="hint card-dialog__later">{{ t("cards.pictureAfterAdd") }}</p>
    </div>
  </AppModal>
</template>

<style scoped>
.card-dialog { display: flex; gap: 20px; align-items: flex-start; flex-wrap: wrap; }
.card-dialog__form { flex: 1 1 380px; min-width: 0; }
.card-dialog__picture { flex: 0 0 260px; display: flex; flex-direction: column; gap: 8px; }
.card-dialog__img { width: 260px; max-height: 340px; border-radius: 8px; background: var(--surface-2); }
.card-dialog__img--none { height: 200px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: var(--muted); }
.card-dialog__picture-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.card-dialog__file { display: none; }
.card-dialog__later { flex: 0 0 220px; }
.form__spacer { flex: 1; }
</style>
