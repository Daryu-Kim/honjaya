import { config } from "../config.js";
import { createListener } from "../db.js";
import { EVENT_TABLES } from "../tables.js";

const clients = new Set();

let listener = null;
let reconnectTimer = null;
let stopping = false;

function broadcast(payload) {
  if (clients.size === 0) {
    return;
  }

  let table = "";

  try {
    table = String(JSON.parse(payload).table || "");
  } catch {
    table = "";
  }

  const frame = `event: change\ndata: ${payload}\n\n`;

  for (const client of clients) {
    if (client.filter && !client.filter.has(table)) {
      continue;
    }

    client.write(frame);
  }
}

async function connect(log) {
  if (stopping) {
    return;
  }

  try {
    listener = await createListener();
    await listener.query("listen honjaya_events");

    listener.on("notification", (message) => {
      if (message.channel === "honjaya_events" && message.payload) {
        broadcast(message.payload);
      }
    });

    listener.on("end", () => {
      listener = null;
      scheduleReconnect(log, "listener ended");
    });

    listener.on("error", (error) => {
      log?.warn?.(`[events] listener error: ${error.message}`);
      listener = null;
      scheduleReconnect(log, error.message);
    });

    log?.info?.("[events] LISTEN honjaya_events 시작");
  } catch (error) {
    log?.error?.(`[events] 연결 실패: ${error.message}`);
    scheduleReconnect(log, error.message);
  }
}

function scheduleReconnect(log, reason) {
  if (stopping || reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect(log);
  }, 3000);

  log?.warn?.(`[events] 3초 후 재연결합니다 (${reason})`);
}

export function registerEventRoutes(app, log) {
  app.get("/api/events", (request, reply) => {
    const raw = reply.raw;
    const requested = String(request.query?.tables || "")
      .split(",")
      .map((name) => name.trim())
      .filter((name) => EVENT_TABLES.includes(name));

    const filter = requested.length > 0 ? new Set(requested) : null;
    const origin = request.headers.origin;

    reply.hijack();
    raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": origin && !config.corsOrigins.includes("*")
        ? origin
        : "*",
    });
    raw.write("retry: 3000\n\n");
    raw.write("event: ready\ndata: {}\n\n");

    const client = {
      filter,
      write(chunk) {
        try {
          raw.write(chunk);
        } catch {
          clients.delete(client);
        }
      },
    };

    clients.add(client);

    const heartbeat = setInterval(() => client.write(": ping\n\n"), 25_000);

    // IncomingMessage emits 'close' immediately for bodyless GETs — watch the response socket instead.
    raw.on("close", () => {
      clearInterval(heartbeat);
      clients.delete(client);
    });
  });
}

export async function startEventBroadcast(log) {
  await connect(log);
}

export async function stopEventBroadcast() {
  stopping = true;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  for (const client of clients) {
    client.write("event: shutdown\ndata: {}\n\n");
  }

  clients.clear();

  if (listener) {
    const current = listener;

    listener = null;

    try {
      await current.query("unlisten honjaya_events");
      await current.end();
    } catch {
      // 종료 중 오류는 무시합니다.
    }
  }
}
