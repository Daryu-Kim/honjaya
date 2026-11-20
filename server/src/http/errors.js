// PostgREST 와 같은 모양({ code, details, hint, message })으로 응답하기 위한 에러 타입입니다.
export class HttpError extends Error {
  constructor(status, code, message, details = null, hint = null) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.hint = hint;
  }

  toBody() {
    return {
      code: this.code,
      details: this.details,
      hint: this.hint,
      message: this.message,
    };
  }
}

export function badRequest(message, details = null) {
  return new HttpError(400, "PGRST100", message, details);
}

export const PG_STATUS = {
  "23505": 409, // unique violation
  "23503": 409, // foreign key violation
  "23502": 400, // not null violation
  "23514": 400, // check violation
  "22P02": 400, // invalid text representation
  "22003": 400, // numeric out of range
  "42501": 403, // insufficient privilege
  "42P01": 404, // undefined table
  "42703": 400, // undefined column
  "42883": 400, // undefined function
  "21000": 400, // cardinality violation
};

// Postgres 원문(영어)을 그대로 노출하면 사장님이 원인을 알 수 없어서
// 자주 나는 코드만 한국어 안내로 바꿉니다. 원문은 details 로 함께 내려줍니다.
export const PG_MESSAGES = {
  "23505": "이미 같은 값이 있어요(중복).",
  "23503": "연결된 데이터를 찾을 수 없어요.",
  "23502": "꼭 필요한 값이 비어 있어요.",
  "23514": "허용되지 않는 값이에요.",
  "22P02": "값 형식이 올바르지 않아요.",
  "22003": "숫자 범위를 벗어났어요.",
  "42501": "권한이 없어요.",
  "42P01": "테이블을 찾을 수 없어요.",
  "42703": "컬럼을 찾을 수 없어요.",
  "42883": "지원하지 않는 연산이에요.",
  "21000": "조건에 맞는 행이 너무 많아요.",
};
