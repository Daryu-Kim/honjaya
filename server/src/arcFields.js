// ARC 민감 컬럼 저장소.
//
// 이 서버는 외부 키를 주입할 수 있는 운영 환경이 아니어서 필드 암호화를 쓰지 않습니다.
// (키를 넣지 못하면 민감정보 화면이 통째로 503 으로 잠겨 업무가 멈추는 문제가 있었습니다.)
//
// 대신 보호는 접근통제로 합니다.
//   * 상세 건강기록은 유효한 동의서가 있어야만 저장됩니다.
//   * 열람은 사장 승인요청 + ARC 대표(RN) 승인을 통과해야 하고, 매 열람이
//     arc_sensitive_reads 에 기록됩니다.
//   * 화면에는 마스킹만 보이고, 원문은 승인된 사람에게만 내려갑니다.
//
// 저장 형식은 예전과 같은 *_enc 컬럼을 그대로 씁니다(값만 평문).

const LEGACY_ENVELOPE = /^v\d+:[A-Za-z0-9+/=]+$/;

/** 평문 → 저장값. 빈 값은 빈 문자열로 둡니다(컬럼 default ''). */
export function storeField(plain) {
  return String(plain ?? "");
}

/**
 * 저장값 → 평문.
 * 예전에 암호화로 들어간 값은 키가 없어 되돌릴 수 없으므로 null 을 돌려줍니다.
 * 화면은 이때 "복호화 실패" 대신 다시 저장하라는 안내를 보여 줍니다.
 */
export function readField(value) {
  const textValue = String(value ?? "");

  if (!textValue) {
    return "";
  }

  return LEGACY_ENVELOPE.test(textValue.trim()) ? null : textValue;
}
