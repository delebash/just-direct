<script setup>
// SPDX-License-Identifier: MIT
// A shot's editor — the §15 form in the kit's AppModal: how it is framed and how the camera moves, what happens, where
// and who and what is in it, the line spoken and by whom, how long it runs and how it joins the next. The rules are
// the route's own schema (ShotIn for a new shot, ShotPatch for a change); a 422 lands under its field; a change another
// window made first (412) is said and the shots read again. A change to an existing shot is a hand edit: the panel then
// offers to carry it into the later shots (`saved` tells it which).
import {
  AppModal,
  fieldErrors,
  reportError,
  schemaRules,
  UiButton,
  UiField,
  UiInput,
  UiMultiSelect,
  UiNumber,
  UiSegmented,
  UiSelect,
  UiTextarea,
} from "@delebash/ui";
import { SIZES, ShotIn, TRANSITIONS } from "just-direct-server/schemas/shots.js";
import { computed, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useFilmsStore } from "../../stores/films.js";

const props = defineProps({
  // the shot to edit; null for a new one
  shot: { type: Object, default: null },
});
const emit = defineEmits(["close", "saved"]);
const { t } = useI18n();
const films = useFilmsStore();

const FIELDS = ["size", "camera", "action", "placeId", "cardIds", "line", "speakerId", "seconds", "transition"];
const rules = schemaRules(ShotIn);
const isNew = computed(() => !props.shot);
const draft = reactive({
  size: props.shot?.size ?? "medium",
  camera: props.shot?.camera ?? "",
  action: props.shot?.action ?? "",
  placeId: props.shot?.placeId ?? null,
  cardIds: [...(props.shot?.cardIds ?? [])],
  line: props.shot?.line ?? "",
  speakerId: props.shot?.speakerId ?? null,
  seconds: props.shot?.seconds ?? 4,
  transition: props.shot?.transition ?? "cut",
});
const serverErrors = ref({});
const saving = ref(false);
const modal = ref(null);

const SIZE_OPTIONS = computed(() => SIZES.map((s) => ({ value: s, label: t(`shots.sizes.${s.replace(/[ -]/g, "_")}`) })));
const TRANSITION_OPTIONS = computed(() => TRANSITIONS.map((s) => ({ value: s, label: t(`shots.transitions.${s}`) })));
const cardOptions = (kind) => films.cards.filter((c) => !kind || c.kind === kind).map((c) => ({ value: c.id, label: c.name }));

const changes = () => Object.fromEntries(FIELDS.filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(props.shot?.[k] ?? null)).map((k) => [k, draft[k]]));

async function save() {
  saving.value = true;
  serverErrors.value = {};
  try {
    const body = Object.fromEntries(FIELDS.map((k) => [k, draft[k]]));
    // a place or a speaker is one of the shot's cards too
    body.cardIds = [...new Set([...body.cardIds, ...[body.placeId, body.line ? body.speakerId : null].filter(Boolean)])];
    if (!body.line) body.speakerId = null;
    if (isNew.value) {
      const shot = await films.addShot(body);
      emit("saved", shot, { created: true });
    } else {
      const delta = changes();
      if (Object.keys(delta).length) {
        const shot = await films.saveShot(props.shot, { ...delta, cardIds: body.cardIds, speakerId: body.speakerId });
        emit("saved", shot, { created: false });
      }
    }
    modal.value?.close();
  } catch (e) {
    if (e?.status === 412) {
      reportError(e);
      await films.loadShots().catch(() => {});
      modal.value?.close();
      return;
    }
    const fields = fieldErrors(e);
    const mine = Object.fromEntries(Object.entries(fields).filter(([k]) => FIELDS.includes(k)));
    serverErrors.value = mine;
    if (!Object.keys(mine).length) reportError(e);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppModal ref="modal" :title="isNew ? t('shots.newTitle') : t('shots.editTitle', { n: shot.position + 1 })" max-width="880px" @close="emit('close')">
    <q-form class="form" greedy @submit="save">
      <div class="form__row">
        <UiField :label="t('shots.fields.size')" layout="block" for="shot-size">
          <UiSelect id="shot-size" v-model="draft.size" :options="SIZE_OPTIONS" width="name" />
        </UiField>
        <UiField :label="t('shots.fields.camera')" :hint="t('shots.fields.cameraHint')" layout="block" for="shot-camera">
          <UiInput id="shot-camera" v-model="draft.camera" width="name" lazy-rules :rules="rules.camera" :error="!!serverErrors.camera" :error-message="serverErrors.camera" />
        </UiField>
      </div>
      <UiField :label="t('shots.fields.action')" :hint="t('shots.fields.actionHint')" layout="block" for="shot-action">
        <UiTextarea
          id="shot-action" v-model="draft.action" width="prose" :rows="3" autofocus lazy-rules
          :rules="rules.action" :error="!!serverErrors.action" :error-message="serverErrors.action"
        />
      </UiField>
      <div class="form__row">
        <UiField :label="t('shots.fields.place')" layout="block" for="shot-place">
          <UiSelect id="shot-place" v-model="draft.placeId" :options="cardOptions('place')" width="name" show-clear :placeholder="t('shots.fields.noPlace')" />
        </UiField>
        <UiField :label="t('shots.fields.cards')" :hint="t('shots.fields.cardsHint')" layout="block" for="shot-cards">
          <UiMultiSelect id="shot-cards" v-model="draft.cardIds" :options="cardOptions()" />
        </UiField>
      </div>
      <UiField :label="t('shots.fields.line')" :hint="t('shots.fields.lineHint')" layout="block" for="shot-line">
        <UiTextarea id="shot-line" v-model="draft.line" width="prose" :rows="2" lazy-rules :rules="rules.line" :error="!!serverErrors.line" :error-message="serverErrors.line" />
      </UiField>
      <div class="form__row">
        <UiField v-if="draft.line" :label="t('shots.fields.speaker')" layout="block" for="shot-speaker">
          <UiSelect id="shot-speaker" v-model="draft.speakerId" :options="cardOptions('character')" width="name" show-clear :placeholder="t('shots.fields.noSpeaker')" />
        </UiField>
        <UiField :label="t('shots.fields.seconds')" layout="block" for="shot-seconds">
          <UiNumber
            id="shot-seconds" v-model="draft.seconds" width="num" :step="0.5" :min="1" :max="13" lazy-rules
            :rules="rules.seconds" :error="!!serverErrors.seconds" :error-message="serverErrors.seconds"
          />
        </UiField>
        <UiField :label="t('shots.fields.transition')" layout="block">
          <UiSegmented v-model="draft.transition" :options="TRANSITION_OPTIONS" :aria-label="t('shots.fields.transition')" />
        </UiField>
      </div>
      <div class="form__actions">
        <UiButton intent="ghost" :label="t('kit.common.cancel')" @click="modal?.close()" />
        <UiButton type="submit" intent="primary" :disabled="saving" :label="saving ? t('kit.common.saving') : isNew ? t('shots.addButton') : t('kit.common.save')" />
      </div>
    </q-form>
  </AppModal>
</template>
