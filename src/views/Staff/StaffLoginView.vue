<template>
  <div class="staff-login-view">
    <div class="login-card">
      <p class="eyebrow">HONJAYA STAFF</p>
      <h1>직원 로그인</h1>
      <p class="description">
        매장 운영 화면은 직원만 사용할 수 있어요. 사장님이 발급한 아이디로
        로그인해 주세요.
      </p>

      <form class="login-form" @submit.prevent="submitLogin">
        <label class="field">
          <span>아이디</span>
          <input
            v-model="loginId"
            type="text"
            autocomplete="username"
            placeholder="아이디를 입력해 주세요"
            :disabled="isSubmitting"
          />
        </label>

        <label class="field">
          <span>비밀번호</span>
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            placeholder="비밀번호를 입력해 주세요"
            :disabled="isSubmitting"
          />
        </label>

        <label class="remember-field">
          <input v-model="remember" type="checkbox" :disabled="isSubmitting" />
          <span>이 기기에서 로그인 유지 (30일)</span>
        </label>

        <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>

        <button type="submit" class="submit-button" :disabled="isSubmitting">
          {{ isSubmitting ? "로그인 중..." : "로그인" }}
        </button>
      </form>

      <p class="hint">비밀번호를 잊었다면 사장님께 재발급을 요청해 주세요.</p>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import {
  loadStaffSession,
  staffAuthState,
  staffLogin,
} from "@/lib/staffAuth.js";

const router = useRouter();
const route = useRoute();

const loginId = ref("");
const password = ref("");
const remember = ref(true);
const isSubmitting = ref(false);
const errorMessage = ref("");

function resolveRedirectPath() {
  const redirect = String(route.query?.redirect || "");

  // 외부 주소로 튕기지 않도록 같은 앱 내부 경로만 허용합니다.
  if (redirect.startsWith("/") && !redirect.startsWith("//")) {
    return redirect;
  }

  return "/admin/dashboard";
}

async function submitLogin() {
  if (isSubmitting.value) {
    return;
  }

  const safeLoginId = loginId.value.trim();

  if (!safeLoginId || !password.value) {
    errorMessage.value = "아이디와 비밀번호를 모두 입력해 주세요.";
    return;
  }

  isSubmitting.value = true;
  errorMessage.value = "";

  try {
    await staffLogin({
      loginId: safeLoginId,
      password: password.value,
      remember: remember.value,
    });

    await router.replace(resolveRedirectPath());
  } catch (error) {
    errorMessage.value = error?.message || "로그인하지 못했어요.";
    password.value = "";
  } finally {
    isSubmitting.value = false;
  }
}

onMounted(async () => {
  // 이미 로그인한 직원이면 바로 운영 화면으로 보냅니다.
  const employee = await loadStaffSession();

  if (employee) {
    await router.replace(resolveRedirectPath());
    return;
  }

  if (staffAuthState.error) {
    errorMessage.value = staffAuthState.error;
  }
});
</script>

<style scoped lang="scss">
.staff-login-view {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 20px;
  background: radial-gradient(
      circle at 20% 20%,
      rgba(212, 175, 55, 0.16),
      transparent 55%
    ),
    #0b1220;
  color: #fff;
}

.login-card {
  width: 100%;
  max-width: 420px;
  padding: 36px 32px;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);

  .eyebrow {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.18em;
    color: #d4af37;
  }

  h1 {
    margin: 0 0 12px;
    font-size: 26px;
    font-weight: 800;
  }

  .description {
    margin: 0 0 28px;
    font-size: 14px;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.62);
  }
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;

  span {
    font-size: 13px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.75);
  }

  input {
    height: 48px;
    padding: 0 14px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(0, 0, 0, 0.35);
    color: #fff;
    font-size: 15px;
    outline: none;

    &::placeholder {
      color: rgba(255, 255, 255, 0.32);
    }

    &:focus {
      border-color: rgba(212, 175, 55, 0.75);
      box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.16);
    }

    &:disabled {
      opacity: 0.55;
    }
  }
}

.remember-field {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.66);

  input {
    width: 16px;
    height: 16px;
    accent-color: #d4af37;
  }
}

.error-box {
  margin: 0;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(248, 113, 113, 0.4);
  background: rgba(248, 113, 113, 0.12);
  color: #fca5a5;
  font-size: 13px;
  line-height: 1.5;
}

.submit-button {
  height: 50px;
  margin-top: 4px;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #d4af37, #b8860b);
  color: #10151f;
  font-size: 16px;
  font-weight: 800;
  cursor: pointer;

  &:disabled {
    cursor: wait;
    opacity: 0.7;
  }
}

.hint {
  margin: 20px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.42);
}
</style>
