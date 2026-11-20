// 카카오 로그인 준비(P4) 상태 API.
//
// 아직 카카오 앱이 없어도 서버는 정상 동작합니다. enabled=false 이면
// 프런트엔드는 카카오 로그인 버튼을 숨깁니다.
import {
  buildKakaoAuthorizeUrl,
  isKakaoLoginEnabled,
  kakaoRedirectUri,
} from "../../kakao.js";

export function registerKakaoRoutes(app) {
  app.get("/api/kakao/status", async () => {
    const enabled = isKakaoLoginEnabled();

    return {
      enabled,
      redirectUri: enabled ? kakaoRedirectUri() : "",
      authorizeUrl: enabled ? buildKakaoAuthorizeUrl() : "",
    };
  });
}
