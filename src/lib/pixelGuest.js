// 64x64 픽셀 캐릭터 스프라이트입니다. TV 화면과 캐릭터 편집 화면이 함께 씁니다.
// 캐릭터 그림은 마인크래프트 스킨에서 만들고, 좌석마다 같은 그림을 공유합니다.

import { resolveCharacterStyle } from "./characterStyle";
import { defaultSkinParts, skinPartsFor } from "./minecraftSkin";

export const GUEST_SPRITE_SIZE = 64;

// Ready to use as an SVG viewBox attribute.
export const GUEST_SPRITE_VIEW_BOX = `0 0 ${GUEST_SPRITE_SIZE} ${GUEST_SPRITE_SIZE}`;

// The bar counter hides the lower body, so the staff figure only needs the bust.
export const STAFF_SPRITE_VIEW_BOX = `0 0 ${GUEST_SPRITE_SIZE} 44`;

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

// 손님 캐릭터의 path 목록입니다. 마인크래프트 닉네임이 있으면 그 스킨을,
// 없으면(또는 아직 불러오는 중이면) 성별 기본 스킨을 사용합니다.
export function buildGuestParts(value, tableNumber) {
  const style = resolveCharacterStyle(value, tableNumber);
  const skinParts = skinPartsFor(style.minecraft);

  return skinParts || defaultSkinParts(style.gender);
}

export const STAFF_PARTS = defaultSkinParts("staff");
