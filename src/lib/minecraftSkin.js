// 마인크래프트 스킨을 TV 좌석 캐릭터로 그립니다.
//
// 기본 스킨(남자 스티브 / 여자 알렉스)도 손님이 입력한 닉네임 스킨도 모두
// 공개 스킨 API에서 64x64 PNG로 받아 같은 방식으로 그립니다. 손으로 그린
// 그림이 아니라 실제 스킨 텍스처를 쓰기 때문에 옷/머리 색이 원본 그대로 나옵니다.
// 받은 텍스처는 localStorage에 남겨 두어 새로고침해도 다시 받지 않습니다.

import { reactive } from "vue";
import { normalizeMinecraftNickname } from "./characterStyle";

const SKIN_SIZE = 64;
const LEGACY_SKIN_HEIGHT = 32;
const VIEW_WIDTH = 16;
const VIEW_HEIGHT = 32;
// 정면 뷰는 64x64 스프라이트 박스 안에 2배로 그립니다.
const SPRITE_SCALE = 2;
const SPRITE_OFFSET_X = 16;

// 닉네임에 해당하는 64x64 스킨 PNG를 그대로 돌려주는 공개 API입니다.
// 없는 닉네임은 스티브 스킨으로 응답합니다.
const TEXTURE_API = "https://mc-heads.net/skin/";

// 마인크래프트 기본 스킨입니다. 남자는 스티브, 여자는 알렉스입니다.
// 매장 직원과 사장은 각자 쓰는 닉네임 스킨을 그대로 사용합니다.
const DEFAULT_SKIN_NAMES = {
  male: "MHF_Steve",
  female: "MHF_Alex",
  staff: "cheesaceke",
  boss: "Gunchick_",
};

const CACHE_KEY = "honjaya.minecraft-skins.v2";
const CACHE_LIMIT = 24;
const FETCH_TIMEOUT_MS = 9000;
// 입력 중에는 글자마다 요청하지 않도록 잠깐 기다립니다.
const NICKNAME_DEBOUNCE_MS = 400;
// 한 번 실패한 스킨은 잠시 뒤에 다시 시도합니다. (TV가 켜질 때 잠깐 끊긴 경우)
const RETRY_AFTER_MS = 60000;

// 스킨 텍스처에서 쓰는 정면 좌표입니다. overlay는 모자/재킷 등 2번째 레이어입니다.
const FRONT_FACES = {
  head: { x: 8, y: 8, overlayX: 40, overlayY: 8, width: 8, height: 8 },
  body: { x: 20, y: 20, overlayX: 20, overlayY: 36, width: 8, height: 12 },
  rightArm: { x: 44, y: 20, overlayX: 44, overlayY: 36, width: 4, height: 12 },
  rightLeg: { x: 4, y: 20, overlayX: 4, overlayY: 36, width: 4, height: 12 },
  leftArm: { x: 36, y: 52, overlayX: 52, overlayY: 52, width: 4, height: 12 },
  leftLeg: { x: 20, y: 52, overlayX: 4, overlayY: 52, width: 4, height: 12 },
};

// 정면 뷰에서 각 부위가 놓이는 자리입니다. (머리 8 + 몸통 8 + 팔 4x2 = 16)
const VIEW_SLOTS = {
  head: { x: 4, y: 0, mirrored: false },
  rightArm: { x: 0, y: 8, mirrored: false },
  body: { x: 4, y: 8, mirrored: false },
  leftArm: { x: 12, y: 8, mirrored: true },
  rightLeg: { x: 4, y: 20, mirrored: false },
  leftLeg: { x: 8, y: 20, mirrored: true },
};

export function defaultSkinName(kind) {
  return DEFAULT_SKIN_NAMES[kind] || DEFAULT_SKIN_NAMES.female;
}

// 같은 색이 가로로 이어지는 칸을 한 줄(path)로 묶어 SVG를 가볍게 그립니다.
export function gridToParts(grid) {
  const segmentsByColor = new Map();

  for (let y = 0; y < VIEW_HEIGHT; y += 1) {
    let x = 0;

    while (x < VIEW_WIDTH) {
      const color = grid[y * VIEW_WIDTH + x];

      if (!color) {
        x += 1;
        continue;
      }

      let end = x + 1;

      while (end < VIEW_WIDTH && grid[y * VIEW_WIDTH + end] === color) {
        end += 1;
      }

      const width = (end - x) * SPRITE_SCALE;
      const left = SPRITE_OFFSET_X + x * SPRITE_SCALE;
      const top = y * SPRITE_SCALE;
      const segments = segmentsByColor.get(color) || [];

      segments.push(`M${left} ${top}h${width}v${SPRITE_SCALE}h-${width}z`);
      segmentsByColor.set(color, segments);
      x = end;
    }
  }

  return [...segmentsByColor].map(([fill, segments]) => ({
    fill,
    d: segments.join(""),
  }));
}

function readSkinPixel(texture, x, y) {
  const { width, height, pixels } = texture;

  if (x < 0 || y < 0 || x >= width || y >= height) return null;

  const index = (y * width + x) * 4;

  if (pixels[index + 3] === 0) return null;

  return {
    red: pixels[index],
    green: pixels[index + 1],
    blue: pixels[index + 2],
    alpha: pixels[index + 3] / 255,
  };
}

function blendPixel(base, top) {
  if (!top) return base;
  if (!base || top.alpha >= 1) return top;

  const alpha = top.alpha;
  const mix = (first, second) =>
    Math.round(first * alpha + second * (1 - alpha));

  return {
    red: mix(top.red, base.red),
    green: mix(top.green, base.green),
    blue: mix(top.blue, base.blue),
    alpha: 1,
  };
}

function toHexColor(pixel) {
  const hex = (value) => value.toString(16).padStart(2, "0");

  return `#${hex(pixel.red)}${hex(pixel.green)}${hex(pixel.blue)}`;
}

function mirrorColumn(grid, from, to, width, height) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceX = from.x + (width - 1 - x);

      grid[(to.y + y) * VIEW_WIDTH + to.x + x] =
        grid[(from.y + y) * VIEW_WIDTH + sourceX];
    }
  }
}

// 64x64 스킨에서 정면에 필요한 6면만 뽑아 16x32 격자로 펼칩니다.
function sampleSkinGrid(texture) {
  const grid = new Array(VIEW_WIDTH * VIEW_HEIGHT).fill(null);
  // 64x32 예전 스킨은 왼팔/왼다리 영역이 없어서 오른쪽을 좌우 반전해 씁니다.
  const isLegacy = texture.height <= LEGACY_SKIN_HEIGHT;

  Object.keys(FRONT_FACES).forEach((part) => {
    if (isLegacy && (part === "leftArm" || part === "leftLeg")) return;

    const face = FRONT_FACES[part];
    const slot = VIEW_SLOTS[part];

    for (let y = 0; y < face.height; y += 1) {
      for (let x = 0; x < face.width; x += 1) {
        const base = readSkinPixel(texture, face.x + x, face.y + y);
        const overlay = readSkinPixel(
          texture,
          face.overlayX + x,
          face.overlayY + y
        );
        const color = blendPixel(base, overlay);

        if (!color) continue;

        grid[(slot.y + y) * VIEW_WIDTH + slot.x + x] = toHexColor(color);
      }
    }
  });

  if (isLegacy) {
    mirrorColumn(grid, VIEW_SLOTS.rightArm, VIEW_SLOTS.leftArm, 4, 12);
    mirrorColumn(grid, VIEW_SLOTS.rightLeg, VIEW_SLOTS.leftLeg, 4, 12);
  }

  return grid;
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("스킨 이미지를 읽지 못했어요."));
    image.src = source;
  });
}

function withTimeout(promise, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(message)),
      FETCH_TIMEOUT_MS
    );

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

// 스킨 PNG는 64x64 또는 64x32입니다. 어떤 크기로 와도 64 폭으로 맞춰 읽습니다.
async function decodeSkinSource(source) {
  const image = await loadImage(source);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;

  if (!sourceWidth || !sourceHeight) {
    throw new Error("스킨 이미지가 비어 있어요.");
  }

  const scale = SKIN_SIZE / sourceWidth;
  const width = SKIN_SIZE;
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  canvas.width = width;
  canvas.height = height;
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0, width, height);

  const imageData = context.getImageData(0, 0, width, height);
  const dataUrl = String(source).startsWith("data:")
    ? String(source)
    : canvas.toDataURL("image/png");

  return { width, height, pixels: imageData.data, dataUrl };
}

function readCacheStore() {
  const empty = { order: [], items: {} };

  if (typeof window === "undefined") return empty;

  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    if (!parsed || !parsed.items) return empty;

    return {
      order: Array.isArray(parsed.order) ? parsed.order : [],
      items: parsed.items,
    };
  } catch (error) {
    return empty;
  }
}

function readCachedSkin(key) {
  const store = readCacheStore();

  return typeof store.items[key] === "string" ? store.items[key] : "";
}

function saveCachedSkin(key, dataUrl) {
  if (!dataUrl || typeof window === "undefined") return;

  try {
    const store = readCacheStore();
    const order = store.order.filter((item) => item !== key);

    order.push(key);
    store.items[key] = dataUrl;

    while (order.length > CACHE_LIMIT) {
      delete store.items[order.shift()];
    }

    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ order, items: store.items })
    );
  } catch (error) {
    // 저장 공간이 없으면 캐시 없이 동작합니다.
  }
}

// 저장해 둔 텍스처가 있으면 그걸 쓰고, 없으면 스킨 API에서 받아옵니다.
async function loadSkinTexture(key, name) {
  const cached = readCachedSkin(key);

  if (cached) {
    try {
      return await decodeSkinSource(cached);
    } catch (error) {
      // 저장된 스킨이 깨졌으면 새로 받아옵니다.
    }
  }

  return withTimeout(
    decodeSkinSource(`${TEXTURE_API}${encodeURIComponent(name)}`),
    "스킨을 불러오지 못했어요."
  );
}

const skinEntries = reactive({});
const loadingKeys = new Set();
const pendingTimers = new Map();

function skinKey(name) {
  return String(name || "")
    .trim()
    .toLowerCase();
}

function startLoad(key, name) {
  loadingKeys.add(key);
  skinEntries[key] = {
    status: "loading",
    message: "스킨을 불러오는 중이에요.",
  };

  loadSkinTexture(key, name)
    .then((texture) => {
      skinEntries[key] = {
        status: "ready",
        message: "닉네임 스킨을 불러왔어요.",
        parts: gridToParts(sampleSkinGrid(texture)),
      };
      saveCachedSkin(key, texture.dataUrl);
    })
    .catch(() => {
      skinEntries[key] = {
        status: "missing",
        message: "스킨을 찾지 못해 기본 캐릭터로 보여드려요.",
        failedAt: Date.now(),
      };
    })
    .finally(() => {
      loadingKeys.delete(key);
    });
}

// 그리기용 path를 돌려주고, 아직 없으면 불러오기를 걸어 둡니다.
// 화면이 그리는 도중에 호출되므로 처음 만난 스킨은 다음 렌더에서 채워집니다.
export function requestSkinParts(name, { debounce = false } = {}) {
  const key = skinKey(name);

  if (!key) return null;

  const entry = skinEntries[key];

  if (entry) {
    if (entry.status === "ready") return entry.parts;

    const canRetry =
      entry.status === "missing" &&
      Date.now() - Number(entry.failedAt || 0) > RETRY_AFTER_MS;

    if (!canRetry) return null;
  }

  if (loadingKeys.has(key) || pendingTimers.has(key)) return null;

  if (!debounce) {
    startLoad(key, name);
    return null;
  }

  pendingTimers.set(
    key,
    setTimeout(() => {
      pendingTimers.delete(key);
      startLoad(key, name);
    }, NICKNAME_DEBOUNCE_MS)
  );

  return null;
}

// 손님이 입력한 마인크래프트 닉네임의 스킨입니다. (없으면 null)
export function skinPartsFor(nickname, options) {
  const name = normalizeMinecraftNickname(nickname);

  if (!name) return null;

  return requestSkinParts(name, options);
}

// 성별 기본 스킨(남자 스티브 / 여자 알렉스 / 직원)입니다.
export function defaultSkinParts(kind) {
  return requestSkinParts(defaultSkinName(kind)) || [];
}

export function getSkinStatus(nickname) {
  const name = normalizeMinecraftNickname(nickname);

  if (!name) return { status: "idle", message: "" };

  const entry = skinEntries[skinKey(name)];

  if (entry && entry.status === "ready") {
    return { status: "ready", message: entry.message };
  }

  if (entry && entry.status === "missing") {
    return { status: "missing", message: entry.message };
  }

  requestSkinParts(name, { debounce: true });

  return { status: "loading", message: "스킨을 불러오는 중이에요." };
}
