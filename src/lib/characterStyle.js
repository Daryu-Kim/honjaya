// 손님 캐릭터는 마인크래프트 스킨으로 그립니다.
// 손님이 고르는 값은 성별과 마인크래프트 닉네임 두 가지뿐이고,
// 나머지는 성별에 맞는 기본 스킨이 채웁니다.

export const CHARACTER_GENDERS = [
  { id: "female", label: "여성", emoji: "👩" },
  { id: "male", label: "남성", emoji: "👨" },
];

// 마인크래프트 자바 에디션 닉네임 규칙(영문/숫자/밑줄 3~16자)입니다.
export const MINECRAFT_NICKNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;

function findGender(id) {
  return CHARACTER_GENDERS.find((gender) => gender.id === id) || null;
}

// 입력 중인 닉네임을 저장 가능한 형태로 다듬습니다. (형식이 틀리면 빈 값)
export function normalizeMinecraftNickname(value) {
  const text = String(value ?? "").trim();

  return MINECRAFT_NICKNAME_PATTERN.test(text) ? text : "";
}

export function getMinecraftNicknameMessage(value) {
  const text = String(value ?? "").trim();

  if (!text || MINECRAFT_NICKNAME_PATTERN.test(text)) return "";

  return "영문·숫자·밑줄 3~16자로 입력해주세요.";
}

// 아직 성별을 고르지 않은 테이블은 지금까지처럼 테이블 번호로 정합니다.
export function getFallbackGender(tableNumber) {
  return Math.abs(Number(tableNumber) || 0) % 2 === 0 ? "female" : "male";
}

// 저장된 값에서 아는 값만 남깁니다. (고르지 않은 성별은 빈 문자열)
export function normalizeCharacterStyle(value) {
  const source = value && typeof value === "object" ? value : {};

  return {
    gender: findGender(source.gender) ? source.gender : "",
    minecraft: normalizeMinecraftNickname(source.minecraft),
  };
}

// 화면에 그릴 때 쓰는 최종 값(저장값 + 기본값)입니다.
export function resolveCharacterStyle(value, tableNumber) {
  const normalized = normalizeCharacterStyle(value);

  return {
    gender: normalized.gender || getFallbackGender(tableNumber),
    minecraft: normalized.minecraft,
  };
}

export function isCompleteCharacterStyle(value) {
  return Boolean(normalizeCharacterStyle(value).gender);
}
