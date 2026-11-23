<template>
  <div class="extras-panel">
    <div class="toolbar">
      <div class="subtab-row">
        <button
          v-for="tab in SUBTABS"
          :key="tab.value"
          type="button"
          class="subtab-button"
          :class="{ active: activeTab === tab.value }"
          @click="activeTab = tab.value"
        >
          {{ tab.label }}
        </button>
      </div>
      <button
        type="button"
        class="ghost-button"
        :disabled="loading"
        @click="load"
      >
        {{ loading ? "불러오는 중…" : "새로고침" }}
      </button>
    </div>

    <p class="hint">
      확장 기능은 초안·미리보기 없이 Discord 에 바로 반영됩니다. 되돌리려면 다시
      만들어야 해요.
    </p>
    <p v-if="!canManage" class="hint warn">
      이모지·AutoMod·예약 이벤트 변경은 사장 계정만 할 수 있어요.
    </p>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="message" class="notice">{{ message }}</p>

    <div v-if="pendingDelete" class="confirm-bar">
      <span>
        <strong>{{ pendingDelete.label }}</strong> 항목을 삭제할까요? 되돌릴 수
        없어요.
      </span>
      <div class="confirm-actions">
        <button
          type="button"
          class="danger-button"
          :disabled="busy"
          @click="confirmDelete"
        >
          삭제
        </button>
        <button
          type="button"
          class="ghost-button"
          :disabled="busy"
          @click="pendingDelete = null"
        >
          취소
        </button>
      </div>
    </div>

    <!-- ── 이모지 · 스티커 ─────────────────────────────────────────────── -->
    <template v-if="activeTab === 'emoji'">
      <section class="panel">
        <div class="panel-head">
          <h3>이모지</h3>
          <span class="muted">{{ emojis.length }}개</span>
        </div>
        <p v-if="sectionErrors.emojis" class="hint warn">
          {{ sectionErrors.emojis }}
        </p>

        <div class="create-form">
          <label class="field">
            <span>이름</span>
            <input
              v-model="emojiForm.name"
              type="text"
              placeholder="honjaya_beer"
              :disabled="!canManage || busy"
            />
          </label>
          <label class="field wide">
            <span>이미지 주소</span>
            <input
              v-model="emojiForm.imageUrl"
              type="url"
              placeholder="https://example.com/emoji.png"
              :disabled="!canManage || busy"
            />
          </label>
          <button
            type="button"
            class="preset-button"
            :disabled="!canManage || busy"
            @click="createEmoji"
          >
            이모지 추가
          </button>
        </div>
        <p class="hint">
          이름은 영문·숫자·밑줄 2~32자, 이미지는 256KB 이하 PNG/JPG 주소를 넣어
          주세요.
        </p>

        <p v-if="emojis.length === 0" class="muted">등록된 이모지가 없어요.</p>
        <div v-for="emoji in emojis" :key="emoji.id" class="row-card">
          <div class="row-main">
            <img :src="emojiImageUrl(emoji)" class="emoji-thumb" alt="" />
            <template v-if="editing.id === emoji.id">
              <input
                v-model="editing.name"
                type="text"
                class="inline-input"
                :disabled="busy"
              />
            </template>
            <template v-else>
              <strong>:{{ emoji.name }}:</strong>
            </template>
            <span v-if="emoji.animated" class="pill">움직임</span>
            <span v-if="emoji.managed" class="pill">연동</span>
            <span v-if="emoji.available === false" class="pill danger"
              >사용 불가</span
            >
          </div>
          <div class="row-actions">
            <template v-if="editing.id === emoji.id">
              <button
                type="button"
                class="link-button"
                :disabled="busy"
                @click="saveRename"
              >
                저장
              </button>
              <button
                type="button"
                class="link-button"
                :disabled="busy"
                @click="cancelEdit"
              >
                취소
              </button>
            </template>
            <template v-else>
              <button
                type="button"
                class="link-button"
                :disabled="!canManage || busy || emoji.managed"
                @click="startEdit('emoji', emoji)"
              >
                이름 변경
              </button>
              <button
                type="button"
                class="link-button danger"
                :disabled="!canManage || busy || emoji.managed"
                @click="askDelete('emoji', emoji.id, `:${emoji.name}:`)"
              >
                삭제
              </button>
            </template>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h3>스티커</h3>
          <span class="muted">{{ stickers.length }}개</span>
        </div>
        <p v-if="sectionErrors.stickers" class="hint warn">
          {{ sectionErrors.stickers }}
        </p>
        <p class="hint">
          스티커 추가는 파일 업로드가 필요해 Discord 앱에서만 할 수 있어요.
          여기서는 이름 변경과 삭제만 됩니다.
        </p>
        <p v-if="stickers.length === 0" class="muted">
          등록된 스티커가 없어요.
        </p>
        <div v-for="sticker in stickers" :key="sticker.id" class="row-card">
          <div class="row-main">
            <template v-if="editing.id === sticker.id">
              <input
                v-model="editing.name"
                type="text"
                class="inline-input"
                :disabled="busy"
              />
            </template>
            <template v-else>
              <strong>{{ sticker.name }}</strong>
            </template>
            <span v-if="sticker.description" class="muted">{{
              sticker.description
            }}</span>
          </div>
          <div class="row-actions">
            <template v-if="editing.id === sticker.id">
              <button
                type="button"
                class="link-button"
                :disabled="busy"
                @click="saveRename"
              >
                저장
              </button>
              <button
                type="button"
                class="link-button"
                :disabled="busy"
                @click="cancelEdit"
              >
                취소
              </button>
            </template>
            <template v-else>
              <button
                type="button"
                class="link-button"
                :disabled="!canManage || busy"
                @click="startEdit('sticker', sticker)"
              >
                이름 변경
              </button>
              <button
                type="button"
                class="link-button danger"
                :disabled="!canManage || busy"
                @click="askDelete('sticker', sticker.id, sticker.name)"
              >
                삭제
              </button>
            </template>
          </div>
        </div>
      </section>
    </template>

    <!-- ── AutoMod ─────────────────────────────────────────────────────── -->
    <section v-else-if="activeTab === 'automod'" class="panel">
      <div class="panel-head">
        <h3>AutoMod 규칙</h3>
        <span class="muted">{{ autoModeration.length }}개</span>
      </div>
      <p v-if="sectionErrors.autoModeration" class="hint warn">
        {{ sectionErrors.autoModeration }}
      </p>

      <div class="form-grid">
        <label class="field">
          <span>규칙 이름</span>
          <input
            v-model="automodForm.name"
            type="text"
            placeholder="욕설·도배 차단"
            :disabled="!canManage || busy"
          />
        </label>
        <label class="field">
          <span>트리거</span>
          <select
            v-model.number="automodForm.triggerType"
            :disabled="!canManage || busy"
          >
            <option :value="1">키워드</option>
            <option :value="4">사전 필터(욕설·성적·혐오)</option>
            <option :value="5">멘션 스팸</option>
            <option :value="6">프로필</option>
            <option :value="3">스팸</option>
          </select>
        </label>

        <label v-if="automodForm.triggerType === 1" class="field wide">
          <span>차단 키워드</span>
          <textarea
            v-model="automodForm.keywords"
            rows="3"
            placeholder="욕설1, 욕설2 (쉼표 또는 줄바꿈으로 구분)"
            :disabled="!canManage || busy"
          ></textarea>
        </label>

        <label v-if="automodForm.triggerType === 1" class="field wide">
          <span>정규식 (선택)</span>
          <textarea
            v-model="automodForm.regexPatterns"
            rows="2"
            placeholder="한 줄에 하나씩 (예: (?i)광고)"
            :disabled="!canManage || busy"
          ></textarea>
        </label>

        <div v-if="automodForm.triggerType === 4" class="field wide">
          <span>사전 필터</span>
          <div class="chip-row">
            <label
              v-for="preset in PRESET_OPTIONS"
              :key="preset.value"
              class="chip-check"
            >
              <input
                v-model="automodForm.presets"
                type="checkbox"
                :value="preset.value"
                :disabled="!canManage || busy"
              />
              {{ preset.label }}
            </label>
          </div>
        </div>

        <template v-if="automodForm.triggerType === 5">
          <label class="field">
            <span>멘션 제한</span>
            <input
              v-model.number="automodForm.mentionLimit"
              type="number"
              min="1"
              max="50"
              :disabled="!canManage || busy"
            />
          </label>
          <label class="chip-check">
            <input
              v-model="automodForm.mentionRaidProtection"
              type="checkbox"
              :disabled="!canManage || busy"
            />
            레이드 보호 사용
          </label>
        </template>

        <label class="chip-check">
          <input
            v-model="automodForm.block"
            type="checkbox"
            :disabled="!canManage || busy"
          />
          메시지 차단
        </label>

        <label class="field">
          <span>경고 알림 채널</span>
          <select
            v-model="automodForm.alertChannelId"
            :disabled="!canManage || busy"
          >
            <option value="">사용 안 함</option>
            <option
              v-for="channel in textChannels"
              :key="channel.id"
              :value="channel.id"
            >
              # {{ channel.name }}
            </option>
          </select>
        </label>

        <label class="field">
          <span>타임아웃(분)</span>
          <input
            v-model.number="automodForm.timeoutMinutes"
            type="number"
            min="0"
            max="40320"
            :disabled="!canManage || busy"
          />
        </label>
      </div>

      <div class="panel-actions">
        <button
          type="button"
          class="preset-button"
          :disabled="!canManage || busy"
          @click="submitAutoMod"
        >
          {{ automodEditingId ? "규칙 수정 저장" : "규칙 만들기" }}
        </button>
        <button
          v-if="automodEditingId"
          type="button"
          class="ghost-button"
          :disabled="busy"
          @click="resetAutoModForm"
        >
          새 규칙으로
        </button>
      </div>

      <p v-if="autoModeration.length === 0" class="muted">
        등록된 규칙이 없어요.
      </p>
      <div v-for="rule in autoModeration" :key="rule.id" class="row-card">
        <div class="row-main">
          <strong>{{ rule.name }}</strong>
          <span class="pill">{{
            getAutoModTriggerLabel(rule.triggerType)
          }}</span>
          <span class="pill" :class="rule.enabled ? 'ok' : 'muted-pill'">
            {{ rule.enabled ? "사용 중" : "중지됨" }}
          </span>
          <span class="muted">{{ describeActions(rule) }}</span>
        </div>
        <div class="row-actions">
          <button
            type="button"
            class="link-button"
            :disabled="!canManage || busy"
            @click="toggleAutoMod(rule)"
          >
            {{ rule.enabled ? "중지" : "사용" }}
          </button>
          <button
            type="button"
            class="link-button"
            :disabled="!canManage || busy"
            @click="editAutoMod(rule)"
          >
            수정
          </button>
          <button
            type="button"
            class="link-button danger"
            :disabled="!canManage || busy"
            @click="askDelete('automod', rule.id, rule.name)"
          >
            삭제
          </button>
        </div>
      </div>
    </section>

    <!-- ── 예약 이벤트 ─────────────────────────────────────────────────── -->
    <section v-else class="panel">
      <div class="panel-head">
        <h3>예약 이벤트</h3>
        <span class="muted">{{ scheduledEvents.length }}개</span>
      </div>
      <p v-if="sectionErrors.scheduledEvents" class="hint warn">
        {{ sectionErrors.scheduledEvents }}
      </p>

      <div class="form-grid">
        <label class="field">
          <span>이벤트 이름</span>
          <input
            v-model="eventForm.name"
            type="text"
            placeholder="금요일 라이브"
            :disabled="!canManage || busy"
          />
        </label>
        <label class="field">
          <span>장소 종류</span>
          <select
            v-model.number="eventForm.entityType"
            :disabled="!canManage || busy"
          >
            <option :value="3">외부 장소</option>
            <option :value="2">음성 채널</option>
          </select>
        </label>
        <label v-if="eventForm.entityType === 3" class="field wide">
          <span>장소</span>
          <input
            v-model="eventForm.location"
            type="text"
            placeholder="혼자야 2층"
            :disabled="!canManage || busy"
          />
        </label>
        <label v-else class="field">
          <span>음성 채널</span>
          <select v-model="eventForm.channelId" :disabled="!canManage || busy">
            <option value="">채널 선택</option>
            <option
              v-for="channel in voiceChannels"
              :key="channel.id"
              :value="channel.id"
            >
              {{ channel.name }}
            </option>
          </select>
        </label>
        <label class="field">
          <span>시작</span>
          <input
            v-model="eventForm.startAt"
            type="datetime-local"
            :disabled="!canManage || busy"
          />
        </label>
        <label class="field">
          <span>종료</span>
          <input
            v-model="eventForm.endAt"
            type="datetime-local"
            :disabled="!canManage || busy"
          />
        </label>
        <label class="field wide">
          <span>설명</span>
          <textarea
            v-model="eventForm.description"
            rows="2"
            :disabled="!canManage || busy"
          ></textarea>
        </label>
      </div>
      <p class="hint">외부 장소 이벤트는 종료 시각이 꼭 필요해요.</p>

      <div class="panel-actions">
        <button
          type="button"
          class="preset-button"
          :disabled="!canManage || busy"
          @click="submitEvent"
        >
          {{ eventEditingId ? "이벤트 수정 저장" : "이벤트 만들기" }}
        </button>
        <button
          v-if="eventEditingId"
          type="button"
          class="ghost-button"
          :disabled="busy"
          @click="resetEventForm"
        >
          새 이벤트로
        </button>
      </div>

      <p v-if="scheduledEvents.length === 0" class="muted">
        예약된 이벤트가 없어요.
      </p>
      <div v-for="event in scheduledEvents" :key="event.id" class="row-card">
        <div class="row-main">
          <strong>{{ event.name }}</strong>
          <span class="pill">{{ getEventEntityLabel(event.entityType) }}</span>
          <span class="pill" :class="event.status === 4 ? 'danger' : 'ok'">
            {{ getEventStatusLabel(event.status) }}
          </span>
          <span class="muted">{{
            formatDiscordDateTime(event.scheduledStartAt)
          }}</span>
          <span v-if="event.location" class="muted"
            >· {{ event.location }}</span
          >
        </div>
        <div class="row-actions">
          <button
            type="button"
            class="link-button"
            :disabled="!canManage || busy"
            @click="editEvent(event)"
          >
            수정
          </button>
          <button
            type="button"
            class="link-button danger"
            :disabled="!canManage || busy"
            @click="askDelete('event', event.id, event.name)"
          >
            삭제
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";

import {
  createDiscordExtra,
  deleteDiscordExtra,
  fetchDiscordExtras,
  formatDiscordDateTime,
  getAutoModTriggerLabel,
  getEventEntityLabel,
  getEventStatusLabel,
  setDiscordAutoModEnabled,
  updateDiscordExtra,
} from "@/lib/discord";

const props = defineProps({
  channels: { type: Array, default: () => [] },
  canManage: { type: Boolean, default: false },
});

const SUBTABS = [
  { value: "emoji", label: "이모지 · 스티커" },
  { value: "automod", label: "AutoMod" },
  { value: "event", label: "예약 이벤트" },
];

const PRESET_OPTIONS = [
  { value: 1, label: "욕설" },
  { value: 2, label: "성적 콘텐츠" },
  { value: 3, label: "혐오 발언" },
];

const TEXT_CHANNEL_TYPES = new Set(["GuildText", "GuildAnnouncement"]);
const VOICE_CHANNEL_TYPES = new Set(["GuildVoice", "GuildStageVoice"]);

const activeTab = ref("emoji");
const loading = ref(false);
const busy = ref(false);
const error = ref("");
const message = ref("");

const emojis = ref([]);
const stickers = ref([]);
const autoModeration = ref([]);
const scheduledEvents = ref([]);
const sectionErrors = ref({});

const editing = reactive({ kind: "", id: "", name: "" });
const pendingDelete = ref(null);

const emojiForm = reactive({ name: "", imageUrl: "" });
const automodEditingId = ref("");
const automodForm = reactive({
  name: "",
  triggerType: 1,
  keywords: "",
  regexPatterns: "",
  presets: [1],
  mentionLimit: 5,
  mentionRaidProtection: false,
  block: true,
  alertChannelId: "",
  timeoutMinutes: 0,
});
const eventEditingId = ref("");
const eventForm = reactive({
  name: "",
  description: "",
  entityType: 3,
  location: "",
  channelId: "",
  startAt: "",
  endAt: "",
});

const textChannels = computed(() =>
  props.channels
    .filter((channel) => TEXT_CHANNEL_TYPES.has(channel.typeName))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
);

const voiceChannels = computed(() =>
  props.channels
    .filter((channel) => VOICE_CHANNEL_TYPES.has(channel.typeName))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
);

function emojiImageUrl(emoji) {
  return `https://cdn.discordapp.com/emojis/${emoji.id}.${
    emoji.animated ? "gif" : "png"
  }?size=44`;
}

const AUTOMOD_ACTION_TEXT = {
  1: "메시지 차단",
  2: "알림 채널 경고",
  3: "타임아웃",
  4: "상호작용 차단",
};

function describeActions(rule) {
  const labels = (rule.actions || []).map((action) => {
    const type = Number(action.type);

    if (type === 3 && action.metadata?.durationSeconds) {
      const minutes = Math.round(Number(action.metadata.durationSeconds) / 60);

      return `타임아웃 ${minutes}분`;
    }

    return AUTOMOD_ACTION_TEXT[type] || `동작 ${type}`;
  });

  return labels.length > 0 ? labels.join(" · ") : "동작 없음";
}

function fail(caught, fallback) {
  error.value = caught?.message || fallback;
}

async function load() {
  loading.value = true;
  error.value = "";

  try {
    const data = await fetchDiscordExtras();

    emojis.value = data?.emojis || [];
    stickers.value = data?.stickers || [];
    autoModeration.value = data?.autoModeration || [];
    scheduledEvents.value = data?.scheduledEvents || [];
    sectionErrors.value = data?.errors || {};
  } catch (caught) {
    fail(caught, "확장 기능을 불러오지 못했어요.");
  } finally {
    loading.value = false;
  }
}

function startEdit(kind, item) {
  editing.kind = kind;
  editing.id = item.id;
  editing.name = item.name || "";
}

function cancelEdit() {
  editing.id = "";
  editing.name = "";
}

async function saveRename() {
  busy.value = true;
  error.value = "";
  message.value = "";

  try {
    await updateDiscordExtra(editing.kind, editing.id, { name: editing.name });
    message.value = "이름을 바꿨어요.";
    cancelEdit();
    await load();
  } catch (caught) {
    fail(caught, "이름을 바꾸지 못했어요.");
  } finally {
    busy.value = false;
  }
}

async function createEmoji() {
  busy.value = true;
  error.value = "";
  message.value = "";

  try {
    await createDiscordExtra("emoji", {
      name: emojiForm.name.trim(),
      imageUrl: emojiForm.imageUrl.trim(),
    });
    emojiForm.name = "";
    emojiForm.imageUrl = "";
    message.value = "이모지를 추가했어요.";
    await load();
  } catch (caught) {
    fail(caught, "이모지를 추가하지 못했어요.");
  } finally {
    busy.value = false;
  }
}

function askDelete(kind, id, label) {
  pendingDelete.value = { kind, id, label };
}

async function confirmDelete() {
  const target = pendingDelete.value;

  if (!target) {
    return;
  }

  busy.value = true;
  error.value = "";
  message.value = "";

  try {
    await deleteDiscordExtra(target.kind, target.id);
    message.value = `${target.label} 항목을 삭제했어요.`;
    pendingDelete.value = null;
    await load();
  } catch (caught) {
    fail(caught, "삭제하지 못했어요.");
  } finally {
    busy.value = false;
  }
}

function splitList(value) {
  return String(value || "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

function buildAutoModPayload() {
  const triggerType = Number(automodForm.triggerType);
  const triggerMetadata = {};

  if (triggerType === 1) {
    triggerMetadata.keywords = splitList(automodForm.keywords);
    const regexPatterns = splitList(automodForm.regexPatterns);

    if (regexPatterns.length > 0) {
      triggerMetadata.regexPatterns = regexPatterns;
    }
  }

  if (triggerType === 4) {
    triggerMetadata.presets = automodForm.presets.map(Number);
  }

  if (triggerType === 5) {
    triggerMetadata.mentionLimit = Number(automodForm.mentionLimit);
    triggerMetadata.mentionRaidProtection = Boolean(
      automodForm.mentionRaidProtection
    );
  }

  const actions = [];

  if (automodForm.block) {
    actions.push({ type: 1 });
  }

  if (automodForm.alertChannelId) {
    actions.push({ type: 2, channelId: automodForm.alertChannelId });
  }

  const timeoutMinutes = Number(automodForm.timeoutMinutes);

  if (Number.isFinite(timeoutMinutes) && timeoutMinutes > 0) {
    actions.push({ type: 3, durationSeconds: Math.trunc(timeoutMinutes * 60) });
  }

  return {
    name: automodForm.name.trim(),
    triggerType,
    enabled: true,
    triggerMetadata,
    actions,
  };
}

function resetAutoModForm() {
  automodEditingId.value = "";
  automodForm.name = "";
  automodForm.triggerType = 1;
  automodForm.keywords = "";
  automodForm.regexPatterns = "";
  automodForm.presets = [1];
  automodForm.mentionLimit = 5;
  automodForm.mentionRaidProtection = false;
  automodForm.block = true;
  automodForm.alertChannelId = "";
  automodForm.timeoutMinutes = 0;
}

function editAutoMod(rule) {
  const metadata = rule.triggerMetadata || {};

  automodEditingId.value = rule.id;
  automodForm.name = rule.name || "";
  automodForm.triggerType = Number(rule.triggerType) || 1;
  automodForm.keywords = (metadata.keywordFilter || []).join(", ");
  automodForm.regexPatterns = (metadata.regexPatterns || []).join("\n");
  automodForm.presets =
    (metadata.presets || []).length > 0 ? metadata.presets.map(Number) : [1];
  automodForm.mentionLimit = Number(metadata.mentionTotalLimit ?? 5);
  automodForm.mentionRaidProtection = Boolean(
    metadata.mentionRaidProtectionEnabled
  );
  automodForm.block = (rule.actions || []).some(
    (action) => Number(action.type) === 1
  );
  automodForm.alertChannelId =
    (rule.actions || []).find((action) => Number(action.type) === 2)?.metadata
      ?.channelId || "";

  const timeout = (rule.actions || []).find(
    (action) => Number(action.type) === 3
  );

  automodForm.timeoutMinutes = timeout?.metadata?.durationSeconds
    ? Math.round(Number(timeout.metadata.durationSeconds) / 60)
    : 0;
}

async function submitAutoMod() {
  busy.value = true;
  error.value = "";
  message.value = "";

  try {
    if (automodEditingId.value) {
      const current = autoModeration.value.find(
        (rule) => rule.id === automodEditingId.value
      );

      await updateDiscordExtra("automod", automodEditingId.value, {
        ...buildAutoModPayload(),
        enabled: current ? Boolean(current.enabled) : true,
        exemptRoles: current?.exemptRoles || [],
        exemptChannels: current?.exemptChannels || [],
      });
      message.value = "AutoMod 규칙을 수정했어요.";
    } else {
      await createDiscordExtra("automod", buildAutoModPayload());
      message.value = "AutoMod 규칙을 만들었어요.";
    }

    resetAutoModForm();
    await load();
  } catch (caught) {
    fail(caught, "AutoMod 규칙을 저장하지 못했어요.");
  } finally {
    busy.value = false;
  }
}

async function toggleAutoMod(rule) {
  busy.value = true;
  error.value = "";
  message.value = "";

  try {
    await setDiscordAutoModEnabled(rule.id, !rule.enabled);
    message.value = rule.enabled ? "규칙을 중지했어요." : "규칙을 켰어요.";
    await load();
  } catch (caught) {
    fail(caught, "규칙 상태를 바꾸지 못했어요.");
  } finally {
    busy.value = false;
  }
}

function toLocalInput(iso) {
  if (!iso) {
    return "";
  }

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (value) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function resetEventForm() {
  eventEditingId.value = "";
  eventForm.name = "";
  eventForm.description = "";
  eventForm.entityType = 3;
  eventForm.location = "";
  eventForm.channelId = "";
  eventForm.startAt = "";
  eventForm.endAt = "";
}

function editEvent(event) {
  eventEditingId.value = event.id;
  eventForm.name = event.name || "";
  eventForm.description = event.description || "";
  eventForm.entityType = Number(event.entityType) === 2 ? 2 : 3;
  eventForm.location = event.location || "";
  eventForm.channelId = event.channelId || "";
  eventForm.startAt = toLocalInput(event.scheduledStartAt);
  eventForm.endAt = toLocalInput(event.scheduledEndAt);
}

async function submitEvent() {
  busy.value = true;
  error.value = "";
  message.value = "";

  const payload = {
    name: eventForm.name.trim(),
    description: eventForm.description.trim(),
    entityType: Number(eventForm.entityType),
    startAt: fromLocalInput(eventForm.startAt),
    endAt: fromLocalInput(eventForm.endAt),
  };

  if (payload.entityType === 3) {
    payload.location = eventForm.location.trim();
  } else {
    payload.channelId = eventForm.channelId;
  }

  try {
    if (eventEditingId.value) {
      await updateDiscordExtra("event", eventEditingId.value, payload);
      message.value = "예약 이벤트를 수정했어요.";
    } else {
      await createDiscordExtra("event", payload);
      message.value = "예약 이벤트를 만들었어요.";
    }

    resetEventForm();
    await load();
  } catch (caught) {
    fail(caught, "예약 이벤트를 저장하지 못했어요.");
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<style scoped lang="scss">
.extras-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.subtab-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.subtab-button {
  height: 34px;
  padding: 0 14px;
  border: none;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.subtab-button.active {
  background: rgba(99, 102, 241, 0.24);
  color: #c7d2fe;
}
.panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.08);
}
.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.panel-head h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 800;
  color: #ffffff;
}
.panel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.preset-button {
  height: 38px;
  padding: 0 14px;
  border: none;
  border-radius: 10px;
  background: rgba(99, 102, 241, 0.24);
  color: #c7d2fe;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.ghost-button {
  height: 38px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  background: transparent;
  color: rgba(255, 255, 255, 0.72);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.danger-button {
  height: 38px;
  padding: 0 14px;
  border: none;
  border-radius: 10px;
  background: rgba(239, 68, 68, 0.28);
  color: #fecaca;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.preset-button:disabled,
.ghost-button:disabled,
.danger-button:disabled {
  opacity: 0.5;
  cursor: default;
}
.hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.55);
}
.hint.warn {
  color: #fcd34d;
}
.muted {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}
.error {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(239, 68, 68, 0.16);
  color: #fca5a5;
  font-size: 12px;
  line-height: 1.5;
}
.notice {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(16, 185, 129, 0.16);
  color: #6ee7b7;
  font-size: 12px;
  line-height: 1.5;
}
.confirm-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(239, 68, 68, 0.18);
  border: 1px solid rgba(248, 113, 113, 0.4);
  font-size: 12px;
  color: #fecaca;
}
.confirm-actions {
  display: flex;
  gap: 8px;
}
.create-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.74);
}
.field.wide {
  grid-column: 1 / -1;
}
.field > span:first-child {
  font-weight: 700;
  color: #ffffff;
}
.field input[type="text"],
.field input[type="url"],
.field input[type="number"],
.field input[type="datetime-local"],
.field select,
.field textarea {
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
  font-size: 13px;
  font-family: inherit;
}
.field select option {
  color: #111827;
}
.field textarea {
  resize: vertical;
}
.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chip-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 12px;
  color: rgba(255, 255, 255, 0.76);
  cursor: pointer;
}
.chip-check input {
  width: 15px;
  height: 15px;
  accent-color: #818cf8;
}
.row-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.row-main {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 13px;
  color: #ffffff;
}
.row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.emoji-thumb {
  width: 26px;
  height: 26px;
  object-fit: contain;
}
.inline-input {
  padding: 6px 10px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
  font-size: 13px;
  font-family: inherit;
}
.pill {
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 11px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.72);
}
.pill.ok {
  background: rgba(16, 185, 129, 0.18);
  color: #6ee7b7;
}
.pill.danger {
  background: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
}
.pill.muted-pill {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.5);
}
.link-button {
  border: none;
  background: none;
  padding: 0;
  color: #c7d2fe;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.link-button.danger {
  color: #fca5a5;
}
.link-button:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
