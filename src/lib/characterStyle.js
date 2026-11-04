// 손님 캐릭터(픽셀 아바타) 색상 프리셋입니다.
// order_sheets.character_style 에는 아래 id만 저장합니다. (예: { skin: "warm", hair: "ink", shirt: "peach" })

export const CHARACTER_SKIN_TONES = [
  { id: "warm", label: "웜톤", skin: "#f7d5b5", skinShadow: "#e3b391" },
  { id: "ivory", label: "아이보리", skin: "#ffe6d1", skinShadow: "#eec3a6" },
  { id: "honey", label: "허니", skin: "#e6b185", skinShadow: "#c68a62" },
  { id: "cocoa", label: "코코아", skin: "#b57b52", skinShadow: "#8f5c3b" },
];

export const CHARACTER_HAIR_TONES = [
  { id: "ink", label: "흑발", hair: "#241f33", hairLight: "#3d3459" },
  { id: "chestnut", label: "밤색", hair: "#4a2f1f", hairLight: "#6f4a2e" },
  { id: "ash", label: "잿빛", hair: "#1b2430", hairLight: "#35455b" },
  { id: "violet", label: "보라", hair: "#5c3b6e", hairLight: "#82569a" },
  { id: "graphite", label: "먹색", hair: "#2b2b2b", hairLight: "#4d4a4a" },
  { id: "caramel", label: "캐러멜", hair: "#6b3f1d", hairLight: "#95602f" },
];

export const CHARACTER_SHIRT_TONES = [
  { id: "peach", label: "피치", shirt: "#ff8a5c", shirtDark: "#c95f33" },
  { id: "sky", label: "하늘", shirt: "#5bc0eb", shirtDark: "#3a8fb8" },
  { id: "lime", label: "연두", shirt: "#9ee37d", shirtDark: "#6fae52" },
  { id: "butter", label: "버터", shirt: "#ffd166", shirtDark: "#c99b2e" },
  { id: "rose", label: "로즈", shirt: "#ef476f", shirtDark: "#b32a4e" },
  { id: "mint", label: "민트", shirt: "#2ec4b6", shirtDark: "#1f8f85" },
];

// 편집 화면에서 그대로 순회해서 쓰는 그룹 정의입니다.
export const CHARACTER_STYLE_GROUPS = [
  { key: "skin", label: "피부", options: CHARACTER_SKIN_TONES },
  { key: "hair", label: "헤어", options: CHARACTER_HAIR_TONES },
  { key: "shirt", label: "의상", options: CHARACTER_SHIRT_TONES },
];

function findTone(tones, id) {
  return tones.find((tone) => tone.id === id) || null;
}

// 아직 꾸미지 않은 테이블은 지금까지처럼 테이블 번호로 색을 정합니다.
export function getFallbackCharacterStyle(tableNumber) {
  const index =
    Math.abs(Number(tableNumber) || 0) % CHARACTER_HAIR_TONES.length;

  return {
    skin: CHARACTER_SKIN_TONES[0].id,
    hair: CHARACTER_HAIR_TONES[index].id,
    shirt: CHARACTER_SHIRT_TONES[index].id,
  };
}

// 저장된 값에서 아는 id만 남깁니다. (없는 값은 빈 문자열)
export function normalizeCharacterStyle(value) {
  const source = value && typeof value === "object" ? value : {};

  return {
    skin: findTone(CHARACTER_SKIN_TONES, source.skin) ? source.skin : "",
    hair: findTone(CHARACTER_HAIR_TONES, source.hair) ? source.hair : "",
    shirt: findTone(CHARACTER_SHIRT_TONES, source.shirt) ? source.shirt : "",
  };
}

// 화면에 그릴 때 쓰는 최종 값(저장값 + 기본값)입니다.
export function resolveCharacterStyle(value, tableNumber) {
  const normalized = normalizeCharacterStyle(value);
  const fallback = getFallbackCharacterStyle(tableNumber);

  return {
    skin: normalized.skin || fallback.skin,
    hair: normalized.hair || fallback.hair,
    shirt: normalized.shirt || fallback.shirt,
  };
}

// CSS 변수(--hair, --shirt ...)로 바로 쓸 수 있는 색상 묶음을 돌려줍니다.
export function getCharacterPalette(value, tableNumber) {
  const style = resolveCharacterStyle(value, tableNumber);
  const skin =
    findTone(CHARACTER_SKIN_TONES, style.skin) || CHARACTER_SKIN_TONES[0];
  const hair =
    findTone(CHARACTER_HAIR_TONES, style.hair) || CHARACTER_HAIR_TONES[0];
  const shirt =
    findTone(CHARACTER_SHIRT_TONES, style.shirt) || CHARACTER_SHIRT_TONES[0];

  return {
    skin: skin.skin,
    skinShadow: skin.skinShadow,
    hair: hair.hair,
    hairLight: hair.hairLight,
    shirt: shirt.shirt,
    shirtDark: shirt.shirtDark,
  };
}
