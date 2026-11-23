// 봇 컨테이너(내부 HTTP) 호출 클라이언트.
//
// DISCORD_BOT_TOKEN 은 이 컨테이너에 없습니다. bot 컨테이너가 유일한 보관자이고,
// 여기서는 compose 내부 주소(bot:4100)로 요청을 넘기기만 합니다.
import { Readable } from "node:stream";

import { config } from "./config.js";
import { HttpError } from "./http/errors.js";

function requireToken() {
  if (!config.discord.internalToken) {
    throw new HttpError(
      503,
      "HJ503",
      "Discord 봇 내부 토큰(BOT_INTERNAL_TOKEN)이 설정되지 않았어요.",
    );
  }
}

/** 봇 오류 본문 → HttpError. discordCode 는 화면이 원인을 구분할 때 씁니다. */
function botError(response, payload) {
  return new HttpError(
    response.status >= 500 ? 502 : response.status,
    "HJ_BOT",
    payload?.message || "Discord 봇이 요청을 처리하지 못했어요.",
    {
      discordCode: Number(payload?.discordCode) || null,
      error: payload?.error ?? null,
    },
  );
}

export async function callBot({ method = "GET", path, body = null, log }) {
  requireToken();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.discord.timeoutMs);
  const base = config.discord.botUrl.replace(/\/+$/, "");

  try {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        "x-internal-token": config.discord.internalToken,
      },
      body: body === null ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    let payload = null;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { message: text.slice(0, 500) };
      }
    }

    if (!response.ok) {
      log?.warn?.("bot responded with error", { path, status: response.status });

      throw botError(response, payload);
    }

    return payload;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    if (error?.name === "AbortError") {
      throw new HttpError(
        504,
        "HJ504",
        "Discord 봇 응답이 너무 늦어요. 잠시 후 다시 시도해 주세요.",
      );
    }

    log?.error?.("bot call failed", { path, err: error });

    throw new HttpError(
      503,
      "HJ503",
      "Discord 봇에 연결할 수 없어요. 봇 컨테이너가 실행 중인지 확인해 주세요.",
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 봇이 내려주는 암호화 백업 파일을 그대로 흘려보냅니다.
 * 본문은 복호화 키가 없으면 쓸모가 없으므로 api 는 내용을 검사하지 않고 통과시킵니다.
 */
export async function callBotStream({ path, log }) {
  requireToken();

  // 헤더 수신까지만 제한합니다(다운로드 자체는 파일 크기만큼 걸릴 수 있음).
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Math.max(config.discord.timeoutMs, 60_000),
  );
  const base = config.discord.botUrl.replace(/\/+$/, "");

  let response;

  try {
    response = await fetch(`${base}${path}`, {
      headers: { "x-internal-token": config.discord.internalToken },
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new HttpError(
        504,
        "HJ504",
        "Discord 봇 응답이 너무 늦어요. 잠시 후 다시 시도해 주세요.",
      );
    }

    log?.error?.("bot stream call failed", { path, err: error });

    throw new HttpError(
      503,
      "HJ503",
      "Discord 봇에 연결할 수 없어요. 봇 컨테이너가 실행 중인지 확인해 주세요.",
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let message = "Discord 봇이 파일을 내려주지 못했어요.";

    if (text) {
      try {
        message = JSON.parse(text)?.message || message;
      } catch {
        message = text.slice(0, 200);
      }
    }

    throw new HttpError(response.status >= 500 ? 502 : response.status, "HJ_BOT", message);
  }

  if (!response.body) {
    throw new HttpError(502, "HJ_BOT", "Discord 봇이 빈 응답을 보냈어요.");
  }

  return {
    stream: Readable.fromWeb(response.body),
    contentType: response.headers.get("content-type") || "application/octet-stream",
    contentLength: response.headers.get("content-length"),
    disposition: response.headers.get("content-disposition"),
  };
}
