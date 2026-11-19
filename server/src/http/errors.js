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
