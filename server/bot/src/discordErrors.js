// Discord REST 오류를 화면에 보여줄 한국어 메시지로 변환합니다.
// status 는 내부 API 응답 코드로 그대로 쓰이고, api 컨테이너가 다시 프론트로 넘깁니다.

const CODE_MESSAGES = {
  10004: "채널을 찾을 수 없어요. 삭제되었는지 확인해 주세요.",
  10007: "해당 멤버를 찾을 수 없어요. 이미 나갔을 수 있어요.",
  10008: "메시지를 찾을 수 없어요. 이미 삭제되었을 수 있어요.",
  10011: "역할을 찾을 수 없어요.",
  10013: "사용자를 찾을 수 없어요.",
  10014: "초대 코드를 찾을 수 없어요. 이미 만료되었을 수 있어요.",
  10026: "차단된 사용자가 아니에요.",
  30013: "초대 링크가 너무 많아요. 기존 링크를 정리한 뒤 다시 시도해 주세요.",
  50001: "봇이 해당 채널에 접근할 수 없어요. 채널 권한을 확인해 주세요.",
  50013: "봇 권한이 부족해요. Discord 서버 설정에서 봇 역할의 권한을 확인해 주세요.",
  50035: "입력값이 Discord 규칙에 맞지 않아요.",
};

/** 봇 내부에서 우리가 직접 던지는 오류. status 를 그대로 응답 코드로 사용합니다. */
export function opError(status, message, code = null) {
  const error = new Error(message);

  error.status = status;
  error.discordCode = code;

  return error;
}

export function toKoreanDiscordError(error) {
  const code = Number(error?.code) || null;
  const httpStatus = Number(error?.httpStatus) || 0;
  const message =
    CODE_MESSAGES[code] ||
    (error instanceof Error ? error.message : String(error)) ||
    "Discord 요청을 처리하지 못했어요.";

  let status = 400;

  if (httpStatus === 403 || code === 50013 || code === 50001) {
    status = 403;
  } else if (httpStatus === 404 || code === 10007 || code === 10008 || code === 10013 || code === 10014) {
    status = 404;
  } else if (httpStatus === 429) {
    status = 429;
  } else if (httpStatus >= 500) {
    status = 502;
  } else if (!httpStatus && !code) {
    status = 502;
  }

  return opError(status, message, code);
}
