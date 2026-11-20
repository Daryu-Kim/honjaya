// 직원 인증/관리자 API 호출 도우미.
//
// 주소 규칙
//   * 기본값(빈 문자열)은 지금 접속한 오리진을 그대로 씁니다.
//     Vercel rewrite/개발 프록시가 /api/staff, /api/admin 을 백엔드로 넘겨주므로
//     브라우저 입장에서는 항상 같은 오리진 → 쿠키가 1st-party 로 안전하게 오갑니다.
//   * 필요하면 VUE_APP_API_BASE_URL 로 백엔드 주소를 직접 지정할 수 있습니다.
const RAW_BASE_URL = String(process.env.VUE_APP_API_BASE_URL || "").trim();

export const API_BASE_URL = RAW_BASE_URL.replace(/\/+$/, "");

// 서버의 전역 API 키 가드(onRequest)를 통과하기 위한 공개 키입니다.
// anon key 는 원래 프런트 번들에 포함되는 공개 값입니다.
const API_KEY = String(
  process.env.VUE_APP_SUPABASE_PUBLISHABLE_KEY || ""
).trim();

export class ApiError extends Error {
  constructor(message, { status = 0, code = "", details = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function buildUrl(path) {
  const normalized = path.startsWith("/") ? path : `/${path}`;

  return `${API_BASE_URL}${normalized}`;
}

export async function apiRequest(path, options = {}) {
  const { method = "GET", body, headers, signal } = options;

  const requestHeaders = {
    accept: "application/json",
    ...(headers || {}),
  };

  if (API_KEY) {
    requestHeaders.apikey = API_KEY;
  }

  let payload;

  if (body !== undefined && body !== null) {
    requestHeaders["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let response;

  try {
    response = await fetch(buildUrl(path), {
      method,
      headers: requestHeaders,
      body: payload,
      // 직원 세션 쿠키(HttpOnly)를 주고받으려면 필수입니다.
      credentials: "include",
      signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw error;
    }

    throw new ApiError(
      "서버에 연결하지 못했어요. 네트워크 상태를 확인해 주세요.",
      {
        code: "NETWORK_ERROR",
      }
    );
  }

  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    throw new ApiError(data?.message || "요청을 처리하지 못했어요.", {
      status: response.status,
      code: data?.code || "",
      details: data?.details ?? null,
    });
  }

  return data;
}

export function apiGet(path, options = {}) {
  return apiRequest(path, { ...options, method: "GET" });
}

export function apiPost(path, body, options = {}) {
  return apiRequest(path, { ...options, method: "POST", body });
}

export function apiPatch(path, body, options = {}) {
  return apiRequest(path, { ...options, method: "PATCH", body });
}
