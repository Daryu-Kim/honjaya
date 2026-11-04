// 마인크래프트 64x64 스킨을 TV 좌석 캐릭터로 그립니다.
//
// 기본으로 남성/여성/직원 스킨을 직접 그려서 내장하고, 손님이 마인크래프트
// 닉네임을 넣으면 그 플레이어의 스킨을 받아 대신 사용합니다.
// 스킨은 정면(16x32 논리 픽셀)으로 펼친 뒤 색상별 SVG path 몇 개로 합칩니다.

import { reactive } from "vue";
import { normalizeMinecraftNickname } from "./characterStyle";

const SKIN_SIZE = 64;
const LEGACY_SKIN_HEIGHT = 32;
const VIEW_WIDTH = 16;
const VIEW_HEIGHT = 32;
// 정면 뷰는 64x64 스프라이트 박스 안에 2배로 그립니다.
const SPRITE_SCALE = 2;
const SPRITE_OFFSET_X = 16;

const PLAYER_API = "https://playerdb.co/api/player/minecraft/";
const CACHE_KEY = "honjaya.minecraft-skins.v1";
const CACHE_LIMIT = 24;
const FETCH_TIMEOUT_MS = 9000;

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

const DEFAULT_PALETTES = {
  male: {
    h: "#4a3527",
    H: "#33241a",
    s: "#d8a378",
    d: "#b98357",
    e: "#2b2233",
    w: "#f5f2ff",
    m: "#a4565f",
    r: "#e8938f",
    t: "#3f7f8c",
    T: "#2d5f6b",
    a: "#f5d06f",
    p: "#3b4a6b",
    P: "#2b3550",
    o: "#252b36",
  },
  female: {
    h: "#66303f",
    H: "#4b2130",
    s: "#f0c8a2",
    d: "#d3a67e",
    e: "#2b2233",
    w: "#fff6fa",
    m: "#c8627a",
    r: "#f2a0aa",
    t: "#c2607a",
    T: "#a04a62",
    a: "#ffd9e2",
    p: "#4a3a5c",
    P: "#372a45",
    o: "#2f2438",
  },
  staff: {
    h: "#2f2a3d",
    H: "#1f1b2b",
    s: "#e8b98f",
    d: "#c4956c",
    e: "#241b33",
    w: "#f7f3ff",
    m: "#a4565f",
    r: "#e8938f",
    t: "#2b2f3a",
    T: "#1d212a",
    a: "#e0a44a",
    p: "#22262f",
    P: "#171a21",
    o: "#12141a",
  },
};

// 얼굴은 좌우 대칭이 되도록 왼쪽 절반만 적고 오른쪽은 뒤집어 붙입니다.
// h=머리카락 s=피부 e=눈 r=볼터치 w=눈 하이라이트 m=입
const HEAD_ART_HALVES = {
  male: ["hhhh", "hhhh", "hhss", "hess", "hess", "srss", "sssm", "ssss"],
  female: ["hhhh", "hhhh", "hhss", "hess", "hwss", "srss", "sssm", "hsss"],
};

function mirrorHalf(half) {
  return half + [...half].reverse().join("");
}

const HEAD_ART = {
  male: HEAD_ART_HALVES.male.map(mirrorHalf),
  female: HEAD_ART_HALVES.female.map(mirrorHalf),
};

const BODY_ART = {
  male: [
    "tttttttt",
    "tttssttt",
    "tttttttt",
    "taaaaaat",
    "tttttttt",
    "tttttttt",
    "tttttttt",
    "tttttttt",
    "tttttttt",
    "tttttttt",
    "TTTTTTTT",
    "TTTTTTTT",
  ],
  female: [
    "htttttth",
    "httsstth",
    "htttttth",
    "haaaaaah",
    "htttttth",
    "tttttttt",
    "tttttttt",
    "tttttttt",
    "tttttttt",
    "tttttttt",
    "TTTTTTTT",
    "TTTTTTTT",
  ],
};

// 소매 안쪽은 어둡게 칠해 몸통과 팔이 구분되게 합니다. (반대쪽 팔은 좌우 반전)
const ARM_ART = [
  "tttT",
  "tttT",
  "tttT",
  "tttT",
  "dsss",
  "dsss",
  "dsss",
  "dsss",
  "dsss",
  "dsss",
  "dsss",
  "dsss",
];

// 다리 안쪽도 어둡게 해서 두 다리가 붙어 보이지 않게 합니다.
const LEG_ART = [
  "PppP",
  "PppP",
  "PppP",
  "PppP",
  "PppP",
  "PppP",
  "PppP",
  "PppP",
  "PppP",
  "PPPP",
  "oooo",
  "oooo",
];

function placeArt(grid, rows, slot, palette, mirrored) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const tone = row[mirrored ? row.length - 1 - x : x];
      const color = palette[tone];

      if (!color) continue;

      grid[(slot.y + y) * VIEW_WIDTH + slot.x + x] = color;
    }
  });
}

function buildDefaultGrid(kind) {
  const palette = DEFAULT_PALETTES[kind] || DEFAULT_PALETTES.female;
  // 직원은 남성 기본 스킨에 직원 전용 팔레트(검은 셔츠 + 앰버 포인트)를 씁니다.
  const artKind = kind === "female" ? "female" : "male";
  const grid = new Array(VIEW_WIDTH * VIEW_HEIGHT).fill(null);

  Object.keys(VIEW_SLOTS).forEach((part) => {
    const slot = VIEW_SLOTS[part];

    if (part === "head") {
      placeArt(grid, HEAD_ART[artKind], slot, palette, false);
    } else if (part === "body") {
      placeArt(grid, BODY_ART[artKind], slot, palette, false);
    } else if (part === "rightArm" || part === "leftArm") {
      placeArt(grid, ARM_ART, slot, palette, slot.mirrored);
    } else {
      placeArt(grid, LEG_ART, slot, palette, slot.mirrored);
    }
  });

  return grid;
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

const DEFAULT_PARTS = {
  male: gridToParts(buildDefaultGrid("male")),
  female: gridToParts(buildDefaultGrid("female")),
  staff: gridToParts(buildDefaultGrid("staff")),
};

export function defaultSkinParts(kind) {
  return DEFAULT_PARTS[kind] || DEFAULT_PARTS.female;
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

async function fetchPlayerSkin(name) {
  let payload = null;

  try {
    const response = await withTimeout(
      fetch(`${PLAYER_API}${encodeURIComponent(name)}`),
      "스킨 조회가 지연되고 있어요."
    );

    if (response.ok) {
      payload = await response.json();
    }
  } catch (error) {
    throw new Error("스킨을 조회하지 못했어요.");
  }

  const player = payload && payload.data ? payload.data.player : null;
  const textureUrl = player ? player.skin_texture : "";

  if (!payload || !payload.success || !textureUrl) {
    throw new Error("스킨을 찾지 못했어요.");
  }

  return decodeSkinSource(textureUrl);
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

async function loadSkinTexture(key, name) {
  const cached = readCachedSkin(key);

  if (cached) {
    try {
      return await decodeSkinSource(cached);
    } catch (error) {
      // 저장된 스킨이 깨졌으면 새로 받아옵니다.
    }
  }

  return fetchPlayerSkin(name);
}

const skinEntries = reactive({});
const pendingSkins = new Set();

function skinKey(nickname) {
  return String(nickname || "")
    .trim()
    .toLowerCase();
}

function ensureSkinLoaded(key, name) {
  if (skinEntries[key] || pendingSkins.has(key)) return;

  pendingSkins.add(key);
  skinEntries[key] = {
    status: "loading",
    message: "스킨을 불러오는 중이에요.",
  };

  loadSkinTexture(key, name)
    .then((texture) => {
      skinEntries[key] = {
        status: "ready",
        message: "",
        parts: gridToParts(sampleSkinGrid(texture)),
      };
      saveCachedSkin(key, texture.dataUrl);
    })
    .catch(() => {
      skinEntries[key] = {
        status: "missing",
        message: "닉네임에 해당하는 스킨이 없어 기본 캐릭터로 보여드려요.",
      };
    })
    .finally(() => {
      pendingSkins.delete(key);
    });
}

// 닉네임에 해당하는 스킨을 찾고, 없으면 null을 돌려줍니다.
// 화면이 그리는 도중에 호출되므로 처음 만난 닉네임은 불러오기를 걸어둡니다.
export function skinPartsFor(nickname) {
  const name = normalizeMinecraftNickname(nickname);

  if (!name) return null;

  const key = skinKey(name);
  const entry = skinEntries[key];

  if (entry && entry.status === "ready") return entry.parts;

  ensureSkinLoaded(key, name);

  return null;
}

export function getSkinStatus(nickname) {
  const name = normalizeMinecraftNickname(nickname);

  if (!name) return { status: "idle", message: "" };

  return skinEntries[skinKey(name)] || { status: "idle", message: "" };
}
