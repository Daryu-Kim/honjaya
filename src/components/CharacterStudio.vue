<template>
  <div class="character-studio" :class="{ 'is-sticky': sticky }">
    <div class="studio-preview">
      <svg
        class="studio-figure"
        :viewBox="GUEST_SPRITE_VIEW_BOX"
        aria-hidden="true"
        focusable="false"
      >
        <path
          v-for="part in parts"
          :key="`preview-${part.fill}`"
          :d="part.d"
          :fill="part.fill"
        />
      </svg>
      <div class="studio-preview-text">
        <span v-if="nickname" class="studio-name">{{ nickname }}</span>
        <span class="studio-caption">{{ statusText }}</span>
      </div>
    </div>

    <div class="studio-body">
      <div class="studio-group">
        <p class="studio-group-label">성별</p>

        <div class="studio-chip-row">
          <button
            v-for="gender in CHARACTER_GENDERS"
            :key="gender.id"
            type="button"
            class="studio-chip"
            :class="{ active: modelValue.gender === gender.id }"
            @click="selectGender(gender.id)"
          >
            <span class="studio-chip-emoji">{{ gender.emoji }}</span>
            {{ gender.label }}
          </button>
        </div>
      </div>

      <div class="studio-group">
        <p class="studio-group-label">마인크래프트 닉네임 (선택)</p>

        <input
          class="studio-input"
          type="text"
          inputmode="latin"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          maxlength="16"
          placeholder="예: Notch"
          :value="modelValue.minecraft"
          @input="handleNicknameInput"
        />
        <p
          class="studio-hint"
          :class="{
            'is-error': Boolean(nicknameError),
            'is-warn': !nicknameError && skinStatus.status === 'missing',
          }"
        >
          {{ statusText }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import {
  CHARACTER_GENDERS,
  getMinecraftNicknameMessage,
} from "@/lib/characterStyle";
import { getSkinStatus } from "@/lib/minecraftSkin";
import { buildGuestParts, GUEST_SPRITE_VIEW_BOX } from "@/lib/pixelGuest";

const props = defineProps({
  modelValue: { type: Object, required: true },
  tableNumber: { type: String, default: "" },
  nickname: { type: String, default: "" },
  sticky: { type: Boolean, default: false },
});

const emit = defineEmits(["update:modelValue"]);

const parts = computed(() =>
  buildGuestParts(props.modelValue, props.tableNumber)
);

const nicknameError = computed(() =>
  getMinecraftNicknameMessage(props.modelValue.minecraft)
);

const skinStatus = computed(() => getSkinStatus(props.modelValue.minecraft));

const statusText = computed(() => {
  if (nicknameError.value) return nicknameError.value;

  return (
    skinStatus.value.message ||
    "닉네임을 넣으면 그 플레이어의 스킨으로 바뀌어요."
  );
});

function selectGender(gender) {
  emit("update:modelValue", { ...props.modelValue, gender });
}

// 마인크래프트 닉네임에 쓸 수 없는 글자는 입력 단계에서 걸러냅니다.
function handleNicknameInput(event) {
  const value = String(event.target.value || "")
    .replace(/[^A-Za-z0-9_]/g, "")
    .slice(0, 16);

  event.target.value = value;
  emit("update:modelValue", { ...props.modelValue, minecraft: value });
}
</script>

<style scoped>
.studio-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 14px 0 18px;
  border-radius: 20px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.character-studio.is-sticky .studio-preview {
  position: sticky;
  top: 0;
  z-index: 3;
  flex-direction: row;
  justify-content: center;
  gap: 14px;
  /* 카드 패딩만큼 위로 당겨 올려 스크롤 중 내용이 위로 새지 않게 합니다. */
  margin: calc(var(--studio-pad-top, 24px) * -1)
    calc(var(--studio-bleed, 20px) * -1) 0;
  padding: calc(var(--studio-pad-top, 24px) + 6px) var(--studio-bleed, 20px)
    12px;
  border-width: 0 0 1px;
  border-radius: 0;
  background: var(--studio-sticky-bg, #111827);
}

.studio-figure {
  width: 128px;
  height: 128px;
  flex-shrink: 0;
  image-rendering: pixelated;
}

.character-studio.is-sticky .studio-figure {
  width: 92px;
  height: 92px;
}

.studio-preview-text {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.character-studio.is-sticky .studio-preview-text {
  align-items: flex-start;
}

.studio-name {
  max-width: 100%;
  font-size: 13px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.72);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.character-studio.is-sticky .studio-name {
  max-width: 100%;
  font-size: 15px;
  color: #ffffff;
}

/* 고정 미리보기에서만 안내 문구를 함께 보여줍니다. (아래 입력란에도 같은 안내가 있습니다) */
.studio-caption {
  display: none;
  max-width: 100%;
  font-size: 13px;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.5);
}

.character-studio.is-sticky .studio-caption {
  display: block;
}

.studio-group {
  margin-top: 16px;
}

.studio-group-label {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.7);
}

.studio-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.studio-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.6);
  color: rgba(255, 255, 255, 0.74);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;

  &.active {
    border-color: rgba(255, 255, 255, 0.85);
    background: rgba(255, 255, 255, 0.16);
    color: #ffffff;
  }
}

.studio-chip-emoji {
  font-size: 15px;
  line-height: 1;
}

.studio-input {
  width: 100%;
  height: 44px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.6);
  color: #ffffff;
  font-size: 15px;
  font-weight: 700;

  &::placeholder {
    color: rgba(255, 255, 255, 0.32);
    font-weight: 500;
  }

  &:focus {
    outline: none;
    border-color: rgba(255, 255, 255, 0.6);
  }
}

.studio-hint {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.5);

  &.is-error {
    color: #fca5a5;
  }

  &.is-warn {
    color: #fcd34d;
  }
}
</style>
