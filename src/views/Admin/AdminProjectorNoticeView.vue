<template>
  <div class="admin-projector-notice-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">ADMIN PROJECTOR</p>
        <h1>프로젝터 공지사항 관리</h1>
        <p class="description">
          프로젝터 하단에 흘러가는 공지 문구를 관리할 수 있어요.
        </p>
      </div>
    </header>

    <section class="page-grid">
      <div class="left-column">
        <section class="panel-card">
          <div class="panel-head">
            <h2>{{ editingNoticeId ? "공지 수정" : "공지 등록" }}</h2>
            <p>문구, 노출 여부, 정렬 순서를 설정할 수 있어요.</p>
          </div>

          <div class="form-grid">
            <div class="form-group">
              <label for="noticeContent">공지 문구</label>
              <textarea
                id="noticeContent"
                v-model.trim="noticeForm.content"
                placeholder="예: 외부 음식 반입은 어렵습니다."
                maxlength="300"
              ></textarea>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="noticeSortOrder">정렬 순서</label>
                <input
                  id="noticeSortOrder"
                  v-model.number="noticeForm.sortOrder"
                  type="number"
                  min="0"
                  step="1"
                />
              </div>

              <div class="form-group checkbox-group">
                <label>노출 여부</label>
                <label class="toggle-row">
                  <input v-model="noticeForm.isActive" type="checkbox" />
                  <span>활성화</span>
                </label>
              </div>
            </div>

            <div class="form-actions">
              <button
                type="button"
                class="primary-button"
                :disabled="isSubmitting"
                @click="submitNotice"
              >
                {{
                  isSubmitting
                    ? "처리 중..."
                    : editingNoticeId
                    ? "공지 수정"
                    : "공지 등록"
                }}
              </button>

              <button
                v-if="editingNoticeId"
                type="button"
                class="secondary-button"
                :disabled="isSubmitting"
                @click="resetForm"
              >
                취소
              </button>
            </div>
          </div>
        </section>

        <section class="panel-card preview-card">
          <div class="panel-head">
            <h2>미리보기</h2>
            <p>프로젝터 하단에서 이런 식으로 흘러가요.</p>
          </div>

          <div class="preview-shell">
            <div class="preview-track">
              <div class="preview-content">
                <span
                  v-for="(notice, index) in previewNoticeList"
                  :key="`preview-a-${index}`"
                  class="preview-item"
                >
                  {{ notice }}
                </span>
              </div>

              <div class="preview-content clone">
                <span
                  v-for="(notice, index) in previewNoticeList"
                  :key="`preview-b-${index}`"
                  class="preview-item"
                >
                  {{ notice }}
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div class="right-column">
        <section class="panel-card">
          <div class="panel-head">
            <h2>공지 목록</h2>
            <p>활성 상태와 정렬 순서를 바로 확인할 수 있어요.</p>
          </div>

          <div v-if="isLoadingNotices" class="empty-box">
            <p>공지 목록을 불러오는 중이에요.</p>
          </div>

          <div v-else-if="noticeList.length === 0" class="empty-box">
            <p>등록된 공지가 없어요.</p>
          </div>

          <div v-else class="notice-list">
            <article
              v-for="notice in sortedNoticeList"
              :key="notice.id"
              class="notice-card"
            >
              <div class="notice-card-head">
                <div class="notice-main">
                  <strong>{{ notice.content }}</strong>
                  <p>
                    정렬 {{ notice.sortOrder ?? 0 }} ·
                    {{ notice.isActive ? "활성" : "비활성" }}
                  </p>
                </div>

                <span
                  class="status-badge"
                  :class="{ inactive: !notice.isActive }"
                >
                  {{ notice.isActive ? "ON" : "OFF" }}
                </span>
              </div>

              <div class="notice-card-actions">
                <button type="button" @click="startEditNotice(notice)">
                  수정
                </button>
                <button type="button" @click="toggleNoticeActive(notice)">
                  {{ notice.isActive ? "비활성화" : "활성화" }}
                </button>
                <button
                  type="button"
                  class="danger"
                  @click="deleteNotice(notice)"
                >
                  삭제
                </button>
              </div>
            </article>
          </div>
        </section>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

const isLoadingNotices = ref(true);
const isSubmitting = ref(false);

const noticeList = ref([]);
const editingNoticeId = ref("");

const noticeForm = ref({
  content: "",
  sortOrder: 0,
  isActive: true,
});

let unsubscribeNotices = null;

const sortedNoticeList = computed(() => {
  return [...noticeList.value].sort((a, b) => {
    const aOrder = Number(a.sortOrder ?? 0);
    const bOrder = Number(b.sortOrder ?? 0);

    if (aOrder !== bOrder) return aOrder - bOrder;

    const aTime =
      typeof a.createdAt?.toDate === "function"
        ? a.createdAt.toDate().getTime()
        : 0;
    const bTime =
      typeof b.createdAt?.toDate === "function"
        ? b.createdAt.toDate().getTime()
        : 0;

    return aTime - bTime;
  });
});

const previewNoticeList = computed(() => {
  const editingContent = String(noticeForm.value.content || "").trim();

  const activeItems = sortedNoticeList.value
    .filter((item) => item.isActive !== false)
    .map((item) => String(item.content || "").trim())
    .filter(Boolean);

  if (editingContent) {
    if (editingNoticeId.value) {
      const base = activeItems.filter((item) => item !== "");
      return [editingContent, ...base].slice(0, 8);
    }

    return [editingContent, ...activeItems].slice(0, 8);
  }

  if (activeItems.length > 0) {
    return activeItems;
  }

  return ["공지 문구를 등록하면 이 영역에서 흘러갑니다."];
});

function resetForm() {
  editingNoticeId.value = "";
  noticeForm.value = {
    content: "",
    sortOrder: getNextSortOrder(),
    isActive: true,
  };
}

function getNextSortOrder() {
  if (noticeList.value.length === 0) return 0;

  const maxOrder = Math.max(
    ...noticeList.value.map((item) => Number(item.sortOrder ?? 0))
  );

  return maxOrder + 1;
}

function subscribeNotices() {
  const q = query(
    collection(db, "projectorNotices"),
    orderBy("sortOrder", "asc")
  );

  unsubscribeNotices = onSnapshot(
    q,
    (snapshot) => {
      noticeList.value = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      isLoadingNotices.value = false;

      if (!editingNoticeId.value && !noticeForm.value.content) {
        noticeForm.value.sortOrder = getNextSortOrder();
      }
    },
    (error) => {
      console.error("공지사항 구독 실패:", error);
      isLoadingNotices.value = false;
    }
  );
}

function startEditNotice(notice) {
  editingNoticeId.value = notice.id;
  noticeForm.value = {
    content: String(notice.content || ""),
    sortOrder: Number(notice.sortOrder ?? 0),
    isActive: notice.isActive !== false,
  };
}

async function submitNotice() {
  const content = String(noticeForm.value.content || "").trim();
  const sortOrder = Number(noticeForm.value.sortOrder ?? 0);
  const isActive = noticeForm.value.isActive === true;

  if (!content) {
    alert("공지 문구를 입력해주세요.");
    return;
  }

  isSubmitting.value = true;

  try {
    if (editingNoticeId.value) {
      await updateDoc(doc(db, "projectorNotices", editingNoticeId.value), {
        content,
        sortOrder,
        isActive,
        updatedAt: serverTimestamp(),
      });
    } else {
      await addDoc(collection(db, "projectorNotices"), {
        content,
        sortOrder,
        isActive,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    resetForm();
  } catch (error) {
    console.error("공지 저장 실패:", error);
    alert("공지 저장 중 문제가 발생했어요.");
  } finally {
    isSubmitting.value = false;
  }
}

async function toggleNoticeActive(notice) {
  try {
    await updateDoc(doc(db, "projectorNotices", notice.id), {
      isActive: !(notice.isActive === true),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("공지 활성 상태 변경 실패:", error);
    alert("공지 상태 변경 중 문제가 발생했어요.");
  }
}

async function deleteNotice(notice) {
  const confirmed = window.confirm("이 공지를 삭제할까요?");
  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "projectorNotices", notice.id));

    if (editingNoticeId.value === notice.id) {
      resetForm();
    }
  } catch (error) {
    console.error("공지 삭제 실패:", error);
    alert("공지 삭제 중 문제가 발생했어요.");
  }
}

onMounted(() => {
  subscribeNotices();
  resetForm();
});

onUnmounted(() => {
  if (unsubscribeNotices) unsubscribeNotices();
});
</script>

<style scoped lang="scss">
.admin-projector-notice-view {
  min-height: 100%;
  padding: 24px;
  color: #fff;
}

.page-header {
  margin-bottom: 20px;
}

.header-left {
  .eyebrow {
    margin: 0 0 6px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: rgba(255, 255, 255, 0.55);
  }

  h1 {
    margin: 0 0 8px;
    font-size: 34px;
    font-weight: 800;
  }

  .description {
    margin: 0;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.72);
  }
}

.page-grid {
  display: grid;
  grid-template-columns: 1fr 0.95fr;
  gap: 16px;
}

.left-column,
.right-column {
  display: grid;
  gap: 16px;
  align-content: start;
}

.panel-card,
.notice-card,
.empty-box {
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.08);
}

.panel-card {
  padding: 18px;
}

.panel-head {
  margin-bottom: 14px;

  h2 {
    margin: 0 0 6px;
    font-size: 22px;
    font-weight: 800;
  }

  p {
    margin: 0;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.66);
  }
}

.form-grid {
  display: grid;
  gap: 14px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 220px;
  gap: 12px;
}

.form-group {
  label {
    display: block;
    margin-bottom: 8px;
    font-size: 13px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.72);
  }

  textarea,
  input[type="number"] {
    width: 100%;
    border: none;
    outline: none;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    font-size: 14px;
  }

  textarea {
    min-height: 120px;
    resize: none;
    padding: 14px;
    line-height: 1.7;
  }

  input[type="number"] {
    height: 48px;
    padding: 0 14px;
  }
}

.checkbox-group {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.toggle-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: 0 4px;
  font-size: 14px;
  font-weight: 700;
}

.form-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.primary-button,
.secondary-button,
.notice-card-actions button {
  height: 44px;
  padding: 0 16px;
  border: none;
  border-radius: 14px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.primary-button {
  background: #fff;
  color: #111827;
}

.secondary-button {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.preview-card {
  overflow: hidden;
}

.preview-shell {
  height: 72px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.05);
  overflow: hidden;
  display: flex;
  align-items: center;
}

.preview-track {
  display: flex;
  width: max-content;
  animation: preview-marquee 20s linear infinite;
}

.preview-content {
  display: flex;
  align-items: center;
  white-space: nowrap;
}

.preview-item {
  display: inline-flex;
  align-items: center;
  height: 72px;
  padding: 0 28px;
  font-size: 18px;
  font-weight: 700;

  &::after {
    content: "•";
    margin-left: 28px;
    color: rgba(255, 255, 255, 0.4);
  }
}

.notice-list {
  display: grid;
  gap: 12px;
}

.notice-card {
  padding: 16px;
}

.notice-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.notice-main {
  min-width: 0;

  strong {
    display: block;
    margin-bottom: 6px;
    font-size: 15px;
    font-weight: 800;
    line-height: 1.6;
    word-break: break-word;
  }

  p {
    margin: 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.58);
  }
}

.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 54px;
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(52, 211, 153, 0.18);
  color: #a7f3d0;
  font-size: 11px;
  font-weight: 800;

  &.inactive {
    background: rgba(255, 255, 255, 0.14);
    color: rgba(255, 255, 255, 0.72);
  }
}

.notice-card-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;

  button {
    background: #fff;
    color: #111827;

    &.danger {
      background: rgba(252, 165, 165, 0.14);
      color: #fecaca;
    }
  }
}

.empty-box {
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;

  p {
    margin: 0;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.72);
  }
}

@keyframes preview-marquee {
  0% {
    transform: translateX(0%);
  }
  100% {
    transform: translateX(-50%);
  }
}

@media (max-width: 1200px) {
  .page-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .form-row {
    grid-template-columns: 1fr;
  }
}
</style>
