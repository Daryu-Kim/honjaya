// 카카오 로그인 준비(P4).
//
// 카카오 developers 콘솔에서 앱/동의항목/Redirect URI 를 준비하고 .env 에
// KAKAO_REST_API_KEY, KAKAO_REDIRECT_URI 를 넣으면 자동으로 켜집니다.
// 키가 없으면 기능 전체가 꺼진 상태로 동작하므로 배포에는 영향이 없습니다.
import { config } from "./config.js";

export const KAKAO_AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize";

export function isKakaoLoginEnabled() {
  return Boolean(config.kakaoRestApiKey && config.kakaoRedirectUri);
}

export function kakaoRedirectUri() {
  return config.kakaoRedirectUri;
}

// 프런트엔드는 이 주소로 이동만 하면 됩니다(키는 서버에만 둡니다).
export function buildKakaoAuthorizeUrl({ state = "" } = {}) {
  if (!isKakaoLoginEnabled()) {
    return "";
  }

  const url = new URL(KAKAO_AUTHORIZE_URL);
  url.searchParams.set("client_id", config.kakaoRestApiKey);
  url.searchParams.set("redirect_uri", config.kakaoRedirectUri);
  url.searchParams.set("response_type", "code");

  if (state) {
    url.searchParams.set("state", state);
  }

  return url.toString();
}
