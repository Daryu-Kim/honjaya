// 64x64 pixel guest sprite shared by the bar TV scene and the guest style editor.
// Layers stack bottom-up: body (gender + build) -> outfit -> face -> hair -> eyes.
// On the TV the seat furniture hides the legs, so silhouette detail is concentrated
// above the waist while the editor preview shows the whole figure.

import { resolveCharacterStyle } from "./characterStyle";

export const GUEST_SPRITE_SIZE = 64;

// Ready to use as an SVG viewBox attribute.
export const GUEST_SPRITE_VIEW_BOX = `0 0 ${GUEST_SPRITE_SIZE} ${GUEST_SPRITE_SIZE}`;

// The bar counter hides the lower body, so the staff figure only needs the bust.
export const STAFF_SPRITE_VIEW_BOX = `0 0 ${GUEST_SPRITE_SIZE} 44`;

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
  n: "shoes",
};

const SIZE = GUEST_SPRITE_SIZE;
const CENTER = SIZE / 2;
const HEAD_TOP = 4;
const BROW_ROW = 11;
const EYE_TOP = 14;
const NOSE_ROW = 20;
const MOUTH_ROW = 23;
const CHIN_ROW = 27;
const NECK_TOP = 28;
const SHOULDER_ROW = 32;
const CHEST_ROW = 37;
const WAIST_ROW = 43;
const HIP_ROW = 51;
const LEG_TOP = 54;
const LAST_ROW = SIZE - 1;

function createGrid() {
  return Array.from({ length: SIZE }, () => new Array(SIZE).fill("."));
}

function range(from, to) {
  return Array.from(
    { length: Math.max(0, to - from + 1) },
    (_, index) => from + index
  );
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

// Left run copied to the mirrored column, keeping the pattern readable as pixel art.
function mirrored(y, left, right, tone, edge = tone) {
  const width = right - left + 1;

  if (width <= 0) {
    return [y, []];
  }

  const chars =
    width > 2 ? `${edge}${tone.repeat(width - 2)}${edge}` : tone.repeat(width);

  return [
    y,
    [
      [left, chars],
      [SIZE - 1 - right, chars],
    ],
  ];
}

function verticalBar(fromY, toY, left, right, tone) {
  return range(fromY, toY).map((y) => solidRow(y, left, right, tone));
}

// Silhouette widths only change every few rows, so keypoints are interpolated to keep
// the body from reading as a straight tube. Even widths keep the sprite symmetric.
function evenWidth(value) {
  return Math.max(2, Math.round(value / 2) * 2);
}

function widthAt(profile, y) {
  if (y <= profile[0][0]) {
    return evenWidth(profile[0][1]);
  }

  for (let index = 1; index < profile.length; index += 1) {
    const [row, width] = profile[index];

    if (y <= row) {
      const [prevRow, prevWidth] = profile[index - 1];
      const ratio = row === prevRow ? 0 : (y - prevRow) / (row - prevRow);

      return evenWidth(prevWidth + (width - prevWidth) * ratio);
    }
  }

  return evenWidth(profile[profile.length - 1][1]);
}

// Jaw and neck width. Men get a square jaw and a thicker neck.
const HEAD_PROFILES = {
  female: [
    [HEAD_TOP, 12],
    [8, 20],
    [20, 20],
    [23, 16],
    [25, 12],
    [CHIN_ROW - 1, 12],
    [CHIN_ROW, 10],
  ],
  male: [
    [HEAD_TOP, 14],
    [8, 22],
    [21, 22],
    [24, 18],
    [26, 14],
    [CHIN_ROW, 12],
  ],
};

const NECK_WIDTH = { female: 6, male: 8 };

// shoulder / chest / waist / hip are torso widths without the arms.
const BODY_SPECS = {
  female: {
    slim: { shoulder: 18, chest: 18, waist: 14, hip: 18, arm: 4 },
    normal: { shoulder: 20, chest: 20, waist: 16, hip: 22, arm: 4 },
    curvy: { shoulder: 22, chest: 22, waist: 16, hip: 28, arm: 4 },
    petite: { shoulder: 16, chest: 16, waist: 12, hip: 18, arm: 3 },
  },
  male: {
    slim: { shoulder: 22, chest: 20, waist: 18, hip: 20, arm: 4 },
    normal: { shoulder: 26, chest: 24, waist: 20, hip: 24, arm: 5 },
    muscle: { shoulder: 32, chest: 30, waist: 22, hip: 26, arm: 6 },
    sturdy: { shoulder: 28, chest: 28, waist: 26, hip: 28, arm: 5 },
  },
};

// 연령대는 실루엣(어깨·허리)과 얼굴 주름, 머리카락 광택량으로만 드러냅니다.
const AGE_BUILD = {
  youth: { shoulder: 0, waist: 0, creases: 0, shine: 3 },
  middle: { shoulder: 2, waist: 2, creases: 1, shine: 2 },
  senior: { shoulder: -2, waist: 4, creases: 2, shine: 1 },
};

function buildSkeleton(gender, bodyId, age) {
  const genderKey = BODY_SPECS[gender] ? gender : "female";
  const specSet = BODY_SPECS[genderKey];
  const baseSpec = specSet[bodyId] || specSet.normal;
  const ageKey = AGE_BUILD[age] ? age : "youth";
  const ageConfig = AGE_BUILD[ageKey];
  const spec = {
    ...baseSpec,
    shoulder: baseSpec.shoulder + ageConfig.shoulder,
    waist: baseSpec.waist + ageConfig.waist,
  };
  const headProfile = HEAD_PROFILES[genderKey];

  const head = range(HEAD_TOP, CHIN_ROW).map((y) => {
    const width = widthAt(headProfile, y);
    const left = CENTER - width / 2;

    return { y, width, left, right: left + width - 1 };
  });
  const headByRow = new Map(head.map((row) => [row.y, row]));

  const neckWidth = NECK_WIDTH[genderKey];
  const neck = {
    left: CENTER - neckWidth / 2,
    right: CENTER + neckWidth / 2 - 1,
  };

  const torsoProfile = [
    [SHOULDER_ROW + 2, spec.shoulder],
    [CHEST_ROW, spec.chest],
    [WAIST_ROW, spec.waist],
    [HIP_ROW - 4, evenWidth((spec.waist + spec.hip) / 2)],
    [HIP_ROW, spec.hip],
    [LEG_TOP - 1, spec.hip - 2],
  ];
  const torso = range(SHOULDER_ROW + 2, LEG_TOP - 1).map((y) => {
    const width = widthAt(torsoProfile, y);
    const left = CENTER - width / 2;

    return { y, width, left, right: left + width - 1 };
  });
  const torsoByRow = new Map(torso.map((row) => [row.y, row]));

  const armFrame = 2 * (spec.arm + 1);
  const shoulders = [SHOULDER_ROW, SHOULDER_ROW + 1].map((y) => {
    const trim = y === SHOULDER_ROW ? 8 : 3;
    const width = evenWidth(spec.shoulder + armFrame - trim);
    const left = CENTER - width / 2;

    return { y, width, left, right: left + width - 1 };
  });

  const arms = range(SHOULDER_ROW + 2, 46).map((y) => {
    const torsoRow = torsoByRow.get(Math.min(y, LEG_TOP - 1));
    const right = torsoRow.left - 2;

    return { y, left: right - spec.arm + 1, right };
  });
  const wrist = arms[arms.length - 1];
  const hands = range(47, 49).map((y, index) => {
    const width = spec.arm + (index < 2 ? 1 : 0);

    return { y, left: wrist.right - width + 1, right: wrist.right };
  });

  const legGap = 2;
  const legWidth = evenWidth(spec.hip / 3);
  const legPair = (y, width, extra = 0) => {
    const leftWidth = width + extra;
    const startLeft = CENTER - legGap / 2 - leftWidth;
    const startRight = CENTER + legGap / 2;

    return [
      { y, left: startLeft, right: startLeft + leftWidth - 1 },
      { y, left: startRight, right: startRight + leftWidth - 1 },
    ];
  };
  const legs = range(LEG_TOP, LAST_ROW).flatMap((y) =>
    legPair(y, Math.max(4, legWidth - (y >= 60 ? 2 : 0)))
  );
  const shoes = range(61, LAST_ROW).flatMap((y) =>
    legPair(y, Math.max(4, legWidth - 2), 2)
  );

  const silhouette = new Map();
  const addSpan = (span) => {
    const existing = silhouette.get(span.y);

    silhouette.set(
      span.y,
      existing
        ? {
            left: Math.min(existing.left, span.left),
            right: Math.max(existing.right, span.right),
          }
        : { left: span.left, right: span.right }
    );
  };

  head.forEach(addSpan);
  torso.forEach(addSpan);
  legs.forEach(addSpan);

  return {
    gender: genderKey,
    age: ageKey,
    ageConfig,
    spec,
    head,
    headByRow,
    neck,
    shoulders,
    torso,
    torsoByRow,
    arms,
    hands,
    legs,
    shoes,
    silhouette,
  };
}

function buildBodyLayer(skeleton) {
  const { head, headByRow, neck, torso, arms, hands, legs, shoes } = skeleton;
  const rows = [];

  legs.forEach(({ y, left, right }) =>
    rows.push(edgedRow(y, left, right, "f", "F"))
  );
  shoes.forEach(({ y, left, right }) =>
    rows.push(solidRow(y, left, right, "n"))
  );
  shoes
    .filter(({ y }) => y === LAST_ROW)
    .forEach(({ y, left, right }) => rows.push(solidRow(y, left, right, "e")));

  torso.forEach(({ y, left, right }) =>
    rows.push(edgedRow(y, left, right, "f", "F"))
  );
  arms.forEach(({ y, left, right }) =>
    rows.push(edgedRow(y, left, right, "f", "F"))
  );
  hands.forEach(({ y, left, right }) =>
    rows.push(mirrored(y, left, right, "f", "F"))
  );

  head.forEach(({ y, left, right }) =>
    rows.push(
      y < 20
        ? solidRow(y, left, right, "f")
        : edgedRow(y, left, right, "f", "F")
    )
  );

  const earRow = headByRow.get(16);
  range(15, 18).forEach((y) => {
    const row = headByRow.get(y) || earRow;

    rows.push(mirrored(y, row.left - 1, row.left - 1, y === 18 ? "F" : "f"));
  });

  rows.push(solidRow(NECK_TOP, neck.left, neck.right, "F"));
  range(NECK_TOP + 1, SHOULDER_ROW - 1).forEach((y) => {
    rows.push(edgedRow(y, neck.left, neck.right, "f", "F"));
  });
  rows.push(solidRow(NECK_TOP + 2, CENTER - 1, CENTER, "S"));

  return rows;
}

export const GUEST_DEFAULT_BODY = { female: "normal", male: "normal" };

// Neckline opening: skin shows through the collar and a shadow line closes it off.
function collarRows(skeleton, depth = 2) {
  const { neck } = skeleton;
  const rows = [];

  range(0, depth).forEach((step) => {
    const pad = Math.max(0, 1 - step);

    rows.push(
      solidRow(
        SHOULDER_ROW + step,
        neck.left - pad - 1,
        neck.right + pad + 1,
        "f"
      )
    );
  });
  rows.push(solidRow(SHOULDER_ROW + depth + 1, neck.left, neck.right, "F"));

  return rows;
}

function hemRows(skeleton, rowsToPaint, tone = "T") {
  return rowsToPaint
    .map((y) => skeleton.torsoByRow.get(y))
    .filter(Boolean)
    .map(({ y, left, right }) => solidRow(y, left, right, tone));
}

// Torso + sleeves in one pass. Sleeves stop at sleeveEnd so the forearms stay bare.
function sleeveOutfit(skeleton, options = {}) {
  const {
    sleeveEnd = 39,
    shoulders = true,
    sleevelessPad = 0,
    cuff = true,
    tone = "t",
    edge = "T",
  } = options;
  const rows = [];

  if (shoulders) {
    skeleton.shoulders.forEach(({ y, left, right }) =>
      rows.push(
        edgedRow(y, left + sleevelessPad, right - sleevelessPad, tone, edge)
      )
    );
  } else {
    skeleton.shoulders.forEach(({ y, left, right }) =>
      rows.push(
        edgedRow(y, left + sleevelessPad, right - sleevelessPad, "f", "F")
      )
    );
  }

  skeleton.torso.forEach(({ y, left, right }) =>
    rows.push(edgedRow(y, left, right, tone, edge))
  );

  skeleton.arms.forEach(({ y, left, right }) => {
    if (y <= sleeveEnd) {
      // A single outline keeps the sleeve reading as part of the shirt.
      rows.push(mirrored(y, left, right, tone, tone));
      rows.push(mirrored(y, left, left, edge));
      rows.push(mirrored(y, right + 1, right + 1, edge));

      if (cuff && y === sleeveEnd) {
        rows.push(mirrored(y, left, right, edge, edge));
      }

      return;
    }

    rows.push(mirrored(y, left, right, "f", "F"));
    rows.push(mirrored(y, right + 1, right + 1, "F"));
  });

  return rows;
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

function strapRows(skeleton) {
  const { neck } = skeleton;

  return range(SHOULDER_ROW, SHOULDER_ROW + 1).map((y) =>
    edgedRow(y, neck.left - 4, neck.right + 3, "t", "T")
  );
}

const OUTFIT_BUILDERS = {
  // 반팔 티셔츠: 크루넥에 밑단 배색
  tee: (skeleton) => [
    ...sleeveOutfit(skeleton, { sleeveEnd: 39 }),
    ...collarRows(skeleton, 2),
    ...hemRows(skeleton, [52, 53]),
  ],

  // 셔츠: V 카라, 단추 여밈, 긴 소매 커프스
  shirt: (skeleton) => {
    const { neck } = skeleton;
    const details = [
      solidRow(SHOULDER_ROW + 1, neck.left - 2, neck.right + 2, "f"),
      solidRow(SHOULDER_ROW + 1, neck.left - 3, neck.left - 3, "T"),
      solidRow(SHOULDER_ROW + 1, neck.right + 3, neck.right + 3, "T"),
      solidRow(SHOULDER_ROW + 2, neck.left - 1, neck.right + 1, "f"),
      solidRow(SHOULDER_ROW + 2, neck.left - 2, neck.left - 2, "T"),
      solidRow(SHOULDER_ROW + 2, neck.right + 2, neck.right + 2, "T"),
      solidRow(SHOULDER_ROW + 3, neck.left, neck.right, "f"),
      solidRow(SHOULDER_ROW + 3, neck.left - 1, neck.left - 1, "T"),
      solidRow(SHOULDER_ROW + 3, neck.right + 1, neck.right + 1, "T"),
      ...verticalBar(SHOULDER_ROW + 4, LEG_TOP - 2, CENTER - 1, CENTER, "T"),
      ...range(0, 2).map((index) =>
        solidRow(38 + index * 6, CENTER - 1, CENTER, "E")
      ),
    ];

    return [...sleeveOutfit(skeleton, { sleeveEnd: 46 }), ...details];
  },

  // 후디: 넉넉한 후드와 스트링, 캥거루 포켓
  hoodie: (skeleton) => {
    const { neck } = skeleton;
    const details = [
      ...range(SHOULDER_ROW, SHOULDER_ROW + 1).map((y) =>
        solidRow(y, neck.left - 4, neck.right + 4, "T")
      ),
      solidRow(SHOULDER_ROW, neck.left - 2, neck.right + 2, "f"),
      solidRow(SHOULDER_ROW + 1, neck.left - 1, neck.right + 1, "f"),
      solidRow(SHOULDER_ROW + 2, neck.left, neck.right, "f"),
      ...verticalBar(
        SHOULDER_ROW + 4,
        SHOULDER_ROW + 9,
        neck.left - 3,
        neck.left - 3,
        "E"
      ),
      ...verticalBar(
        SHOULDER_ROW + 4,
        SHOULDER_ROW + 9,
        neck.right + 3,
        neck.right + 3,
        "E"
      ),
    ];
    const pocket = range(46, 51).map((y) =>
      y === 46 || y === 51
        ? solidRow(y, 26, 37, "T")
        : edgedRow(y, 26, 37, "t", "T")
    );

    return [
      ...sleeveOutfit(skeleton, { sleeveEnd: 46 }),
      ...details,
      ...pocket,
      ...hemRows(skeleton, [52, 53]),
    ];
  },

  // 니트: 깃과 밑단에만 세로 골지를 넣고 소매는 시보리로 마감합니다.
  knit: (skeleton) => [
    ...sleeveOutfit(skeleton, { sleeveEnd: 46 }),
    ...collarRows(skeleton, 1),
    ...range(SHOULDER_ROW + 3, SHOULDER_ROW + 6)
      .map((y) => skeleton.torsoByRow.get(y))
      .filter(Boolean)
      .map(({ y, left, right }) => ribbedRow(y, left + 1, right - 1)),
    ...range(50, 53)
      .map((y) => skeleton.torsoByRow.get(y))
      .filter(Boolean)
      .map(({ y, left, right }) => ribbedRow(y, left, right)),
    ...range(44, 46).flatMap((y) => {
      const arm = skeleton.arms.find((row) => row.y === y);

      return arm ? [mirrored(y, arm.left, arm.right, "T", "t")] : [];
    }),
  ],

  // 민소매: 어깨를 드러내고 가는 끈만 남깁니다.
  slip: (skeleton) => [
    ...sleeveOutfit(skeleton, {
      sleeveEnd: SHOULDER_ROW + 1,
      shoulders: false,
    }),
    ...strapRows(skeleton),
    solidRow(
      SHOULDER_ROW + 2,
      skeleton.neck.left - 1,
      skeleton.neck.right + 1,
      "f"
    ),
  ],

  // 원피스: 민소매 상체에 허리 벨트와 퍼지는 스커트
  dress: (skeleton) => {
    const { spec, neck } = skeleton;
    const skirtFrom = WAIST_ROW + 1;
    const skirtTo = 58;
    const skirt = range(skirtFrom, skirtTo).map((y) => {
      const ratio = (y - skirtFrom) / (skirtTo - skirtFrom);
      const top = spec.waist + 2;
      const hem = spec.hip + 8;
      const width = evenWidth(top + ratio * (hem - top));
      const left = CENTER - width / 2;

      return edgedRow(y, left, left + width - 1);
    });
    const pleats = range(skirtFrom + 2, skirtTo - 2)
      .filter((y) => y % 4 === 0)
      .flatMap((y) => [
        solidRow(y, CENTER - 5, CENTER - 5, "T"),
        solidRow(y, CENTER + 4, CENTER + 4, "T"),
      ]);

    return [
      ...sleeveOutfit(skeleton, {
        sleeveEnd: SHOULDER_ROW + 1,
        shoulders: false,
      }),
      ...strapRows(skeleton),
      solidRow(SHOULDER_ROW + 2, neck.left - 1, neck.right + 1, "f"),
      solidRow(
        WAIST_ROW,
        CENTER - spec.waist / 2 + 1,
        CENTER + spec.waist / 2 - 2,
        "T"
      ),
      ...skirt,
      ...pleats,
    ];
  },
};

const FACE_EYE_LEFT = CENTER - 7;

// 둥근 눈은 흰자 없이 어두운 알갱이 + 바깥쪽 하이라이트로 그립니다.
// 십자(+) 모양으로 겹치면 눈이 아니라 점처럼 보이므로 위아래를 둥글게 깎습니다.
const EYE_SHAPES = {
  round: [".eee.", "Eeeee", "eeeee", ".eee."],
  smile: [".....", ".eee.", "e...e"],
  heart: [".m.m.", "mmmmm", ".mmm.", "..m.."],
};

// 눈 모양에 맞춰 입매도 함께 바뀌어 표정이 어색하지 않게 합니다.
const MOUTH_SHAPES = {
  soft: [
    [
      MOUTH_ROW - 1,
      [
        [CENTER - 3, "m"],
        [CENTER + 2, "m"],
      ],
    ],
    [MOUTH_ROW, [[CENTER - 2, "mmmm"]]],
  ],
  grin: [
    [
      MOUTH_ROW - 1,
      [
        [CENTER - 4, "m"],
        [CENTER + 3, "m"],
      ],
    ],
    [MOUTH_ROW, [[CENTER - 3, "mmmmmm"]]],
  ],
  flat: [[MOUTH_ROW, [[CENTER - 2, "mmmm"]]]],
};

// 여성은 가는 눈썹, 남성은 두껍고 각진 눈썹. 눈(EYE_TOP)과 한 줄 띄워 붙지 않게 합니다.
function buildBrows(gender) {
  const left = FACE_EYE_LEFT;
  const male = gender === "male";
  const width = male ? 5 : 4;
  const start = male ? left : left + 1;
  const rows = [mirrored(BROW_ROW + 1, start, start + width - 1, "h")];

  if (male) {
    rows.push(mirrored(BROW_ROW, start + 1, start + width - 2, "h"));
  }

  return rows;
}

function buildMouth(eyes) {
  if (eyes === "heart") return MOUTH_SHAPES.grin;
  if (eyes === "shades") return MOUTH_SHAPES.flat;

  return MOUTH_SHAPES.soft;
}

// 눈 밑 그늘과 팔자주름으로 연령대를 표현합니다.
function buildAgeMarks(creases) {
  if (creases <= 0) return [];

  const marks = [
    mirrored(EYE_TOP + 4, FACE_EYE_LEFT + 1, FACE_EYE_LEFT + 2, "F"),
  ];

  if (creases >= 2) {
    marks.push(
      mirrored(EYE_TOP + 5, FACE_EYE_LEFT + 2, FACE_EYE_LEFT + 3, "F")
    );
    marks.push(mirrored(MOUTH_ROW - 1, CENTER - 5, CENTER - 5, "F"));
  }

  return marks;
}

// 볼터치는 눈 바로 밑이 아니라 바깥쪽 볼에, 여성에게만 넣습니다.
function buildBlush(gender) {
  if (gender !== "female") return [];

  return [mirrored(NOSE_ROW, CENTER - 8, CENTER - 7, "r")];
}

function buildFaceLayer(skeleton, eyes) {
  return [
    ...buildBrows(skeleton.gender),
    ...buildBlush(skeleton.gender),
    solidRow(NOSE_ROW, CENTER - 1, CENTER, "F"),
    ...buildMouth(eyes),
    ...buildAgeMarks(skeleton.ageConfig.creases),
  ];
}

function lineRuns(startX, line) {
  const runs = [];

  [...line].forEach((cell, index) => {
    if (cell === ".") {
      return;
    }

    const last = runs[runs.length - 1];

    if (
      last &&
      last.x + last.chars.length === startX + index &&
      last.chars[0] === cell
    ) {
      last.chars += cell;
      return;
    }

    runs.push({ x: startX + index, chars: cell });
  });

  return runs.map((run) => [run.x, run.chars]);
}

function buildEyes(eyes) {
  const leftEye = FACE_EYE_LEFT;
  const rightEye = SIZE - leftEye - 5;

  if (eyes === "shades") {
    const shadeLeft = leftEye - 2;

    return [
      ...[EYE_TOP, EYE_TOP + 1, EYE_TOP + 2].map((y) =>
        mirrored(y, shadeLeft, CENTER - 1, "e")
      ),
      mirrored(EYE_TOP, shadeLeft + 3, shadeLeft + 4, "E"),
      mirrored(EYE_TOP + 3, shadeLeft + 1, CENTER - 1, "T"),
      mirrored(EYE_TOP, shadeLeft - 1, shadeLeft - 1, "T"),
      mirrored(EYE_TOP + 1, shadeLeft - 1, shadeLeft - 1, "T"),
    ];
  }

  const leftKey = eyes === "wink" ? "smile" : EYE_SHAPES[eyes] ? eyes : "round";
  const rightKey = eyes === "wink" ? "round" : leftKey;
  const rowsByY = new Map();

  const drawEye = (shape, startX, flip) => {
    shape.forEach((line, dy) => {
      const runs = lineRuns(startX, flip ? [...line].reverse().join("") : line);

      if (!runs.length) return;

      const y = EYE_TOP + dy;

      rowsByY.set(y, [...(rowsByY.get(y) || []), ...runs]);
    });
  };

  drawEye(EYE_SHAPES[leftKey], leftEye, false);
  drawEye(EYE_SHAPES[rightKey], rightEye, true);

  return [...rowsByY.entries()].sort((a, b) => a[0] - b[0]);
}

// Fringe shapes paint over the forehead; the sides frame the face down to the jaw.
function hairCap(
  skeleton,
  { top = 2, bottom = 10, flare = 2, tone = "h" } = {}
) {
  const headTop = skeleton.headByRow.get(HEAD_TOP);
  const dome = [
    evenWidth(headTop.width * 0.45),
    evenWidth(headTop.width * 0.8),
  ];
  const rows = [];

  range(top, HEAD_TOP - 1).forEach((y, index) => {
    rows.push(centeredRow(y, dome[Math.min(index, dome.length - 1)], tone));
  });
  range(HEAD_TOP, bottom).forEach((y) => {
    const head = skeleton.headByRow.get(y) || headTop;

    rows.push(centeredRow(y, evenWidth(head.width + flare), tone));
  });

  return rows;
}

// Hair columns hug the head above the jaw, then slide out past the sleeve line so the
// strands fall in front of the shoulder instead of cutting through the arm.
function sideBaseLeft(skeleton, y) {
  const chin = skeleton.headByRow.get(CHIN_ROW);

  if (y <= CHIN_ROW) {
    return (skeleton.headByRow.get(Math.max(y, HEAD_TOP)) || chin).left;
  }

  const arm = skeleton.arms.find(
    (item) => item.y === Math.max(SHOULDER_ROW + 2, Math.min(y, 46))
  );
  const target = (arm ? arm.left : chin.left) + 1;
  const ratio = Math.min(1, (y - CHIN_ROW) / (SHOULDER_ROW + 2 - CHIN_ROW));

  return Math.round(chin.left + (target - chin.left) * ratio);
}

function hairSides(skeleton, { from, to, thickness = 2, tone = "h" } = {}) {
  return range(from, to).map((y) => {
    const base = sideBaseLeft(skeleton, y);

    return mirrored(y, base - thickness, base - 1, tone);
  });
}

function hairShine(skeleton) {
  const crown = skeleton.headByRow.get(6);
  const runs = [
    mirrored(6, crown.left + 3, crown.left + 5, "H"),
    mirrored(7, crown.left + 3, crown.left + 3, "H"),
    mirrored(9, crown.left + 2, crown.left + 2, "H"),
  ];

  return runs.slice(0, Math.max(1, skeleton.ageConfig.shine));
}

const HAIR_BUILDERS = {
  // 긴 생머리: 어깨 아래까지 흘러내립니다.
  long: (skeleton) => [
    ...hairCap(skeleton, { top: 2, bottom: 9, flare: 2 }),
    ...hairSides(skeleton, { from: 9, to: 44, thickness: 2 }),
    ...hairShine(skeleton),
    mirrored(
      12,
      sideBaseLeft(skeleton, 12) - 2,
      sideBaseLeft(skeleton, 12) - 2,
      "H"
    ),
  ],

  // 짧은 머리: 귀가 드러납니다.
  short: (skeleton) => [
    ...hairCap(skeleton, { top: 3, bottom: 9, flare: 1 }),
    ...hairSides(skeleton, { from: 8, to: 15, thickness: 1 }),
    ...hairShine(skeleton),
  ],

  // 단발: 턱선에서 수평으로 잘리는 컷.
  bob: (skeleton) => [
    ...hairCap(skeleton, { top: 2, bottom: 9, flare: 2 }),
    ...hairSides(skeleton, { from: 9, to: 21, thickness: 2 }),
    ...hairShine(skeleton),
    mirrored(
      21,
      sideBaseLeft(skeleton, 21) - 3,
      sideBaseLeft(skeleton, 21) - 1,
      "h"
    ),
  ],

  // 묶은 머리: 오른쪽 뒤로 꼬리가 빠지고 머리끈이 보입니다.
  ponytail: (skeleton) => {
    const tie = range(8, 9).map((y) =>
      solidRow(
        y,
        SIZE - sideBaseLeft(skeleton, y),
        SIZE - sideBaseLeft(skeleton, y) + 2,
        "T"
      )
    );
    const tail = range(10, 38).map((y) => {
      const base = SIZE - sideBaseLeft(skeleton, y);
      const width = y < 24 ? 4 : y < 32 ? 3 : 2;

      return [y, [[base, `H${"h".repeat(width - 1)}`]]];
    });

    return [
      ...hairCap(skeleton, { top: 2, bottom: 9, flare: 2 }),
      ...hairSides(skeleton, { from: 9, to: 16, thickness: 1 }),
      ...hairShine(skeleton),
      ...tie,
      ...tail,
    ];
  },

  // 올림머리: 정수리 위 묶음.
  bun: (skeleton) => [
    centeredRow(1, 8, "h"),
    centeredRow(2, 10, "h", [[CENTER - 1, "H"]]),
    centeredRow(3, 8, "h"),
    solidRow(3, CENTER - 3, CENTER + 2, "T"),
    ...hairCap(skeleton, { top: 5, bottom: 9, flare: 2 }),
    ...hairSides(skeleton, { from: 8, to: 13, thickness: 1 }),
    ...hairShine(skeleton),
  ],

  // 삭발: 정수리에 얇게 붙은 머리선만 남깁니다.
  buzz: (skeleton) => [
    ...hairCap(skeleton, { top: HEAD_TOP, bottom: 8, flare: 0 }),
    ...hairSides(skeleton, { from: 7, to: 11, thickness: 1 }),
    mirrored(6, CENTER - 3, CENTER + 2, "H"),
  ],

  // 투블럭: 윗머리는 넓게 덮고 옆은 밀어 올려 수평으로 끊습니다.
  twoblock: (skeleton) => [
    ...hairCap(skeleton, { top: 2, bottom: 9, flare: 2 }),
    ...hairSides(skeleton, { from: 9, to: 10, thickness: 2 }),
    ...hairShine(skeleton),
    solidRow(9, CENTER - 11, CENTER + 10, "h"),
  ],

  // 상륙돌격: 가운데만 남긴 짧은 스트립.
  landing: () => [
    centeredRow(2, 6, "h"),
    centeredRow(3, 8, "h", [[CENTER - 2, "H"]]),
    centeredRow(4, 6, "h"),
    centeredRow(5, 6, "h", [[CENTER - 1, "H"]]),
    centeredRow(6, 6, "h"),
    centeredRow(7, 4, "h"),
    centeredRow(8, 4, "h", [[CENTER - 1, "H"]]),
    centeredRow(9, 4, "h"),
    centeredRow(10, 2, "h"),
  ],
};

function composeLayers(value, tableNumber) {
  const style = resolveCharacterStyle(value, tableNumber);
  const gender = BODY_SPECS[style.gender] ? style.gender : "female";
  const bodyId = BODY_SPECS[gender][style.body]
    ? style.body
    : GUEST_DEFAULT_BODY[gender];
  const skeleton = buildSkeleton(gender, bodyId, style.age);
  const buildOutfit = OUTFIT_BUILDERS[style.outfit] || OUTFIT_BUILDERS.tee;
  const buildHair = HAIR_BUILDERS[style.hairstyle] || HAIR_BUILDERS.long;
  const grid = createGrid();

  paintLayer(grid, buildBodyLayer(skeleton));
  paintLayer(grid, buildOutfit(skeleton));
  paintLayer(grid, buildFaceLayer(skeleton, style.eyes));
  // Hair only needs to follow the shoulders; around the neck it frames the face freely.
  paintLayer(grid, buildHair(skeleton), skeleton.silhouette, 6);
  paintLayer(grid, buildEyes(style.eyes));

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
