// P7 — 문자/알림톡 발송 어댑터.
//
// 손님은 카카오 계정이 없어도 됩니다. 발송은 사업자(가게)가 계약한 발송 업체 API 로 나가고,
// 알림톡은 업체가 카카오 비즈채널과 발신 프로필을 대신 관리해 줍니다.
//
// MESSAGING_PROVIDER:
//   dryrun  (기본값) 실제로 보내지 않고 성공 응답만 흉내 냅니다. 문구/대상 검수용.
//   none    발송 기능을 끕니다(캠페인은 만들 수 있지만 send 는 503).
//   solapi  솔라피(SOLAPI) — 계약 후 키를 넣으면 켜집니다.
import { config } from "./config.js";
import { HttpError } from "./http/errors.js";

const PROVIDERS = new Set(["dryrun", "none", "solapi"]);

export function messagingProvider() {
  const name = String(config.messaging?.provider || "dryrun").toLowerCase();

  return PROVIDERS.has(name) ? name : "dryrun";
}

export function messagingSender() {
  return String(config.messaging?.sender || "");
}

// 실제 발송이 나가는지(=검수용 dryrun 인지) 화면에 알려 줄 때 씁니다.
export function isDryRun() {
  return messagingProvider() !== "solapi";
}

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/[^0-9]/g, "");

  if (digits.startsWith("82")) return `0${digits.slice(2)}`;

  return digits;
}

// 한 건 발송. 성공하면 { id } 를 돌려주고, 실패하면 예외를 던집니다.
export async function sendOne({ to, text, channel, title }) {
  const provider = messagingProvider();
  const phone = normalizePhone(to);

  if (!phone) {
    throw new HttpError(400, "HJ400", "받는 번호가 비어 있어요.");
  }

  if (provider === "none") {
    throw new HttpError(
      503,
      "HJ503",
      "발송 업체가 아직 연결되지 않았어요. 관리자에게 문의해 주세요."
    );
  }

  if (provider === "dryrun") {
    return {
      id: `dry-${phone.slice(-4)}-${Date.now().toString(36)}`,
      provider,
    };
  }

  // solapi — 계약 전에는 동작하지 않습니다. 키가 들어오면 이 블록만 채우면 됩니다.
  const apiKey = String(config.messaging?.solapiApiKey || "");
  const apiSecret = String(config.messaging?.solapiApiSecret || "");

  if (!apiKey || !apiSecret) {
    throw new HttpError(
      503,
      "HJ503",
      "발송 업체 키가 설정되지 않았어요. 관리자에게 문의해 주세요."
    );
  }

  throw new HttpError(
    503,
    "HJ503",
    `발송 업체(${provider}) 연동이 아직 완료되지 않았어요.`
  );
}

export function channelLabel(channel) {
  switch (channel) {
    case "LMS":
      return "장문문자(LMS)";
    case "ALIMTALK":
      return "카카오 알림톡";
    default:
      return "단문문자(SMS)";
  }
}
