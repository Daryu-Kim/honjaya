// 32x32 pixel guest sprite. The TV scene and the guest style editor share this module.
// Layers are stacked in order: body (gender + build) -> outfit -> hair -> eyes.

import { resolveCharacterStyle } from "./characterStyle";

export const GUEST_SPRITE_SIZE = 32;

// Ready to use as an SVG viewBox attribute.
export const GUEST_SPRITE_VIEW_BOX = `0 0 ${GUEST_SPRITE_SIZE} ${GUEST_SPRITE_SIZE}`;

export const GUEST_CELL_TONES = {
  h: "hair",
  H: "hair-light",
  f: "skin",
  F: "skin-shadow",
  S: "skin-light",
  t: "shirt",
  T: "shirt-dark",
  e: "eye",
  E: "eye-light",
  r: "blush",
  m: "mouth",
};

const SIZE = GUEST_SPRITE_SIZE;
const CENTER = SIZE / 2;
const HEAD_WIDTH = 12;
const NECK_ROW = 14;
const SHOULDER_ROW = 16;

function createGrid() {
  return Array.from({ length: SIZE }, () => new Array(SIZE).fill("."));
}

function range(from, to) {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

// Paints [y, [[startColumn, "chars"], ...]] entries onto the grid.
// When clip is given, every pixel must stay inside that row's body span.
function paintLayer(grid, layer, clip = null, margin = 0) {
  layer.forEach(([y, runs]) => {
    const row = grid[y];

    if (!row) {
      return;
    }

    const span = clip ? clip.get(y) : null;

    runs.forEach(([start, chars]) => {
      [...chars].forEach((cell, index) => {
        const x = start + index;

        if (cell === "." || row[x] === undefined) {
          return;
        }

        if (span && (x < span.left - margin || x > span.right + margin)) {
          return;
        }

        row[x] = cell;
      });
    });
  });
}

function buildSpanMap(layer) {
  const spans = new Map();

  layer.forEach(([y, runs]) => {
    runs.forEach(([start, chars]) => {
      const width = [...chars].length;

      if (width === 0) {
        return;
      }

      const span = spans.get(y);

      if (!span) {
        spans.set(y, { left: start, right: start + width - 1 });
        return;
      }

      span.left = Math.min(span.left, start);
      span.right = Math.max(span.right, start + width - 1);
    });
  });

  return spans;
}

function solidRow(y, left, right, tone) {
  if (right < left) {
    return [y, []];
  }

  return [y, [[left, tone.repeat(right - left + 1)]]];
}

// Centered row of an even width, with optional extra runs painted on top.
function centeredRow(y, width, tone, accents = []) {
  return [y, [[CENTER - width / 2, tone.repeat(width)], ...accents]];
}

// Paints the same run on both sides so every layer stays symmetric.
function mirrorRow(y, left, chars) {
  const width = [...chars].length;

  return [
    y,
    [
      [left, chars],
      [SIZE - left - width, [...chars].reverse().join("")],
    ],
  ];
}

// Row with a darker outline on both ends.
function edgedRow(y, left, right, tone = "t", edge = "T") {
  const width = right - left + 1;

  if (width <= 0) {
    return [y, []];
  }

  if (width <= 2) {
    return [y, [[left, edge.repeat(width)]]];
  }

  return [y, [[left, `${edge}${tone.repeat(width - 2)}${edge}`]]];
}

function verticalBar(fromY, toY, left, right, tone) {
  return range(fromY, toY).map((y) => solidRow(y, left, right, tone));
}

// 16..31 row widths. Even widths keep the silhouette centered; rows below 20 sit
// behind the seat furniture on the TV scene, so detail belongs to the upper chest.
const BODY_WIDTHS = {
  female: {
    slim: [10, 12, 12, 12, 12, 12, 10, 10, 10, 12, 12, 14, 14, 14, 14, 12],
    normal: [12, 14, 14, 14, 14, 14, 12, 12, 12, 14, 14, 16, 16, 16, 16, 14],
    curvy: [12, 14, 16, 16, 16, 16, 12, 12, 12, 14, 16, 20, 20, 20, 20, 18],
    petite: [10, 10, 10, 12, 12, 12, 10, 10, 10, 10, 12, 12, 12, 12, 12, 10],
  },
  male: {
    slim: [14, 16, 14, 14, 14, 14, 12, 12, 12, 12, 12, 12, 12, 12, 12, 10],
    normal: [16, 18, 16, 16, 16, 16, 14, 14, 14, 14, 14, 14, 14, 14, 14, 12],
    muscle: [20, 22, 20, 20, 20, 18, 14, 14, 14, 14, 14, 14, 14, 14, 14, 12],
    sturdy: [18, 20, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 16],
  },
};

// Jaw and neck width per gender. Men get a wider jaw and a thicker neck.
const BODY_HEADS = {
  female: { chin: 8, neck: 4 },
  male: { chin: 10, neck: 6 },
};

const FACE = [
  centeredRow(2, 10, "f"),
  centeredRow(3, 10, "f"),
  ...range(4, 11).map((y) => centeredRow(y, HEAD_WIDTH, "f")),
  centeredRow(12, 10, "f"),
];

const EARS = range(8, 9).flatMap((y) => [
  solidRow(y, 9, 9, "f"),
  solidRow(y, 22, 22, "f"),
]);

// Barely visible skin shading plus the facial features the hair layer never covers.
const FACE_DETAILS = [
  ...range(5, 11).flatMap((y) => [
    solidRow(y, 10, 10, "F"),
    solidRow(y, 21, 21, "F"),
  ]),
  ...EARS,
  solidRow(12, 11, 11, "F"),
  solidRow(12, 20, 20, "F"),
  solidRow(7, 12, 13, "h"),
  solidRow(7, 18, 19, "h"),
  solidRow(10, 15, 15, "F"),
  solidRow(10, 11, 12, "r"),
  solidRow(10, 19, 20, "r"),
  solidRow(11, 15, 16, "m"),
];

function neckSpanOf(gender) {
  const width = BODY_HEADS[gender].neck;
  const left = CENTER - width / 2;

  return { left, right: left + width - 1 };
}

function buildBody(gender, body) {
  const widths = BODY_WIDTHS[gender][body];
  const head = BODY_HEADS[gender];
  const chinLeft = CENTER - head.chin / 2;
  const neck = neckSpanOf(gender);
  const torso = widths.map((width, index) => {
    const left = CENTER - width / 2;

    return edgedRow(SHOULDER_ROW + index, left, left + width - 1, "f", "F");
  });

  return [
    ...FACE,
    ...FACE_DETAILS,
    edgedRow(13, chinLeft, chinLeft + head.chin - 1, "f", "F"),
    edgedRow(NECK_ROW, neck.left, neck.right, "f", "F"),
    solidRow(NECK_ROW, 15, 16, "S"),
    edgedRow(15, neck.left, neck.right, "f", "F"),
    ...torso,
  ];
}

export const GUEST_BODIES = {
  female: {
    slim: buildBody("female", "slim"),
    normal: buildBody("female", "normal"),
    curvy: buildBody("female", "curvy"),
    petite: buildBody("female", "petite"),
  },
  male: {
    slim: buildBody("male", "slim"),
    normal: buildBody("male", "normal"),
    muscle: buildBody("male", "muscle"),
    sturdy: buildBody("male", "sturdy"),
  },
};

export const GUEST_DEFAULT_BODY = { female: "normal", male: "normal" };
// Shared cap every hairstyle inherits. Highlights keep the pixel art from reading flat.
const HAIR_CAP = [
  centeredRow(0, 6, "h"),
  centeredRow(1, 10, "h", [[12, "H"]]),
  centeredRow(2, 12, "h", [
    [11, "H"],
    [20, "H"],
  ]),
  centeredRow(3, 14, "h", [
    [9, "H"],
    [13, "H"],
    [18, "H"],
    [22, "H"],
  ]),
  centeredRow(4, 14, "h", [
    [10, "H"],
    [15, "H"],
    [21, "H"],
  ]),
];

const HAIR_SIDES = range(5, 8).map((y) => mirrorRow(y, 9, "h"));

export const GUEST_HAIRSTYLES = {
  // 긴 생머리: 어깨까지 흘러내립니다.
  long: [
    ...HAIR_CAP,
    ...range(5, 7).map((y) => mirrorRow(y, 9, "h")),
    ...range(8, 11).map((y) => mirrorRow(y, 8, "hH")),
    ...range(12, 13).map((y) => mirrorRow(y, 9, "hHh")),
    ...range(14, 15).map((y) => mirrorRow(y, 8, "hH")),
    ...range(16, 19).map((y) => mirrorRow(y, 8, "hh")),
    ...range(20, 24).map((y) => mirrorRow(y, 7, "hh")),
  ],
  // 짧은 머리: 귀가 드러납니다.
  short: [...HAIR_CAP, ...HAIR_SIDES],
  // 단발: 턱선까지 오는 일자 컷.
  bob: [
    ...HAIR_CAP,
    ...range(5, 7).map((y) => mirrorRow(y, 9, "h")),
    ...range(8, 11).map((y) => mirrorRow(y, 8, "hh")),
    ...range(12, 13).map((y) => mirrorRow(y, 9, "hHh")),
  ],
  // 묶은 머리: 오른쪽 뒤로 꼬리가 길게 빠집니다.
  ponytail: [
    ...HAIR_CAP,
    ...range(5, 9).map((y) => mirrorRow(y, 9, "h")),
    [5, [[22, "hhh"]]],
    [6, [[22, "Hhh"]]],
    [7, [[22, "hhh"]]],
    [8, [[22, "Hhh"]]],
    [9, [[22, "hhh"]]],
    [10, [[22, "Hhh"]]],
    [11, [[22, "hhh"]]],
    [12, [[22, "Hhh"]]],
    [13, [[22, "hh"]]],
    [14, [[22, "hh"]]],
    [15, [[22, "Hh"]]],
  ],
  // 올림머리: 정수리 위 묶음.
  bun: [
    centeredRow(0, 6, "h", [[14, "H"]]),
    centeredRow(1, 8, "h", [
      [13, "H"],
      [18, "H"],
    ]),
    centeredRow(2, 12, "h"),
    centeredRow(3, 14, "h", [
      [9, "H"],
      [22, "H"],
    ]),
    centeredRow(4, 14, "h"),
    ...range(5, 7).map((y) => mirrorRow(y, 9, "h")),
  ],
  // 삭발: 짧은 머리선과 옆면 잔털만 남습니다.
  buzz: [
    centeredRow(2, 10, "h", [
      [11, "H"],
      [20, "H"],
    ]),
    centeredRow(3, 10, "h", [
      [13, "H"],
      [18, "H"],
    ]),
    [4, [[10, "HhHhHhHhHhHh"]]],
    ...range(5, 7).map((y) => mirrorRow(y, 9, "H")),
  ],
  // 투블럭: 위는 넓게 덮고 옆은 바싹 밀어냅니다.
  twoblock: [
    centeredRow(0, 8, "h"),
    centeredRow(1, 12, "h", [[12, "H"]]),
    centeredRow(2, 14, "h", [
      [10, "H"],
      [21, "H"],
    ]),
    centeredRow(3, 14, "h", [
      [13, "H"],
      [18, "H"],
    ]),
    centeredRow(4, 14, "h"),
    [5, [[9, "HhhhhhhhhhhhhH"]]],
    [6, [[10, "hhhhhhhhhhhh"]]],
    ...range(5, 7).map((y) => mirrorRow(y, 9, "H")),
  ],
  // 상륙돌격: 가운데만 남긴 짧은 스트립.
  landing: [
    centeredRow(2, 6, "h", [[14, "H"]]),
    centeredRow(3, 6, "h"),
    centeredRow(4, 6, "h", [[15, "H"]]),
    centeredRow(5, 4, "h"),
    ...range(5, 7).map((y) => mirrorRow(y, 9, "H")),
  ],
};

const EYE_LAYERS = {
  round: [
    [
      8,
      [
        [12, "Ee"],
        [18, "Ee"],
      ],
    ],
    [
      9,
      [
        [12, "ee"],
        [18, "ee"],
      ],
    ],
  ],
  smile: [
    [
      8,
      [
        [12, "ee"],
        [18, "ee"],
      ],
    ],
    [
      9,
      [
        [11, "e"],
        [14, "e"],
        [17, "e"],
        [20, "e"],
      ],
    ],
  ],
  wink: [
    [
      8,
      [
        [12, "Ee"],
        [17, "e"],
        [20, "e"],
      ],
    ],
    [
      9,
      [
        [12, "ee"],
        [18, "ee"],
      ],
    ],
  ],
  heart: [
    [
      8,
      [
        [11, "r.r"],
        [18, "r.r"],
      ],
    ],
    [
      9,
      [
        [11, "rrr"],
        [18, "rrr"],
      ],
    ],
    [
      10,
      [
        [12, "r"],
        [19, "r"],
      ],
    ],
  ],
  shades: [
    [8, [[10, "eEeeeeeeeeEe"]]],
    [
      9,
      [
        [10, "eeee"],
        [18, "eeee"],
      ],
    ],
  ],
};

// Women get one extra lash pixel per eye, which widens the visual gap between genders.
function buildEyes(eyes, gender) {
  const layer = EYE_LAYERS[eyes] || EYE_LAYERS.round;

  if (gender !== "female" || eyes === "shades") {
    return layer;
  }

  return [
    ...layer,
    [
      8,
      [
        [11, "e"],
        [20, "e"],
      ],
    ],
  ];
}
// Built from the body span map, so every outfit hugs the silhouette of the build.
function torsoOutfit({ spans, neck }, options = {}) {
  const {
    sleeveRows = 3,
    inset = 2,
    tone = "t",
    edge = "T",
    neckRows = 1,
    details = [],
  } = options;
  const rows = [];

  spans.forEach((span, y) => {
    if (y < SHOULDER_ROW) {
      return;
    }

    const pad = y < SHOULDER_ROW + sleeveRows ? 0 : inset;

    rows.push(edgedRow(y, span.left + pad, span.right - pad, tone, edge));
  });

  if (neck) {
    range(0, neckRows - 1).forEach((row) => {
      rows.push(solidRow(SHOULDER_ROW + row, neck.left, neck.right, "f"));
    });
  }

  return [...rows, ...details];
}

function ribbedRow(y, left, right) {
  const width = right - left + 1;

  if (width < 2) {
    return [y, []];
  }

  const chars = Array.from({ length: width }, (_, index) =>
    index % 2 === 0 ? "T" : "t"
  ).join("");

  return [y, [[left, chars]]];
}

const OUTFIT_BUILDERS = {
  // 반팔 티셔츠
  tee: (context) =>
    torsoOutfit(context, {
      sleeveRows: 3,
      inset: 2,
      details: [solidRow(19, 13, 14, "T"), solidRow(20, 13, 14, "T")],
    }),

  // 셔츠: 긴 소매, 카라, 단추 여밈
  shirt: (context) =>
    torsoOutfit(context, {
      sleeveRows: 16,
      inset: 0,
      details: [
        solidRow(SHOULDER_ROW, 14, 14, "T"),
        solidRow(SHOULDER_ROW, 17, 17, "T"),
        ...verticalBar(17, 31, 15, 16, "T"),
        solidRow(19, 15, 16, "E"),
        solidRow(23, 15, 16, "E"),
        solidRow(27, 15, 16, "E"),
      ],
    }),

  // 후디: 어깨를 감싸는 후드와 스트링
  hoodie: (context) =>
    torsoOutfit(context, {
      sleeveRows: 16,
      inset: 0,
      details: [
        solidRow(15, 12, 13, "t"),
        solidRow(15, 18, 19, "t"),
        solidRow(14, 13, 13, "T"),
        solidRow(14, 18, 18, "T"),
        solidRow(SHOULDER_ROW, 12, 19, "T"),
        ...verticalBar(17, 22, 14, 14, "T"),
        ...verticalBar(17, 22, 17, 17, "T"),
        solidRow(23, 12, 19, "T"),
      ],
    }),

  // 니트: 긴 소매에 세로 골지
  knit: (context) => {
    const rows = torsoOutfit(context, { sleeveRows: 16, inset: 0 });
    const ribs = [];

    context.spans.forEach((span, y) => {
      if (y >= SHOULDER_ROW + 2) {
        ribs.push(ribbedRow(y, span.left + 1, span.right - 1));
      }
    });

    return [...rows, ...ribs];
  },

  // 민소매: 어깨를 드러내고 가는 끈만 남깁니다.
  slip: (context) =>
    torsoOutfit(context, {
      sleeveRows: 0,
      inset: 3,
      neckRows: 2,
      details: [
        solidRow(15, 13, 14, "t"),
        solidRow(15, 17, 18, "t"),
        solidRow(SHOULDER_ROW, 13, 14, "t"),
        solidRow(SHOULDER_ROW, 17, 18, "t"),
      ],
    }),

  // 원피스: 민소매 상체에 허리 벨트와 퍼지는 스커트
  dress: (context) => {
    const rows = torsoOutfit(context, { sleeveRows: 0, inset: 3, neckRows: 2 });
    const skirt = [];

    context.spans.forEach((span, y) => {
      if (y < 22) {
        return;
      }

      const pad = y < 24 ? 2 : 0;

      skirt.push(
        y === 22
          ? solidRow(y, span.left + pad, span.right - pad, "T")
          : edgedRow(y, span.left + pad, span.right - pad)
      );
    });

    return [
      ...rows,
      solidRow(15, 13, 14, "t"),
      solidRow(15, 17, 18, "t"),
      ...skirt,
    ];
  },
};

function composeLayers(value, tableNumber) {
  const style = resolveCharacterStyle(value, tableNumber);
  const bodySet = GUEST_BODIES[style.gender] || GUEST_BODIES.female;
  const body = bodySet[style.body] || bodySet[GUEST_DEFAULT_BODY.female];
  const spans = buildSpanMap(body);
  const context = { spans, neck: neckSpanOf(style.gender) };
  const buildOutfit = OUTFIT_BUILDERS[style.outfit] || OUTFIT_BUILDERS.tee;
  const outfit = buildOutfit(context);
  const hair = GUEST_HAIRSTYLES[style.hairstyle] || GUEST_HAIRSTYLES.long;
  const eyes = buildEyes(style.eyes, style.gender);
  const grid = createGrid();
  // Hair only needs to follow the shoulders; around the neck it frames the face freely.
  const hairClip = new Map();

  spans.forEach((span, y) => {
    if (y >= SHOULDER_ROW) {
      hairClip.set(y, span);
    }
  });

  paintLayer(grid, body);
  paintLayer(grid, outfit);
  paintLayer(grid, hair, hairClip, 3);
  paintLayer(grid, eyes);

  return grid.map((row) => row.join(""));
}

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
  return composeLayers(value, tableNumber);
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
