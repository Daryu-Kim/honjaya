<template>
  <div class="unsubscribe-view">
    <div class="card">
      <p class="eyebrow">HONJAYA</p>
      <h1>마케팅 수신 거부</h1>

      <div v-if="isLoading" class="state-box">
        <p>확인하는 중이에요...</p>
      </div>

      <div v-else-if="errorMessage" class="state-box error">
        <p>{{ errorMessage }}</p>
        <p class="hint">
          링크가 만료되었거나 잘못된 주소예요. 계속 문자가 오면 매장으로 연락해
          주세요.
        </p>
      </div>

      <div v-else-if="isDone" class="state-box success">
        <p class="done-title">수신 거부가 완료됐어요.</p>
        <p class="hint">
          {{ info.phoneText }} 번호로는 앞으로 광고성 문자가 발송되지 않아요.
          포인트 적립·사용과 주문은 그대로 이용하실 수 있어요.
        </p>
      </div>

      <div v-else class="state-box">
        <p class="target">
          <strong>{{ info.name || "고객" }}</strong> 님 ({{ info.phoneText }})
        </p>
        <p class="hint">
          지금은 광고성 문자 수신에 동의한 상태예요. 아래 버튼을 누르면 바로
          수신을 거부할 수 있어요.
        </p>
        <button
          type="button"
          class="reject-button"
          :disabled="isSubmitting"
          @click="submit"
        >
          {{ isSubmitting ? "처리 중..." : "마케팅 수신 거부하기" }}
        </button>
        <p class="hint small">
          거부 후에도 포인트 적립·사용과 주문 알림은 정상적으로 받으실 수
          있어요.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";

import { fetchUnsubscribeInfo, requestUnsubscribe } from "@/lib/marketing";

const route = useRoute();

const token = String(route.query.token || "");
const isLoading = ref(true);
const isSubmitting = ref(false);
const isDone = ref(false);
const errorMessage = ref("");
const info = ref({ phoneText: "", name: "" });

async function load() {
  if (!token) {
    isLoading.value = false;
    errorMessage.value = "수신거부 링크가 올바르지 않아요.";
    return;
  }

  isLoading.value = true;
  errorMessage.value = "";

  try {
    const result = await fetchUnsubscribeInfo(token);

    info.value = {
      phoneText: result?.phoneText || "",
      name: result?.name || "",
    };

    // 이미 거부한 번호라면 버튼을 다시 보여 줄 필요가 없습니다.
    if (result?.marketingConsent === false) {
      isDone.value = true;
    }
  } catch (error) {
    console.error("수신거부 정보 조회 실패:", error);
    errorMessage.value = error?.message || "수신거부 정보를 확인하지 못했어요.";
  } finally {
    isLoading.value = false;
  }
}

async function submit() {
  isSubmitting.value = true;
  errorMessage.value = "";

  try {
    const result = await requestUnsubscribe(token);

    info.value = {
      phoneText: result?.phoneText || info.value.phoneText,
      name: result?.name || info.value.name,
    };
    isDone.value = true;
  } catch (error) {
    console.error("수신거부 처리 실패:", error);
    errorMessage.value = error?.message || "수신거부 처리에 실패했어요.";
  } finally {
    isSubmitting.value = false;
  }
}

onMounted(load);
</script>

<style scoped lang="scss">
.unsubscribe-view {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
  background: #f8fafc;
}
.card {
  width: 100%;
  max-width: 420px;
  padding: 28px 24px;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  text-align: center;
}
.eyebrow {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.14em;
  color: #6366f1;
}
h1 {
  margin: 0 0 18px;
  font-size: 20px;
  font-weight: 800;
  color: #0f172a;
}
.state-box p {
  margin: 0 0 10px;
  font-size: 14px;
  color: #334155;
  line-height: 1.6;
}
.state-box.error p {
  color: #b91c1c;
}
.done-title {
  font-size: 16px;
  font-weight: 800;
  color: #047857;
}
.target strong {
  font-size: 15px;
}
.hint {
  font-size: 13px;
  color: #64748b;
}
.hint.small {
  font-size: 12px;
  color: #94a3b8;
}
.reject-button {
  width: 100%;
  margin: 8px 0 12px;
  padding: 13px;
  border: none;
  border-radius: 12px;
  background: #4f46e5;
  color: #fff;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
}
.reject-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
