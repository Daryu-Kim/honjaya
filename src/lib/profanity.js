// 금칙어 마스킹: 손님이 남긴 문구가 매장 TV 에 그대로 노출되므로 저장 전에 가립니다.
// 완벽한 필터가 아니라 1차 방어선이며, 운영 중 문제 문구는 관리자가 숨김/삭제로 대응합니다.
const PROFANITY_WORDS = [
  "씨발",
  "시발",
  "씨팔",
  "시팔",
  "씹새",
  "씹년",
  "좆",
  "존나",
  "졸라",
  "좃",
  "개새",
  "개색",
  "개같",
  "개년",
  "병신",
  "븅신",
  "지랄",
  "염병",
  "니미",
  "빡대",
  "꺼져",
  "죽어",
  "새끼",
  "새키",
  "미친놈",
  "미친년",
  "걸레",
  "창녀",
  "보지",
  "자지",
  "섹스",
  "야스",
  "애미",
  "애비",
  "느금",
  "후장",
  "따먹",
  "떡치",
  "ㅅㅂ",
  "ㅆㅂ",
  "ㅂㅅ",
  "ㅈㄹ",
  "tlqkf",
  "fuck",
  "shit",
  "bitch",
  "sex",
];

function maskWord(text, word) {
  const mask = "*".repeat([...word].length);

  return text.split(word).join(mask);
}

export function hasProfanity(text) {
  const source = String(text || "").toLowerCase();

  if (!source) {
    return false;
  }

  return PROFANITY_WORDS.some((word) => source.includes(word.toLowerCase()));
}

export function maskProfanity(text) {
  let result = String(text || "");

  if (!result) {
    return "";
  }

  PROFANITY_WORDS.forEach((word) => {
    result = maskWord(result, word);
    result = maskWord(result, word.toUpperCase());
  });

  return result;
}
