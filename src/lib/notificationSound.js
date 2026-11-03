// Shared notification chime for customer phones and the bar TV.
//
// Browsers only allow audio after the page received a user gesture, so the
// audio context is created lazily and resumed on the first interaction.
// isSoundUnlocked exposes that state so the TV can ask staff to tap once.
import { ref } from "vue";

let audioContext = null;
let hasUnlockListeners = false;

const UNLOCK_EVENTS = ["pointerdown", "touchstart", "keydown"];

export const PHONE_CHIME = [
  { offset: 0, frequency: 880, duration: 0.13, gain: 0.2 },
  { offset: 0.09, frequency: 1318, duration: 0.06, gain: 0.2 },
];

// 매장 소음에 묻히지 않도록 TV는 더 길고 높은 두 음으로 재생합니다.
export const TV_CHIME = [
  {
    offset: 0,
    frequency: 1318.5,
    duration: 0.42,
    gain: 0.34,
    type: "triangle",
  },
  {
    offset: 0.16,
    frequency: 1760,
    duration: 0.56,
    gain: 0.26,
    type: "triangle",
  },
];

export const isSoundUnlocked = ref(false);

function syncUnlockedState() {
  isSoundUnlocked.value =
    Boolean(audioContext) && audioContext.state === "running";
}

function ensureAudioContext() {
  if (audioContext) {
    return audioContext;
  }

  const AudioCtor = window.AudioContext || window.webkitAudioContext;

  if (!AudioCtor) {
    return null;
  }

  try {
    audioContext = new AudioCtor();
    audioContext.onstatechange = syncUnlockedState;
  } catch (error) {
    audioContext = null;
  }

  syncUnlockedState();

  return audioContext;
}

function resumeAudioContext() {
  const context = ensureAudioContext();

  if (!context) {
    return;
  }

  if (context.state === "running") {
    syncUnlockedState();
    return;
  }

  context
    .resume()
    .then(syncUnlockedState)
    .catch(() => {});
}

export function registerSoundUnlock() {
  if (hasUnlockListeners) {
    return;
  }

  hasUnlockListeners = true;
  UNLOCK_EVENTS.forEach((eventName) => {
    window.addEventListener(eventName, resumeAudioContext, { passive: true });
  });
}

// 실수로 차임이 막힌 채 남지 않도록, 화면 진입 시점에 한 번 깨워 둡니다.
export function primeNotificationSound() {
  registerSoundUnlock();
  resumeAudioContext();
}

export function playNotificationChime(tones = PHONE_CHIME) {
  const context = ensureAudioContext();

  if (!context) {
    return false;
  }

  if (context.state !== "running") {
    resumeAudioContext();
    return false;
  }

  const startAt = context.currentTime;

  tones.forEach(({ offset, frequency, duration, gain, type = "sine" }) => {
    const oscillator = context.createOscillator();
    const amp = context.createGain();

    oscillator.type = type;
    oscillator.frequency.value = frequency;
    amp.gain.setValueAtTime(0.0001, startAt + offset);
    amp.gain.exponentialRampToValueAtTime(gain, startAt + offset + 0.02);
    amp.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + duration);

    oscillator.connect(amp);
    amp.connect(context.destination);
    oscillator.start(startAt + offset);
    oscillator.stop(startAt + offset + duration + 0.02);
  });

  return true;
}
