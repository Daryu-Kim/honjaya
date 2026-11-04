<template>
  <div class="character-studio" :class="{ 'is-sticky': sticky }">
    <div class="studio-preview">
      <svg
        class="studio-figure"
        :viewBox="GUEST_SPRITE_VIEW_BOX"
        :style="paletteStyle"
        aria-hidden="true"
        focusable="false"
      >
        <path
          v-for="part in parts"
          :key="`preview-${part.tone}`"
          :d="part.d"
          :class="`guest-${part.tone}`"
        />
      </svg>
      <span v-if="nickname" class="studio-name">{{ nickname }}</span>
    </div>

    <div class="studio-body">
      <div v-for="group in groups" :key="group.key" class="studio-group">
        <p class="studio-group-label">{{ group.label }}</p>

        <div v-if="group.type === 'color'" class="studio-swatch-row">
          <button
            v-for="option in group.options"
            :key="option.id"
            type="button"
            class="studio-swatch"
            :class="{ active: modelValue[group.key] === option.id }"
            :style="{ background: option[group.key] }"
            :aria-label="option.label"
            @click="selectOption(group.key, option.id)"
          >
            <span class="studio-swatch-label">{{ option.label }}</span>
          </button>
        </div>

        <div v-else class="studio-chip-row">
          <button
            v-for="option in group.options"
            :key="option.id"
            type="button"
            class="studio-chip"
            :class="{ active: modelValue[group.key] === option.id }"
            @click="selectOption(group.key, option.id)"
          >
            <span v-if="option.emoji" class="studio-chip-emoji">
              {{ option.emoji }}
            </span>
            {{ option.label }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import {
  CHARACTER_GENDERS,
  CHARACTER_STYLE_GROUPS,
  getCharacterBodyOptions,
  getCharacterPalette,
} from "@/lib/characterStyle";
import { buildGuestParts, GUEST_SPRITE_VIEW_BOX } from "@/lib/pixelGuest";

const props = defineProps({
  modelValue: { type: Object, required: true },
  tableNumber: { type: String, default: "" },
  nickname: { type: String, default: "" },
  sticky: { type: Boolean, default: false },
});

const emit = defineEmits(["update:modelValue"]);

// 체형 목록은 고른 성별에 따라 달라집니다.
const groups = computed(() => {
  const bodyOptions = getCharacterBodyOptions(props.modelValue.gender);

  return CHARACTER_STYLE_GROUPS.map((group) =>
    group.key === "body" ? { ...group, options: bodyOptions } : group
  );
});

const parts = computed(() =>
  buildGuestParts(props.modelValue, props.tableNumber)
);

// TV 화면과 같은 색상 규칙으로 캐릭터 CSS 변수를 만들어 줍니다.
const paletteStyle = computed(() => {
  const palette = getCharacterPalette(props.modelValue, props.tableNumber);

  return {
    "--skin": palette.skin,
    "--skin-shadow": palette.skinShadow,
    "--skin-light": palette.skinLight,
    "--hair": palette.hair,
    "--hair-light": palette.hairLight,
    "--shirt": palette.shirt,
    "--shirt-dark": palette.shirtDark,
    "--shoes": palette.shoes,
  };
});

// 성별을 바꾸면 헤어스타일·체형 기본값도 함께 맞춰 줍니다.
function selectOption(key, value) {
  const next = { ...props.modelValue, [key]: value };

  if (key === "gender") {
    const defaults = CHARACTER_GENDERS.map((gender) => gender.defaultHairstyle);
    const target = CHARACTER_GENDERS.find((gender) => gender.id === value);

    if (target) {
      if (defaults.includes(next.hairstyle)) {
        next.hairstyle = target.defaultHairstyle;
      }

      const bodyIds = getCharacterBodyOptions(value).map((option) => option.id);

      if (!bodyIds.includes(next.body)) {
        next.body = target.defaultBody;
      }
    }
  }

  emit("update:modelValue", next);
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
  --eye: #241b33;
  --eye-light: #fff6fa;
  --mouth: #c8627a;
  --blush: #f6a2ae;
  --shoes: #3b3348;
}

.character-studio.is-sticky .studio-figure {
  width: 92px;
  height: 92px;
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
  max-width: 46%;
  font-size: 15px;
  color: #ffffff;
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

.studio-swatch-row,
.studio-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.studio-swatch {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 14px;
  box-shadow: inset 0 -6px 0 rgba(0, 0, 0, 0.2);
  cursor: pointer;

  &.active {
    border-color: #ffffff;
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.35),
      inset 0 -6px 0 rgba(0, 0, 0, 0.2);
  }
}

.studio-swatch-label {
  padding: 1px 5px;
  border-radius: 7px;
  font-size: 10px;
  font-weight: 800;
  color: #ffffff;
  background: rgba(12, 8, 16, 0.46);
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

.guest-hair {
  fill: var(--hair);
}

.guest-hair-light {
  fill: var(--hair-light);
}

.guest-skin {
  fill: var(--skin);
}

.guest-skin-shadow {
  fill: var(--skin-shadow);
}

.guest-skin-light {
  fill: var(--skin-light);
}

.guest-shirt {
  fill: var(--shirt);
}

.guest-shirt-dark {
  fill: var(--shirt-dark);
}

.guest-eye {
  fill: var(--eye);
}

.guest-eye-light {
  fill: var(--eye-light);
}

.guest-blush {
  fill: var(--blush);
}

.guest-mouth {
  fill: var(--mouth);
}

.guest-shoes {
  fill: var(--shoes);
}
</style>
