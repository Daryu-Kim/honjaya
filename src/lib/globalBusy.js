import { computed, reactive } from "vue";

const state = reactive({
  pendingCount: 0,
  message: "",
});

export const isGlobalBusy = computed(() => state.pendingCount > 0);
export const globalBusyMessage = computed(
  () => state.message || "처리 중이에요."
);

export function startGlobalBusy(message = "처리 중이에요.") {
  state.pendingCount += 1;
  state.message = message;

  return () => {
    stopGlobalBusy();
  };
}

export function stopGlobalBusy() {
  state.pendingCount = Math.max(0, state.pendingCount - 1);

  if (state.pendingCount === 0) {
    state.message = "";
  }
}

export async function runGlobalBusy(task, message = "처리 중이에요.") {
  if (isGlobalBusy.value) return undefined;

  const release = startGlobalBusy(message);

  try {
    return await task();
  } finally {
    release();
  }
}
