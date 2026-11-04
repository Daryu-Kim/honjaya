// 손님 캐릭터(픽셀 아바타) 프리셋입니다.
// order_sheets.character_style 에는 아래 id만 저장합니다.
// 예: { gender: "female", skin: "warm", hairstyle: "long", hair: "ink", eyes: "round", outfit: "tee", shirt: "peach" }

// 연령대는 얼굴 주름과 실루엣(어깨·허리)에 반영됩니다.
export const CHARACTER_AGES = [
  { id: "youth", label: "청년" },
  { id: "middle", label: "중년" },
  { id: "senior", label: "노년" },
];

export const CHARACTER_GENDERS = [
  {
    id: "female",
    label: "여성",
    emoji: "\uD83D\uDC69",
    defaultHairstyle: "long",
    defaultBody: "normal",
  },
  {
    id: "male",
    label: "남성",
    emoji: "\uD83D\uDC68",
    defaultHairstyle: "short",
    defaultBody: "normal",
  },
];

// 체형은 성별마다 실루엣이 달라서 성별별 목록으로 나눠 둡니다.
export const CHARACTER_BODY_TYPES = {
  female: [
    { id: "slim", label: "슬림" },
    { id: "normal", label: "보통" },
    { id: "curvy", label: "글래머" },
    { id: "petite", label: "아담" },
  ],
  male: [
    { id: "slim", label: "슬림" },
    { id: "normal", label: "보통" },
    { id: "muscle", label: "근육질" },
    { id: "sturdy", label: "다부진" },
  ],
};

export const CHARACTER_SKIN_TONES = [
  {
    id: "warm",
    label: "웜톤",
    skin: "#f7d5b5",
    skinLight: "#ffe3cb",
    skinShadow: "#e3b391",
  },
  {
    id: "ivory",
    label: "아이보리",
    skin: "#ffe6d1",
    skinLight: "#fff2e6",
    skinShadow: "#eec3a6",
  },
  {
    id: "honey",
    label: "허니",
    skin: "#e6b185",
    skinLight: "#f3c9a4",
    skinShadow: "#c68a62",
  },
  {
    id: "cocoa",
    label: "코코아",
    skin: "#b57b52",
    skinLight: "#cd9270",
    skinShadow: "#8f5c3b",
  },
  {
    id: "olive",
    label: "올리브",
    skin: "#cf9c69",
    skinLight: "#e0b489",
    skinShadow: "#a97445",
  },
  {
    id: "rosy",
    label: "로지",
    skin: "#fbd9c6",
    skinLight: "#ffe8db",
    skinShadow: "#e7b3a0",
  },
];

export const CHARACTER_HAIR_TONES = [
  { id: "ink", label: "흑발", hair: "#241f33", hairLight: "#3d3459" },
  { id: "chestnut", label: "밤색", hair: "#4a2f1f", hairLight: "#6f4a2e" },
  { id: "ash", label: "잿빛", hair: "#1b2430", hairLight: "#35455b" },
  { id: "violet", label: "보라", hair: "#5c3b6e", hairLight: "#82569a" },
  { id: "graphite", label: "먹색", hair: "#2b2b2b", hairLight: "#4d4a4a" },
  { id: "caramel", label: "캐러멜", hair: "#6b3f1d", hairLight: "#95602f" },
  { id: "wine", label: "와인", hair: "#6d1f38", hairLight: "#9c3554" },
  { id: "silver", label: "은발", hair: "#9aa3b2", hairLight: "#c8d0dc" },
];

export const CHARACTER_SHIRT_TONES = [
  { id: "peach", label: "피치", shirt: "#ff8a5c", shirtDark: "#c95f33" },
  { id: "sky", label: "하늘", shirt: "#5bc0eb", shirtDark: "#3a8fb8" },
  { id: "lime", label: "연두", shirt: "#9ee37d", shirtDark: "#6fae52" },
  { id: "butter", label: "버터", shirt: "#ffd166", shirtDark: "#c99b2e" },
  { id: "rose", label: "로즈", shirt: "#ef476f", shirtDark: "#b32a4e" },
  { id: "mint", label: "민트", shirt: "#2ec4b6", shirtDark: "#1f8f85" },
  { id: "lilac", label: "라일락", shirt: "#b8a1ff", shirtDark: "#8871cc" },
  { id: "sand", label: "샌드", shirt: "#e8d6b3", shirtDark: "#bda480" },
  { id: "white", label: "화이트", shirt: "#f8f5ef", shirtDark: "#c6bfb4" },
  { id: "cream", label: "크림", shirt: "#f1e2c6", shirtDark: "#c2ae8d" },
  { id: "black", label: "블랙", shirt: "#2b2733", shirtDark: "#17141d" },
  { id: "charcoal", label: "차콜", shirt: "#4a4f5c", shirtDark: "#2c303a" },
  { id: "navy", label: "네이비", shirt: "#35507f", shirtDark: "#223454" },
  { id: "olive", label: "카키", shirt: "#6f7d4e", shirtDark: "#4a5633" },
  { id: "wine", label: "버건디", shirt: "#83334a", shirtDark: "#5a2032" },
  { id: "brown", label: "브라운", shirt: "#8a6146", shirtDark: "#5f402c" },
];

export const CHARACTER_HAIRSTYLES = [
  { id: "long", label: "긴 생머리" },
  { id: "short", label: "숏컷" },
  { id: "bob", label: "단발" },
  { id: "ponytail", label: "포니테일" },
  { id: "bun", label: "묶음머리" },
  { id: "buzz", label: "삭발" },
  { id: "twoblock", label: "투블럭" },
  { id: "landing", label: "상륙돌격" },
];

export const CHARACTER_EYE_STYLES = [
  { id: "round", label: "동그란 눈" },
  { id: "smile", label: "웃는 눈" },
  { id: "wink", label: "윙크" },
  { id: "heart", label: "하트 눈" },
  { id: "shades", label: "선글라스" },
];

export const CHARACTER_OUTFITS = [
  { id: "tee", label: "반팔 티" },
  { id: "shirt", label: "셔츠" },
  { id: "hoodie", label: "후디" },
  { id: "knit", label: "니트" },
  { id: "slip", label: "민소매" },
  { id: "dress", label: "원피스" },
];

// 편집 화면에서 그대로 순회해서 쓰는 그룹 정의입니다.
// type: "color" → 색상 스와치, "choice" → 이름 버튼
export const CHARACTER_STYLE_GROUPS = [
  { key: "gender", label: "성별", type: "choice", options: CHARACTER_GENDERS },
  { key: "age", label: "연령대", type: "choice", options: CHARACTER_AGES },
  { key: "body", label: "체형", type: "choice", options: [] },
  {
    key: "hairstyle",
    label: "헤어 스타일",
    type: "choice",
    options: CHARACTER_HAIRSTYLES,
  },
  {
    key: "hair",
    label: "헤어 색",
    type: "color",
    options: CHARACTER_HAIR_TONES,
  },
  { key: "skin", label: "피부", type: "color", options: CHARACTER_SKIN_TONES },
  {
    key: "eyes",
    label: "눈 모양",
    type: "choice",
    options: CHARACTER_EYE_STYLES,
  },
  { key: "outfit", label: "의상", type: "choice", options: CHARACTER_OUTFITS },
  {
    key: "shirt",
    label: "의상 색",
    type: "color",
    options: CHARACTER_SHIRT_TONES,
  },
];

function findOption(options, id) {
  return options.find((option) => option.id === id) || null;
}

function findGender(id) {
  return findOption(CHARACTER_GENDERS, id);
}

const ALL_BODY_OPTIONS = Object.values(CHARACTER_BODY_TYPES).reduce(
  (options, list) =>
    options.concat(list.filter((item) => !findOption(options, item.id))),
  []
);

// 성별을 아직 안 골랐을 때는 두 성별 체형을 모두 허용합니다.
export function getCharacterBodyOptions(gender) {
  return CHARACTER_BODY_TYPES[gender] || ALL_BODY_OPTIONS;
}

// 아직 꾸미지 않은 테이블은 지금까지처럼 테이블 번호로 색을 정합니다.
export function getFallbackCharacterStyle(tableNumber) {
  const seed = Math.abs(Number(tableNumber) || 0);
  const paletteIndex = seed % 6;
  const gender = seed % 2 === 0 ? "female" : "male";
  const genderOption = findGender(gender);

  return {
    age: CHARACTER_AGES[0].id,
    gender,
    body: genderOption.defaultBody,
    skin: CHARACTER_SKIN_TONES[0].id,
    hairstyle: genderOption.defaultHairstyle,
    hair: CHARACTER_HAIR_TONES[paletteIndex].id,
    eyes: "round",
    outfit: "tee",
    shirt: CHARACTER_SHIRT_TONES[paletteIndex].id,
  };
}

// 저장된 값에서 아는 id만 남깁니다. (없는 값은 빈 문자열)
export function normalizeCharacterStyle(value) {
  const source = value && typeof value === "object" ? value : {};
  const gender = findGender(source.gender) ? source.gender : "";
  const body = findOption(getCharacterBodyOptions(gender), source.body);

  return {
    // 연령대는 나중에 추가된 항목이라 기존 저장값도 항상 완성 상태로 보이게 기본값을 채웁니다.
    age: findOption(CHARACTER_AGES, source.age)
      ? source.age
      : CHARACTER_AGES[0].id,
    gender,
    body: body ? body.id : "",
    skin: findOption(CHARACTER_SKIN_TONES, source.skin) ? source.skin : "",
    hairstyle: findOption(CHARACTER_HAIRSTYLES, source.hairstyle)
      ? source.hairstyle
      : "",
    hair: findOption(CHARACTER_HAIR_TONES, source.hair) ? source.hair : "",
    eyes: findOption(CHARACTER_EYE_STYLES, source.eyes) ? source.eyes : "",
    outfit: findOption(CHARACTER_OUTFITS, source.outfit) ? source.outfit : "",
    shirt: findOption(CHARACTER_SHIRT_TONES, source.shirt) ? source.shirt : "",
  };
}

// 화면에 그릴 때 쓰는 최종 값(저장값 + 기본값)입니다.
export function resolveCharacterStyle(value, tableNumber) {
  const normalized = normalizeCharacterStyle(value);
  const fallback = getFallbackCharacterStyle(tableNumber);
  const gender = normalized.gender || fallback.gender;
  const genderOption = findGender(gender);
  const body = findOption(getCharacterBodyOptions(gender), normalized.body);

  return {
    age: normalized.age || fallback.age,
    gender,
    body: body ? body.id : genderOption.defaultBody,
    skin: normalized.skin || fallback.skin,
    hairstyle:
      normalized.hairstyle ||
      genderOption.defaultHairstyle ||
      fallback.hairstyle,
    hair: normalized.hair || fallback.hair,
    eyes: normalized.eyes || fallback.eyes,
    outfit: normalized.outfit || fallback.outfit,
    shirt: normalized.shirt || fallback.shirt,
  };
}

export function isCompleteCharacterStyle(value) {
  const normalized = normalizeCharacterStyle(value);

  return Object.values(normalized).every((item) => Boolean(item));
}

// CSS 변수(--hair, --shirt ...)로 바로 쓸 수 있는 색상 묶음을 돌려줍니다.
export function getCharacterPalette(value, tableNumber) {
  const style = resolveCharacterStyle(value, tableNumber);
  const skin =
    findOption(CHARACTER_SKIN_TONES, style.skin) || CHARACTER_SKIN_TONES[0];
  const hair =
    findOption(CHARACTER_HAIR_TONES, style.hair) || CHARACTER_HAIR_TONES[0];
  const shirt =
    findOption(CHARACTER_SHIRT_TONES, style.shirt) || CHARACTER_SHIRT_TONES[0];

  return {
    skin: skin.skin,
    skinLight: skin.skinLight,
    skinShadow: skin.skinShadow,
    hair: hair.hair,
    hairLight: hair.hairLight,
    shirt: shirt.shirt,
    shirtDark: shirt.shirtDark,
    shoes: "#3b3348",
    shoesDark: "#241f2e",
  };
}
