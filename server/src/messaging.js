// P7 — 문자/알림톡 발송 어댑터.
//
// 손님은 카카오 계정이 없어도 됩니다. 발송은 사업자(가게)가 계약한 발송 업체 API 로 나가고,
// 알림톡은 업체가 카카오 비즈채널과 발신 프로필을 대신 관리해 줍니다.
//
// MESSAGING_PROVIDER:
//   dryrun  (기본값) 실제로 보내지 않고 성공 응답만 흉내 냅니다. 문구/대상 검수용.
//   none    발송 기능을 끕니다(캠페인은 만들 수 있지만 send 는 503).
//   solapi  솔라피(SOLAPI) — SOLAPI_API_KEY / SOLAPI_API_SECRET / MESSAGING_SENDER 를 넣으면 켜집니다.
//           지금은 문자(SMS/LMS)만 실제 발송되고, 알림톡은 템플릿 승인 전까지 막혀 있습니다.
import { createHmac, randomBytes } from "node:crypto";

import { config } from "./config.js";
import { HttpError } from "./http/errors.js";

const PROVIDERS = new Set(["dryrun", "none", "solapi"]);

const SOLAPI_BASE_URL = "https://api.solapi.com";
const SOLAPI_TIMEOUT_MS = 10000;

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

// 솔라피 HMAC-SHA256 인증 헤더: signature = HMAC(secret, date + salt)
function buildSolapiAuthorization(apiKey, apiSecret) {
  const salt = randomBytes(16).toString("hex");
  const date = new Date().toISOString();
  const signature = createHmac("sha256", apiSecret)
    .update(date + salt)
    .digest("hex");

  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

// 솔라피는 EUC-KR 기준 90바이트까지 SMS, 2000바이트까지 LMS로 접수합니다.
function resolveSolapiType(text) {
  const bytes = [...String(text || "")].reduce(
    (total, char) => total + (char.charCodeAt(0) > 0x7f ? 2 : 1),
    0
  );

  if (bytes <= 90) return "SMS";

  if (bytes <= 2000) return "LMS";

  throw new HttpError(
    400,
    "HJ400",
    "문자 본문이 너무 길어요. 2000바이트까지만 보낼 수 있어요."
  );
}

async function sendViaSolapi({ phone, text, title, channel }) {
  const apiKey = String(config.messaging?.solapiApiKey || "");
  const apiSecret = String(config.messaging?.solapiApiSecret || "");
  const sender = normalizePhone(messagingSender());

  if (!apiKey || !apiSecret) {
    throw new HttpError(
      503,
      "HJ503",
      "발송 업체 키가 설정되지 않았어요. 관리자에게 문의해 주세요."
    );
  }

  if (!sender) {
    throw new HttpError(
      503,
      "HJ503",
      "발신번호(MESSAGING_SENDER)가 설정되지 않았어요. 관리자에게 문의해 주세요."
    );
  }

  // 알림톡은 사전에 승인된 템플릿으로만 발송할 수 있어 템플릿 등록 전까지는 막습니다.
  if (String(channel || "").toUpperCase() === "ALIMTALK") {
    throw new HttpError(
      503,
      "HJ503",
      "카카오 알림톡 템플릿이 아직 등록되지 않았어요. 지금은 문자(SMS/LMS)로 발송해 주세요."
    );
  }

  const type = resolveSolapiType(text);
  const message = {
    to: phone,
    from: sender,
    text: String(text || ""),
    type,
  };

  const subject = String(title || "").trim();

  if (type === "LMS" && subject) {
    message.subject = subject;
  }

  let response;

  try {
    response = await fetch(`${SOLAPI_BASE_URL}/messages/v4/send`, {
      method: "POST",
      headers: {
        Authorization: buildSolapiAuthorization(apiKey, apiSecret),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(SOLAPI_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("[messaging] 솔라피 통신 실패:", error?.name || error);

    throw new HttpError(
      502,
      "HJ502",
      "발송 업체와 통신하지 못했어요. 잠시 후 다시 시도해 주세요."
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const reason =
      data?.statusMessage || data?.errorMessage || `HTTP ${response.status}`;

    console.error("[messaging] 솔라피 발송 거절:", response.status, reason);

    throw new HttpError(
      502,
      "HJ502",
      `발송 업체가 접수를 거절했어요: ${reason}`
    );
  }

  const messageId = String(data?.messageId || data?.groupId || "");

  return {
    id: messageId ? `solapi-${messageId}` : `solapi-${Date.now().toString(36)}`,
    provider: "solapi",
  };
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

  return sendViaSolapi({ phone, text, title, channel });
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
