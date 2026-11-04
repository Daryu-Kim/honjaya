// 24x24 픽셀 손님 스프라이트입니다. TV 화면과 손님 캐릭터 편집 화면이 함께 씁니다.
// 성별(몸) · 의상 · 헤어스타일 · 눈 모양 레이어를 겹쳐서 한 장의 스프라이트로 합칩니다.

import { resolveCharacterStyle } from "./characterStyle";

export const GUEST_CELL_TONES = {
  h: "hair",
  H: "hair-light",
  f: "skin",
  F: "skin-shadow",
  t: "shirt",
  T: "shirt-dark",
  e: "eye",
  r: "blush",
  m: "mouth",
};

const SPRITE_SIZE = 24;

function createGrid() {
  return Array.from({ length: SPRITE_SIZE }, () =>
    new Array(SPRITE_SIZE).fill(".")
  );
}

// [y, [[시작 열, "문자들"], ...]] 형태의 레이어를 격자에 찍습니다.
// clipFrom 을 주면 그 행부터는 몸 실루엣 밖으로 삐져나오는 픽셀을 버립니다. (체형이 좁을 때 옷이 떠 보이지 않게)
function paintLayer(grid, layer, clipFrom) {
  layer.forEach(([y, runs]) => {
    const row = grid[y];

    if (!row) {
      return;
    }

    const shouldClip = clipFrom !== undefined && y >= clipFrom;

    runs.forEach(([start, chars]) => {
      [...chars].forEach((cell, index) => {
        const x = start + index;

        if (cell === "." || row[x] === undefined) {
          return;
        }

        if (shouldClip && row[x] === ".") {
          return;
        }

        row[x] = cell;
      });
    });
  });
}

// 체형이 좁아 옷이 잘린 줄은 바깥 칸을 어두운 톤으로 바꿔 실루엣 테두리를 되살립니다.
function restoreOutfitEdge(grid, bodyLayer) {
  const spans = new Map();

  bodyLayer.forEach(([y, runs]) => {
    runs.forEach(([start, chars]) => {
      const width = [...chars].length;
      const span = spans.get(y) || { left: Infinity, right: -Infinity };

      span.left = Math.min(span.left, start);
      span.right = Math.max(span.right, start + width - 1);
      spans.set(y, span);
    });
  });

  spans.forEach(({ left, right }, y) => {
    const row = grid[y];

    if (!row) {
      return;
    }

    if (row[left] === "t") {
      row[left] = "T";
    }

    if (row[right] === "t") {
      row[right] = "T";
    }
  });
}

// 위/아래가 어두운 테두리인 옷 한 줄
function band(y, start, end, tone = "t", edge = "T") {
  const width = end - start + 1;
  const inner = Math.max(width - 2, 0);
  const chars = `${edge}${tone.repeat(inner)}${edge}`;

  return [y, [[start, chars.slice(0, width)]]];
}

function solid(y, start, end, tone) {
  return [y, [[start, tone.repeat(end - start + 1)]]];
}

// 얼굴: 이마(5~7) · 볼(8) · 입(9) · 턱(10) · 목(11)
const FACE = [
  [5, [[7, "ffffffffff"]]],
  [6, [[7, "ffffffffff"]]],
  [7, [[7, "ffffffffff"]]],
  [8, [[7, "rrffffffrr"]]],
  [9, [[7, "ffffmmffff"]]],
  [10, [[8, "ffffffff"]]],
  [11, [[10, "fFFf"]]],
];

// 앉은 자세라 무릎 아래는 가구가 가립니다. 성별·체형은 어깨/허리/골반 실루엣으로 구분합니다.
// 값은 12~20행의 몸통 너비(px)이며 짝수라서 좌우 대칭입니다.
const BODY_WIDTHS = {
  female: {
    slim: [12, 14, 14, 14, 14, 12, 12, 14, 12],
    normal: [14, 16, 16, 16, 16, 14, 14, 16, 14],
    curvy: [14, 16, 16, 16, 16, 14, 14, 18, 16],
    petite: [14, 14, 12, 12, 12, 12, 12, 12, 12],
  },
  male: {
    slim: [12, 14, 14, 14, 14, 14, 12, 12, 10],
    normal: [16, 16, 16, 18, 18, 18, 14, 12, 10],
    muscle: [16, 18, 18, 18, 16, 14, 12, 12, 10],
    sturdy: [16, 16, 18, 18, 18, 18, 16, 16, 14],
  },
};

function torsoRow(y, width) {
  const half = width / 2;

  return solid(y, 12 - half, 11 + half, "f");
}

function buildBody(widths) {
  return [
    ...FACE,
    ...widths.map((width, index) => torsoRow(12 + index, width)),
  ];
}

export const GUEST_BODIES = Object.fromEntries(
  Object.entries(BODY_WIDTHS).map(([gender, widthsByBody]) => [
    gender,
    Object.fromEntries(
      Object.entries(widthsByBody).map(([body, widths]) => [
        body,
        buildBody(widths),
      ])
    ),
  ])
);

export const GUEST_DEFAULT_BODY = {
  female: Object.keys(BODY_WIDTHS.female)[1],
  male: Object.keys(BODY_WIDTHS.male)[1],
};

const HEAD_HAIR = [
  [1, [[8, "hhhhhhhh"]]],
  [2, [[6, "hhhhhhhhhhhh"]]],
  [3, [[5, "hHhhhhhhhhhhHh"]]],
  [4, [[5, "hhhhhhhhhhhhhh"]]],
  [
    5,
    [
      [5, "hh"],
      [17, "hh"],
    ],
  ],
  [
    6,
    [
      [5, "hh"],
      [17, "hh"],
    ],
  ],
  [
    7,
    [
      [5, "hh"],
      [17, "hh"],
    ],
  ],
  [
    8,
    [
      [5, "hh"],
      [17, "hh"],
    ],
  ],
  [
    9,
    [
      [5, "hh"],
      [17, "hh"],
    ],
  ],
  [
    10,
    [
      [6, "h"],
      [17, "h"],
    ],
  ],
];

export const GUEST_HAIRSTYLES = {
  long: [
    ...HEAD_HAIR,
    [
      11,
      [
        [6, "hh"],
        [16, "hh"],
      ],
    ],
    [
      12,
      [
        [5, "hh"],
        [17, "hh"],
      ],
    ],
    [
      13,
      [
        [5, "hh"],
        [17, "hh"],
      ],
    ],
    [
      14,
      [
        [4, "hh"],
        [18, "hh"],
      ],
    ],
    [
      15,
      [
        [4, "hh"],
        [18, "hh"],
      ],
    ],
    [
      16,
      [
        [4, "h"],
        [19, "h"],
      ],
    ],
  ],
  short: HEAD_HAIR,
  bob: [
    ...HEAD_HAIR,
    [
      11,
      [
        [6, "hh"],
        [16, "hh"],
      ],
    ],
    [
      12,
      [
        [6, "h"],
        [17, "h"],
      ],
    ],
    [
      13,
      [
        [6, "h"],
        [17, "h"],
      ],
    ],
  ],
  ponytail: [
    ...HEAD_HAIR,
    [6, [[19, "hh"]]],
    [7, [[19, "hh"]]],
    [8, [[19, "hh"]]],
    [9, [[19, "hh"]]],
    [10, [[18, "hh"]]],
    [11, [[18, "hhH"]]],
    [12, [[18, "hh"]]],
    [13, [[19, "hh"]]],
    [14, [[19, "h"]]],
  ],
  bun: [[0, [[9, "hhhhhh"]]], ...HEAD_HAIR],
};

// 눈은 얼굴 위에 찍습니다. (왼쪽 9~10, 오른쪽 13~14)
export const GUEST_EYES = {
  round: [
    [
      6,
      [
        [9, "ee"],
        [13, "ee"],
      ],
    ],
    [
      7,
      [
        [9, "ee"],
        [13, "ee"],
      ],
    ],
  ],
  smile: [
    [
      7,
      [
        [9, "ee"],
        [13, "ee"],
      ],
    ],
  ],
  wink: [
    [
      6,
      [
        [9, "ee"],
        [13, "ee"],
      ],
    ],
    [7, [[9, "ee"]]],
  ],
  heart: [
    [
      6,
      [
        [9, "r"],
        [13, "r"],
      ],
    ],
    [
      7,
      [
        [9, "rr"],
        [13, "rr"],
      ],
    ],
  ],
  shades: [
    [6, [[9, "eeeeee"]]],
    [
      7,
      [
        [9, "ee"],
        [13, "ee"],
      ],
    ],
  ],
};

export const GUEST_OUTFITS = {
  tee: [
    band(12, 5, 18),
    band(13, 4, 19),
    band(14, 5, 18),
    band(15, 5, 18),
    band(16, 5, 18),
    band(17, 5, 18),
    band(18, 5, 18),
    band(19, 6, 17),
    solid(20, 7, 16, "T"),
  ],
  shirt: [
    band(12, 5, 18),
    band(13, 3, 20),
    band(14, 3, 20),
    band(15, 3, 20),
    band(16, 3, 20),
    band(17, 4, 19),
    band(18, 5, 18),
    band(19, 6, 17),
    solid(20, 7, 16, "T"),
    [12, [[11, "TT"]]],
    [13, [[11, "T"]]],
    [14, [[11, "T"]]],
    [15, [[11, "T"]]],
    [16, [[11, "T"]]],
    [17, [[11, "T"]]],
    [18, [[11, "T"]]],
  ],
  hoodie: [
    [
      11,
      [
        [8, "tt"],
        [14, "tt"],
      ],
    ],
    [
      10,
      [
        [7, "t"],
        [16, "t"],
      ],
    ],
    band(12, 4, 19),
    band(13, 3, 20),
    band(14, 3, 20),
    band(15, 4, 19),
    band(16, 4, 19),
    band(17, 4, 19),
    band(18, 5, 18),
    band(19, 6, 17),
    solid(20, 7, 16, "T"),
    [16, [[9, "TTTTTT"]]],
    [17, [[9, "TTTTTT"]]],
  ],
  knit: [
    band(12, 5, 18),
    band(13, 3, 20),
    band(14, 3, 20),
    band(15, 3, 20),
    band(16, 3, 20),
    band(17, 3, 20),
    band(18, 5, 18),
    [19, [[6, "tTtTtTtTtTtT"]]],
    [20, [[7, "TtTtTtTtTt"]]],
  ],
  slip: [
    [
      12,
      [
        [7, "TT"],
        [13, "TT"],
      ],
    ],
    band(13, 6, 17),
    band(14, 5, 18),
    band(15, 5, 18),
    band(16, 5, 18),
    band(17, 5, 18),
    band(18, 5, 18),
    band(19, 6, 17),
    solid(20, 7, 16, "T"),
  ],
  dress: [
    [
      12,
      [
        [7, "TT"],
        [13, "TT"],
      ],
    ],
    band(13, 6, 17),
    band(14, 5, 18),
    band(15, 5, 18),
    band(16, 5, 18),
    band(17, 4, 19),
    band(18, 3, 20),
    band(19, 4, 19),
    solid(20, 5, 18, "T"),
  ],
};

// 같은 톤이 가로로 이어지는 칸을 한 줄(path)로 묶어 SVG를 가볍게 그립니다.
export function buildSpritePaths(rows, toneMap) {
  const segmentsByTone = new Map();

  rows.forEach((row, y) => {
    let x = 0;

    while (x < row.length) {
      const tone = toneMap[row[x]];

      if (!tone) {
        x += 1;
        continue;
      }

      let end = x + 1;

      while (end < row.length && toneMap[row[end]] === tone) {
        end += 1;
      }

      const width = end - x;
      const segments = segmentsByTone.get(tone) || [];

      segments.push(`M${x} ${y}h${width}v1h-${width}z`);
      segmentsByTone.set(tone, segments);
      x = end;
    }
  });

  return [...segmentsByTone].map(([tone, segments]) => ({
    tone,
    d: segments.join(""),
  }));
}

export function composeGuestSprite(value, tableNumber) {
  const style = resolveCharacterStyle(value, tableNumber);
  const bodySet = GUEST_BODIES[style.gender] || GUEST_BODIES.female;
  const body = bodySet[style.body] || bodySet[GUEST_DEFAULT_BODY.female];
  const outfit = GUEST_OUTFITS[style.outfit] || GUEST_OUTFITS.tee;
  const hair = GUEST_HAIRSTYLES[style.hairstyle] || GUEST_HAIRSTYLES.long;
  const eyes = GUEST_EYES[style.eyes] || GUEST_EYES.round;
  const grid = createGrid();

  paintLayer(grid, body);
  paintLayer(grid, outfit, 12);
  restoreOutfitEdge(grid, body);
  paintLayer(grid, hair, 12);
  paintLayer(grid, eyes);

  return grid.map((row) => row.join(""));
}

const partsCache = new Map();

export function buildGuestParts(value, tableNumber) {
  const style = resolveCharacterStyle(value, tableNumber);
  const cacheKey = Object.values(style).join("|");
  const cached = partsCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const parts = buildSpritePaths(composeGuestSprite(style), GUEST_CELL_TONES);

  partsCache.set(cacheKey, parts);

  return parts;
}

// 직원 캐릭터는 색을 CSS 변수로 덮어쓰기 때문에 모양만 고정해 둡니다.
export const STAFF_CHARACTER_STYLE = {
  gender: "male",
  body: "normal",
  skin: "warm",
  hairstyle: "short",
  hair: "ink",
  eyes: "round",
  outfit: "shirt",
  shirt: "lime",
};

export const STAFF_PARTS = buildGuestParts(STAFF_CHARACTER_STYLE);
