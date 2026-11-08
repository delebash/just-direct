<script setup>
// SPDX-License-Identifier: MIT
// A card's editor — the §15 form in the kit's AppModal: its name, the words its picture is painted from, and for a
// character the words their voice is made from. Its picture: painted by the AI (the panel's Paint, a server job), taken
// from a file (PNG, JPEG or WebP), or taken off. The rules are the route's own schemas (CardIn for a new card, CardPatch
// for a change); a 422 lands under its field, a change another window made first (412) is said and the cards read
// again. Delete asks first, naming what is lost. A character's voice is JustVoice's (the server's voices.js): Make the
// voice (a server job) shows its audition, the words it was made from and its models' licences; it can come from a
// recording instead — a file, or one recorded here with the kit's microphone recorder — which JustVoice clones.
import {
  AppModal,
  confirmDialog,
  fieldErrors,
  Icon,
  recordMicrophone,
  reportError,
  schemaRules,
  serverUrl,
  UiButton,
  UiField,
  UiInput,
  UiServerImage,
  UiTextarea,
} from "@delebash/ui";
import { CardIn, CardPatch } from "just-direct-server/schemas/films.js";
import { computed, nextTick, onBeforeUnmount, reactive, ref } from "vue";
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

const FIELDS = ["name", "description", "voice", "voiceSampleText"];
const rules = { ...schemaRules(CardIn), voiceSampleText: schemaRules(CardPatch).voiceSampleText };
const kind = computed(() => props.card?.kind ?? props.kind);
const isNew = computed(() => !props.card);
// the card as the store has it now (its picture changes while the dialog is open)
const current = computed(() => (props.card ? films.cardById(props.card.id) : null));
const draft = reactive({
  name: props.card?.name ?? "",
  description: props.card?.description ?? "",
  voice: props.card?.voice ?? "",
  voiceSampleText: props.card?.voiceSampleText ?? "",
});
const serverErrors = ref({});
const saving = ref(false);
const busy = ref(false);
const modal = ref(null);
const picker = ref(null);

// the voice fields are a character's; what a recording says, only once it has one
const counts = (k) => (k !== "voice" && k !== "voiceSampleText") || (kind.value === "character" && (k === "voice" || !!current.value?.voiceSample));
const changes = () => Object.fromEntries(FIELDS.filter((k) => counts(k) && draft[k] !== (current.value?.[k] ?? "")).map((k) => [k, draft[k]]));

// ── the voice from a recording ──
const voicePicker = ref(null);
const recording = ref(null); // the microphone's recorder while it records
async function sendSample(blob, name) {
  busy.value = true;
  try {
    const card = await films.uploadVoiceSample(current.value, blob, name, draft.voiceSampleText.trim());
    draft.voiceSampleText = card.voiceSampleText;
  } catch (e) {
    reportError(e);
  } finally {
    busy.value = false;
  }
}
const onVoiceFile = (file) => file && sendSample(file, file.name);
async function record() {
  if (recording.value) {
    const rec = recording.value;
    recording.value = null;
    try {
      await sendSample(await rec.stop(), "recording.webm");
    } catch (e) {
      reportError(e);
    }
    return;
  }
  try {
    recording.value = await recordMicrophone();
  } catch (e) {
    reportError(e);
  }
}
onBeforeUnmount(() => recording.value?.stop().catch(() => {}));
async function removeSample() {
  busy.value = true;
  try {
    await films.removeVoiceSample(current.value);
    draft.voiceSampleText = "";
  } catch (e) {
    reportError(e);
  } finally {
    busy.value = false;
  }
}

// ── the voice JustVoice made (from the words, or the recording) ──
const voiceInfo = computed(() => current.value?.voiceInfo ?? {});
// a model's licence as the card shows it: its name and JustVoice's word for selling what it makes
const licenceLine = (m) => (m ? t("cards.voice.licence", { name: m.name || m.model, word: m.commercial || t("cards.voice.unknown") }) : "");
async function makeVoice() {
  try {
    await films.makeVoice(current.value, t("cards.voice.task", { name: current.value.name }));
  } catch (e) {
    if (e?.name !== "AbortError") reportError(e);
  }
}
async function removeVoice() {
  busy.value = true;
  try {
    await films.removeVoice(current.value);
  } catch (e) {
    reportError(e);
  } finally {
    busy.value = false;
  }
}

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
        <section v-if="kind === 'character' && current" class="card-dialog__sample" :aria-label="t('cards.voice.title')">
          <h3 class="card-dialog__sample-title">{{ t("cards.voice.title") }}</h3>
          <template v-if="current.voiceId">
            <audio v-if="current.voiceAuditionUrl" controls preload="none" crossorigin="anonymous" :src="serverUrl(current.voiceAuditionUrl)" :aria-label="t('cards.voice.play', { name: current.name })" />
            <p v-if="voiceInfo.description" class="hint">{{ t("cards.voice.described", { words: voiceInfo.description }) }}</p>
            <p v-else-if="voiceInfo.source === 'recording'" class="hint">{{ t("cards.voice.fromRecording") }}</p>
            <p v-for="m in [voiceInfo.design, voiceInfo.clone].filter(Boolean)" :key="m.model || m.name" class="hint">{{ licenceLine(m) }}</p>
          </template>
          <p v-else class="hint">{{ t("cards.voice.none") }}</p>
          <div class="card-dialog__sample-actions">
            <UiButton
              intent="secondary" size="small" focusable-when-disabled :disabled="!!films.voicing[current.id] || busy"
              :label="films.voicing[current.id] ? t('cards.voice.making') : current.voiceId ? t('cards.voice.again') : t('cards.voice.make')" @click="makeVoice"
            />
            <UiButton v-if="current.voiceId" intent="ghost" size="small" :disabled="!!films.voicing[current.id] || busy" :label="t('cards.voice.remove')" @click="removeVoice" />
          </div>
        </section>
        <section v-if="kind === 'character'" class="card-dialog__sample" :aria-label="t('cards.sample.title')">
          <h3 class="card-dialog__sample-title">{{ t("cards.sample.title") }}</h3>
          <p class="hint">{{ current ? t("cards.sample.hint") : t("cards.sample.afterAdd") }}</p>
          <template v-if="current">
            <audio v-if="current.voiceSampleUrl" controls preload="none" crossorigin="anonymous" :src="serverUrl(current.voiceSampleUrl)" :aria-label="t('cards.sample.play', { name: current.name })" />
            <div class="card-dialog__sample-actions">
              <UiButton intent="secondary" size="small" :disabled="busy || !!recording" :label="current.voiceSampleUrl ? t('cards.sample.replaceFile') : t('cards.sample.fromFile')" @click="voicePicker?.pickFiles()" />
              <UiButton :intent="recording ? 'danger' : 'secondary'" size="small" :disabled="busy" :label="recording ? t('cards.sample.stop') : t('cards.sample.record')" @click="record">
                <template #icon><Icon :name="recording ? 'Stop' : 'Mic'" :size="14" /></template>
              </UiButton>
              <UiButton v-if="current.voiceSampleUrl" intent="ghost" size="small" :disabled="busy || !!recording" :label="t('cards.sample.remove')" @click="removeSample" />
            </div>
            <UiField :label="t('cards.sample.words')" :hint="t('cards.sample.wordsHint')" layout="block" for="card-sample-text">
              <UiTextarea
                id="card-sample-text" v-model="draft.voiceSampleText" width="prose" :rows="2" lazy-rules
                :rules="rules.voiceSampleText" :error="!!serverErrors.voiceSampleText" :error-message="serverErrors.voiceSampleText"
              />
            </UiField>
            <q-file ref="voicePicker" class="card-dialog__file" :model-value="null" accept="audio/*" :aria-label="t('cards.sample.fromFile')" @update:model-value="onVoiceFile" />
          </template>
        </section>
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
.card-dialog__sample { display: flex; flex-direction: column; gap: 6px; }
.card-dialog__sample-title { font-size: 13px; margin: 4px 0 0; }
.card-dialog__sample .hint { margin: 0; max-width: 60ch; }
.card-dialog__sample audio { height: 32px; width: 280px; max-width: 100%; }
.card-dialog__sample-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.form__spacer { flex: 1; }
</style>
