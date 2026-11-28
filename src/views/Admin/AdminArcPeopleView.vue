<template>
  <div class="admin-arc-people-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ARC SAFETY · ARC 대표(RN) 전용</p>
        <h1>인사카드 — 직원·사장 관리</h1>
        <p class="description">
          혼자야에서 일하는 사람의 기본정보와 “현장에서 쓰러졌을 때 먼저 알아야
          할 것”을 한 장에 모읍니다. 주민등록번호와 건강 항목은 암호화되어
          저장되고, 화면에는 마스킹만 보여요.
        </p>
      </div>
      <nav class="header-links">
        <router-link to="/admin/arc" class="link-button">
          응급안전 홈
        </router-link>
        <router-link to="/admin/arc/permissions" class="link-button">
          응급안전 권한 관리
        </router-link>
      </nav>
    </header>

    <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>
    <p v-if="okMessage" class="ok-box">{{ okMessage }}</p>

    <section class="summary-grid">
      <article class="summary-card">
        <span class="summary-label">등록된 카드</span>
        <strong>{{ stats.total ?? 0 }}명</strong>
        <span class="summary-sub"
          >사장 {{ stats.owner ?? 0 }} · 직원 {{ stats.staff ?? 0 }}</span
        >
      </article>
      <article class="summary-card warn">
        <span class="summary-label">카드가 없는 계정</span>
        <strong>{{ stats.missing ?? 0 }}명</strong>
        <span class="summary-sub">아래에서 바로 만들 수 있어요</span>
      </article>
      <article class="summary-card">
        <span class="summary-label">건강 항목 입력</span>
        <strong>{{ stats.healthFilled ?? 0 }}명</strong>
        <span class="summary-sub">알레르기·지병이 적힌 카드</span>
      </article>
      <article class="summary-card" :class="{ danger: !encryptionReady }">
        <span class="summary-label">암호화 키</span>
        <strong>{{ encryptionReady ? "정상" : "미설정" }}</strong>
        <span class="summary-sub">ARC_FIELD_KEY</span>
      </article>
    </section>

    <p v-if="tips.length" class="guide-box">
      <strong>인사카드 작성 원칙</strong>
      <span v-for="tip in tips" :key="tip" class="guide-line">{{ tip }}</span>
    </p>

    <div class="layout">
      <section class="panel">
        <div class="panel-head">
          <h2>카드 목록</h2>
          <div class="panel-actions">
            <input
              v-model="keyword"
              class="inline-input"
              type="search"
              placeholder="이름·아이디·전화 검색"
            />
            <button
              type="button"
              class="mini-button"
              :disabled="isLoading"
              @click="reload"
            >
              새로고침
            </button>
            <button type="button" class="mini-button" @click="startNew">
              새 카드
            </button>
          </div>
        </div>

        <div v-if="missingAccounts.length" class="missing-box">
          <span class="missing-title">계정은 있는데 카드가 없어요</span>
          <button
            v-for="account in missingAccounts"
            :key="account.loginId"
            type="button"
            class="missing-chip"
            @click="startFromAccount(account)"
          >
            + {{ account.name }} ({{ account.loginId }})
          </button>
        </div>

        <div v-if="cards.length" class="card-list">
          <button
            v-for="card in cards"
            :key="card.id"
            type="button"
            class="person-card"
            :class="{ active: form.editId === card.id }"
            @click="openCard(card.id)"
          >
            <span class="person-name">
              {{ card.name }}
              <small>{{ card.employmentLabel }}</small>
            </span>
            <span class="person-meta">
              {{ card.roleLabel || card.loginId || "임시 카드" }}
            </span>
            <span class="person-meta">
              {{ card.phone || "전화번호 없음" }}
            </span>
            <span class="person-tags">
              <span v-if="card.health.allergies" class="tag warn"
                >알레르기</span
              >
              <span v-if="card.health.conditions" class="tag warn">지병</span>
              <span v-if="card.health.medications" class="tag info"
                >복용약</span
              >
              <span v-if="!card.healthReady" class="tag danger"
                >복호화 실패</span
              >
            </span>
          </button>
        </div>
        <p v-else class="panel-note">
          아직 인사카드가 없어요. 위의 “새 카드”로 사장·직원 카드를 만들어
          주세요.
        </p>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>{{ form.editId ? "카드 수정" : "새 카드 작성" }}</h2>
          <span class="panel-note">{{
            form.name || "이름을 넣어 주세요"
          }}</span>
        </div>

        <div class="field-grid">
          <label class="field">
            <span>이름 *</span>
            <input
              v-model="form.name"
              type="text"
              maxlength="60"
              placeholder="예: 김원재"
            />
          </label>
          <label class="field">
            <span>연결 계정</span>
            <select v-model="form.employeeId">
              <option value="">계정 없음(임시 카드)</option>
              <option
                v-for="account in accounts"
                :key="account.employeeId"
                :value="account.employeeId"
              >
                {{ account.name }} ({{ account.loginId }})
              </option>
            </select>
          </label>
          <label class="field">
            <span>직위·표시명</span>
            <input
              v-model="form.roleLabel"
              type="text"
              maxlength="40"
              placeholder="예: 사장 / ARC 대표(RN) / 바텐더"
            />
          </label>
          <label class="field">
            <span>고용 형태</span>
            <select v-model="form.employment">
              <option
                v-for="kind in employmentKinds"
                :key="kind.key"
                :value="kind.key"
              >
                {{ kind.label }}
              </option>
            </select>
          </label>
          <label class="field">
            <span>주민등록번호 (암호화 저장)</span>
            <input
              v-model="form.residentNo"
              type="text"
              maxlength="20"
              :placeholder="residentPlaceholder"
            />
            <small class="field-hint">
              {{ residentHint }}
            </small>
          </label>
          <label class="field">
            <span>생년월일</span>
            <input v-model="form.birthOn" type="date" />
          </label>
          <label class="field">
            <span>전화번호</span>
            <input
              v-model="form.phone"
              type="tel"
              maxlength="40"
              placeholder="010-0000-0000"
            />
          </label>
          <label class="field">
            <span>입사일</span>
            <input v-model="form.joinedOn" type="date" />
          </label>
          <label class="field">
            <span>비상연락 이름</span>
            <input
              v-model="form.emergencyName"
              type="text"
              maxlength="60"
              placeholder="가족·지인"
            />
          </label>
          <label class="field">
            <span>비상연락 번호</span>
            <input v-model="form.emergencyPhone" type="tel" maxlength="40" />
          </label>
          <label class="field wide">
            <span>주소</span>
            <input
              v-model="form.address"
              type="text"
              maxlength="300"
              placeholder="사고 시 방문·이송 참고"
            />
          </label>
        </div>

        <h3 class="section-title">현장 참고 건강정보</h3>
        <div class="field-grid">
          <label
            v-for="field in healthFields"
            :key="field.key"
            class="field"
            :class="{ wide: field.key === 'note' }"
          >
            <span>{{ field.label }}</span>
            <input
              v-model="form.health[field.key]"
              type="text"
              maxlength="600"
              :placeholder="field.hint"
            />
          </label>
        </div>

        <label class="field">
          <span>기타 메모</span>
          <textarea
            v-model="form.note"
            rows="3"
            maxlength="1000"
            placeholder="급여 정산 계좌, 근무 가능 요일, 손님 응대 시 유의사항 등"
          ></textarea>
        </label>

        <div class="form-actions">
          <button
            type="button"
            class="primary-button"
            :disabled="isSaving || !form.name.trim()"
            @click="submit"
          >
            {{ form.editId ? "카드 저장" : "카드 만들기" }}
          </button>
          <button
            v-if="form.editId"
            type="button"
            class="mini-button"
            :disabled="isSaving"
            @click="removeCard"
          >
            카드 삭제
          </button>
          <button
            type="button"
            class="mini-button"
            :disabled="isSaving"
            @click="startNew"
          >
            내용 비우기
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script>
import { computed, onMounted, reactive, ref } from "vue";
import {
  deleteArcPerson,
  fetchArcPeople,
  fetchArcPeopleAccounts,
  fetchArcPerson,
  saveArcPerson,
} from "@/lib/arc";

function emptyForm() {
  return {
    editId: "",
    employeeId: "",
    name: "",
    roleLabel: "",
    employment: "FULL",
    residentNo: "",
    birthOn: "",
    phone: "",
    emergencyName: "",
    emergencyPhone: "",
    address: "",
    joinedOn: "",
    note: "",
    health: {
      bloodType: "",
      allergies: "",
      conditions: "",
      medications: "",
      note: "",
    },
  };
}

export default {
  name: "AdminArcPeopleView",
  setup() {
    const board = ref({ cards: [], catalog: {}, missing: [], stats: {} });
    const accounts = ref([]);
    const keyword = ref("");
    const isLoading = ref(false);
    const isSaving = ref(false);
    const errorMessage = ref("");
    const okMessage = ref("");
    const form = reactive(emptyForm());

    const cards = computed(() => board.value.cards ?? []);
    const missingAccounts = computed(() => board.value.missing ?? []);
    const stats = computed(() => board.value.stats ?? {});
    const catalog = computed(() => board.value.catalog ?? {});
    const healthFields = computed(() => catalog.value.healthFields ?? []);
    const employmentKinds = computed(() => catalog.value.employmentKinds ?? []);
    const tips = computed(() => catalog.value.tips ?? []);
    const encryptionReady = computed(
      () => catalog.value.encryptionReady !== false
    );

    // 저장된 주민등록번호 마스킹 값 — 수정 화면에서 "바꿀 때만 입력" 안내에 씁니다.
    const currentMask = ref("");

    const residentPlaceholder = computed(() =>
      form.editId && currentMask.value
        ? `저장됨: ${currentMask.value} (바꿀 때만 입력)`
        : "예: 900101-1234567"
    );

    const residentHint = computed(() =>
      currentMask.value
        ? `지금 저장된 값: ${currentMask.value}. 비워 두면 그대로 둡니다.`
        : "뒷자리는 저장 후에도 첫 글자만 보입니다. 비워 두어도 됩니다."
    );

    function applyCard(card) {
      Object.assign(form, emptyForm(), {
        editId: card.id,
        employeeId: card.employeeId || "",
        name: card.name ?? "",
        roleLabel: card.roleLabel ?? "",
        employment: card.employment ?? "FULL",
        residentNo: "",
        birthOn: card.birthOn ?? "",
        phone: card.phone ?? "",
        emergencyName: card.emergencyName ?? "",
        emergencyPhone: card.emergencyPhone ?? "",
        address: card.address ?? "",
        joinedOn: card.joinedOn ?? "",
        note: card.note ?? "",
        health: {
          bloodType: card.health?.bloodType ?? "",
          allergies: card.health?.allergies ?? "",
          conditions: card.health?.conditions ?? "",
          medications: card.health?.medications ?? "",
          note: card.health?.note ?? "",
        },
      });
      currentMask.value = card.residentMask || "";
    }

    function startNew() {
      Object.assign(form, emptyForm());
      currentMask.value = "";
      errorMessage.value = "";
      okMessage.value = "";
    }

    function startFromAccount(account) {
      Object.assign(form, emptyForm(), {
        employeeId: account.employeeId,
        name: account.name ?? "",
        roleLabel: account.title ?? "",
        employment: account.role === "OWNER" ? "OWNER" : "FULL",
      });
      currentMask.value = "";
      okMessage.value =
        "계정 정보를 채웠어요. 나머지를 채우고 카드 만들기를 눌러 주세요.";
    }

    async function openCard(cardId) {
      errorMessage.value = "";

      try {
        const result = await fetchArcPerson(cardId);
        applyCard(result.card);
      } catch (error) {
        errorMessage.value =
          error?.response?.data?.message ||
          error?.message ||
          "카드를 불러오지 못했어요.";
      }
    }

    async function reload() {
      isLoading.value = true;
      errorMessage.value = "";

      try {
        const [people, accountBoard] = await Promise.all([
          fetchArcPeople({ keyword: keyword.value }),
          fetchArcPeopleAccounts(),
        ]);

        board.value = people;
        accounts.value = accountBoard.accounts ?? [];
      } catch (error) {
        errorMessage.value =
          error?.response?.data?.message ||
          error?.message ||
          "인사카드를 불러오지 못했어요.";
      } finally {
        isLoading.value = false;
      }
    }

    async function submit() {
      if (!form.name.trim()) {
        errorMessage.value = "이름을 넣어 주세요.";
        return;
      }

      isSaving.value = true;
      errorMessage.value = "";
      okMessage.value = "";

      try {
        await saveArcPerson({
          personId: form.editId,
          employeeId: form.employeeId,
          name: form.name,
          roleLabel: form.roleLabel,
          employment: form.employment,
          residentNo: form.residentNo,
          birthOn: form.birthOn,
          phone: form.phone,
          emergencyName: form.emergencyName,
          emergencyPhone: form.emergencyPhone,
          address: form.address,
          joinedOn: form.joinedOn,
          note: form.note,
          health: form.health,
        });

        const cardName = form.name;
        startNew();
        okMessage.value = `${cardName} 카드를 저장했어요.`;
        await reload();
      } catch (error) {
        errorMessage.value =
          error?.response?.data?.message ||
          error?.message ||
          "카드를 저장하지 못했어요.";
      } finally {
        isSaving.value = false;
      }
    }

    async function removeCard() {
      if (!form.editId) return;

      isSaving.value = true;
      errorMessage.value = "";
      okMessage.value = "";

      try {
        await deleteArcPerson(form.editId);
        okMessage.value = `${form.name} 카드를 삭제했어요.`;
        startNew();
        await reload();
      } catch (error) {
        errorMessage.value =
          error?.response?.data?.message ||
          error?.message ||
          "카드를 삭제하지 못했어요.";
      } finally {
        isSaving.value = false;
      }
    }

    onMounted(reload);

    return {
      board,
      cards,
      accounts,
      keyword,
      isLoading,
      isSaving,
      errorMessage,
      okMessage,
      form,
      stats,
      missingAccounts,
      healthFields,
      employmentKinds,
      tips,
      encryptionReady,
      residentPlaceholder,
      residentHint,
      startNew,
      startFromAccount,
      openCard,
      reload,
      submit,
      removeCard,
    };
  },
};
</script>

<style scoped>
.admin-arc-people-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: #334155;
}

.page-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 22px;
  border-radius: 18px;
  background: #fff;
  border: 1px solid #e2e8f0;
}

.eyebrow {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #f472b6;
}

.page-header h1 {
  margin: 0 0 6px;
  font-size: 21px;
  font-weight: 800;
  color: #0f172a;
}

.description {
  margin: 0;
  max-width: 720px;
  font-size: 12.5px;
  line-height: 1.7;
  color: #475569;
}

.header-links {
  display: flex;
  gap: 8px;
}

.link-button {
  padding: 8px 14px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #fff;
  color: #334155;
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
}

.error-box {
  margin: 0;
  padding: 10px 14px;
  border-radius: 10px;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 13px;
}

.ok-box {
  margin: 0;
  padding: 10px 14px;
  border-radius: 10px;
  background: #ecfdf5;
  color: #047857;
  font-size: 13px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.summary-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #fff;
}

.summary-card.warn {
  border-color: #fcd34d;
  background: #fffbeb;
}

.summary-card.danger {
  border-color: #fecaca;
  background: #fff5f5;
}

.summary-label {
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
}

.summary-card strong {
  font-size: 19px;
  font-weight: 800;
  color: #0f172a;
}

.summary-sub {
  font-size: 11px;
  color: #94a3b8;
}

.guide-box {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 12px 14px;
  border: 1px solid #fbcfe8;
  border-radius: 12px;
  background: #fdf2f8;
  font-size: 12px;
  color: #9d174d;
}

.guide-line {
  line-height: 1.6;
}

.layout {
  display: grid;
  grid-template-columns: minmax(260px, 0.8fr) minmax(0, 1.6fr);
  gap: 16px;
}

@media (max-width: 980px) {
  .layout {
    grid-template-columns: 1fr;
  }
}

.panel {
  padding: 16px 18px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #fff;
}

.panel-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.panel-head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  color: #0f172a;
}

.panel-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.panel-note {
  font-size: 11.5px;
  color: #64748b;
  line-height: 1.6;
}

.inline-input {
  padding: 8px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  font-size: 12px;
  color: #0f172a;
  background: #fff;
}

.mini-button {
  padding: 7px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 9px;
  background: #fff;
  color: #334155;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.mini-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.missing-box {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px dashed #fcd34d;
  border-radius: 12px;
  background: #fffbeb;
}

.missing-title {
  font-size: 11.5px;
  font-weight: 700;
  color: #92400e;
}

.missing-chip {
  padding: 5px 10px;
  border: 1px solid #fcd34d;
  border-radius: 999px;
  background: #fff;
  color: #92400e;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.card-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.person-card {
  display: grid;
  gap: 2px;
  padding: 12px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  text-align: left;
  cursor: pointer;
}

.person-card.active {
  border-color: #f472b6;
  background: #fdf2f8;
}

.person-name {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 14px;
  font-weight: 800;
  color: #0f172a;
}

.person-name small {
  font-size: 10.5px;
  font-weight: 700;
  color: #94a3b8;
}

.person-meta {
  font-size: 11.5px;
  color: #64748b;
}

.person-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.tag {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
}

.tag.warn {
  background: #fef3c7;
  color: #92400e;
}

.tag.info {
  background: #dbeafe;
  color: #1d4ed8;
}

.tag.danger {
  background: #fee2e2;
  color: #b91c1c;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
  font-size: 12px;
  font-weight: 700;
  color: #334155;
}

.field.wide {
  grid-column: 1 / -1;
}

.field input,
.field select,
.field textarea {
  padding: 9px 11px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 400;
  font-family: inherit;
  color: #0f172a;
  background: #fff;
  resize: vertical;
}

.field-hint {
  font-size: 11px;
  font-weight: 400;
  color: #64748b;
  line-height: 1.6;
}

.section-title {
  margin: 6px 0 10px;
  padding-top: 12px;
  border-top: 1px dashed #e2e8f0;
  font-size: 13px;
  font-weight: 800;
  color: #0f172a;
}

.form-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.primary-button {
  padding: 10px 18px;
  border: none;
  border-radius: 10px;
  background: #db2777;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.primary-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
