// 24x24 픽셀 손님 스프라이트입니다. TV 화면과 손님 캐릭터 편집 화면이 함께 씁니다.

export const GUEST_CELL_TONES = {
  h: "hair",
  H: "hair-light",
  f: "skin",
  F: "skin-shadow",
  s: "skin",
  S: "skin-shadow",
  t: "shirt",
  T: "shirt-dark",
  e: "eye",
  r: "blush",
  m: "mouth",
};

// 앉은 자세라 무릎 아래는 가구가 가립니다.
export const GUEST_SPRITE = [
  "........................",
  "........hhhhhhhh........",
  "......hhhhhhhhhhhh......",
  ".....hHhhhhhhhhhhHh.....",
  ".....hhhhhhhhhhhhhh.....",
  ".....hhffffffffffhh.....",
  ".....hhffeeffeeffhh.....",
  ".....hhffeeffeeffhh.....",
  ".....hhrrffffffrrhh.....",
  ".....hhffffmmffffhh.....",
  "......hffffffffffh......",
  "..........fFFf..........",
  "......TttttTTttttT......",
  "....TttttttttttttttT....",
  "...ssTttttttttttttTss...",
  "...sSTttttttttttttTSs...",
  "...ssTttttttttttttTss...",
  "....STttttttttttttTS....",
  ".....TttttttttttttT.....",
  ".....TTttttttttttTT.....",
  "......TTTTTTTTTTTT......",
  "........................",
  "........................",
  "........................",
];

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

export const GUEST_PARTS = buildSpritePaths(GUEST_SPRITE, GUEST_CELL_TONES);
