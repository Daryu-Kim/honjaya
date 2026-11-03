// Supabase Edge Function: send-chat-push
//
// Called by the chat_messages AFTER INSERT trigger (patch-007) through pg_net.
// Scoping rules mirror src/lib/chat.js:
//   global        -> every subscribed table except the sender
//   staff_<t>     -> table <t>, only for staff (ADMIN) replies
//   dm_<a>_<b>    -> both tables except the sender
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CHAT_URL = "/user/chat";
const BODY_LIMIT = 120;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:honjaya@example.com";

type PushRow = {
  id: string;
  table_number: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type ChatMessage = {
  id: string;
  message: string;
  message_type: string;
  table_number: string;
  nickname: string;
  sender_label: string;
  is_deleted: boolean;
  room_type: string;
  room_key: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function normalizeTableNumber(value: unknown) {
  const digits = String(value ?? "").replace(/[^0-9]/g, "");

  return digits ? String(Number(digits)) : "";
}

function roomTitle(message: ChatMessage) {
  if (message.room_type === "GLOBAL") {
    return "전체 채팅";
  }

  if (message.room_type === "STAFF") {
    return "직원 채팅";
  }

  return "1:1 채팅";
}

// The trigger ships the row itself because pg_net can call this function
// before the insert transaction commits.
function readInlineMessage(record: unknown): ChatMessage | null {
  if (!record || typeof record !== "object") {
    return null;
  }

  const row = record as Record<string, unknown>;
  const id = String(row.id ?? "").trim();

  if (!id) {
    return null;
  }

  return {
    id,
    message: String(row.message ?? ""),
    message_type: String(row.message_type ?? "USER"),
    table_number: String(row.table_number ?? ""),
    nickname: String(row.nickname ?? ""),
    sender_label: String(row.sender_label ?? ""),
    is_deleted: row.is_deleted === true,
    room_type: String(row.room_type ?? "GLOBAL"),
    room_key: String(row.room_key ?? "global"),
  };
}

function resolveTargets(message: ChatMessage): Set<string> {
  const targets = new Set<string>();
  const sender = normalizeTableNumber(message.table_number);

  if (message.room_type === "STAFF") {
    const match = /^staff_(\d+)$/.exec(message.room_key);

    // Customer messages stay in the staff room: staff use the tablet, not push.
    if (match && message.message_type === "ADMIN") {
      targets.add(normalizeTableNumber(match[1]));
    }

    return targets;
  }

  const direct = /^dm_(\d+)_(\d+)$/.exec(message.room_key);

  if (direct) {
    for (const table of direct.slice(1)) {
      const normalized = normalizeTableNumber(table);

      if (normalized && normalized !== sender) {
        targets.add(normalized);
      }
    }
  }

  return targets;
}

function buildPayload(message: ChatMessage) {
  const senderName = String(message.sender_label || message.nickname || "").trim();
  const title = senderName
    ? `${senderName} · ${roomTitle(message)}`
    : roomTitle(message);
  const text = String(message.message || "").replace(/\s+/g, " ").trim();

  return {
    title,
    body:
      text.length > BODY_LIMIT
        ? `${text.slice(0, BODY_LIMIT)}…`
        : text || "새 메시지가 도착했어요.",
    url: CHAT_URL,
    tag: `honjaya-${message.room_key || "global"}`,
    vibrate: [80, 40, 80],
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "missing_supabase_env" }, 500);
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return jsonResponse({ error: "missing_vapid_env" }, 500);
  }

  let messageId = "";
  let inlineMessage: ChatMessage | null = null;

  try {
    const body = await request.json();
    messageId = String(body?.messageId || body?.record?.id || "").trim();
    inlineMessage = readInlineMessage(body?.record);
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  if (!messageId) {
    return jsonResponse({ error: "missing_message_id" }, 400);
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let chatMessage = inlineMessage;

  if (!chatMessage) {
    const { data: message, error: messageError } = await supabase
      .from("chat_messages")
      .select(
        "id, message, message_type, table_number, nickname, sender_label, is_deleted, room_type, room_key"
      )
      .eq("id", messageId)
      .maybeSingle();

    if (messageError) {
      return jsonResponse(
        { error: "message_lookup_failed", detail: messageError.message },
        500
      );
    }

    chatMessage = readInlineMessage(message);
  }

  if (!chatMessage || chatMessage.is_deleted) {
    return jsonResponse({ skipped: "message_not_found_or_deleted" });
  }

  const target = chatMessage;
  const sender = normalizeTableNumber(target.table_number);
  const targets = resolveTargets(target);

  if (targets.size === 0 && target.room_type !== "GLOBAL") {
    return jsonResponse({ skipped: "no_targets" });
  }

  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from("push_subscriptions")
    .select("id, table_number, endpoint, p256dh, auth");

  if (subscriptionsError) {
    return jsonResponse(
      { error: "subscription_lookup_failed", detail: subscriptionsError.message },
      500
    );
  }

  const rows = (subscriptions || []) as PushRow[];
  const recipients = rows.filter((row) => {
    const table = normalizeTableNumber(row.table_number);

    if (!table || table === sender) {
      return false;
    }

    return target.room_type === "GLOBAL" ? true : targets.has(table);
  });

  if (recipients.length === 0) {
    return jsonResponse({ skipped: "no_subscribers", targets: [...targets] });
  }

  const payload = JSON.stringify(buildPayload(target));
  const staleIds: string[] = [];
  let sent = 0;

  await Promise.all(
    recipients.map(async (row) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          payload,
          { TTL: 600, urgency: "high" }
        );
        sent += 1;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;

        if (statusCode === 404 || statusCode === 410) {
          staleIds.push(row.id);
        } else {
          console.error(
            "[send-chat-push] delivery failed",
            statusCode,
            (error as Error).message
          );
        }
      }
    })
  );

  if (staleIds.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", staleIds);
  }

  return jsonResponse({
    sent,
    failed: recipients.length - sent,
    pruned: staleIds.length,
  });
});
