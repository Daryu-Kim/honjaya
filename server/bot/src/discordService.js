import { Client, GatewayIntentBits } from "discord.js";

import { config } from "./config.js";
import { summarizeStructure, readStructure } from "./structure.js";

export function isDiscordConfigured() {
  return Boolean(config.discord.token && config.discord.guildId);
}

/**
 * 게이트웨이 연결과 길드 접근을 담당합니다.
 * 토큰이 없으면 로그인하지 않고 configured:false 상태로 남습니다( compose 재시작 루프 방지 ).
 */
export function createDiscordService({ pool, log }) {
  const state = {
    configured: isDiscordConfigured(),
    ready: false,
    loginAt: null,
    lastReadyAt: null,
    lastError: null,
    guildId: config.discord.guildId || null,
  };

  const client = new Client({
    // GUILD_MEMBERS 만 privileged 입니다. Developer Portal 에서 반드시 켜야 합니다(켜지 않으면 4014 로 종료).
    // MESSAGE_CONTENT / GUILD_PRESENCES 는 쓰지 않습니다.
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    rest: { retries: 3, timeout: 15_000 },
  });

  let handlersAttached = false;

  client.on("debug", (message) => log.debug("discord debug", { message }));
  client.on("warn", (message) => log.warn("discord gateway warn", { message }));
  client.on("error", (error) => {
    state.lastError = error?.message ?? String(error);
    log.error("discord client error", { err: error });
  });
  client.on("shardDisconnect", (event) => {
    state.ready = false;
    log.warn("discord shard disconnected", { code: event?.code ?? null });
  });
  client.on("shardReconnecting", () => {
    log.warn("discord shard reconnecting");
  });

  async function requireGuild() {
    if (!state.configured) {
      throw new Error("Discord 봇이 설정되지 않았습니다(DISCORD_BOT_TOKEN / DISCORD_GUILD_ID).");
    }

    const cached = client.guilds.cache.get(config.discord.guildId);

    if (cached) {
      return cached;
    }

    const guild = await client.guilds.fetch(config.discord.guildId);

    if (!guild) {
      throw new Error("관리할 길드를 찾을 수 없습니다. 봇이 서버에 초대되었는지 확인해 주세요.");
    }

    return guild;
  }

  async function upsertGuild(guild) {
    const botMember = guild.members.me;

    await pool.query(
      `insert into public.discord_guilds (id, name, icon_url, owner_user_id, bot_role_id, member_count, last_seen_at)
       values ($1, $2, $3, $4, $5, $6, now())
       on conflict (id) do update
          set name = excluded.name,
              icon_url = excluded.icon_url,
              owner_user_id = excluded.owner_user_id,
              bot_role_id = excluded.bot_role_id,
              member_count = excluded.member_count,
              last_seen_at = now()`,
      [
        guild.id,
        guild.name ?? "",
        guild.iconURL({ extension: "png", size: 128 }) ?? "",
        guild.ownerId ?? "",
        botMember?.roles?.botRole?.id ?? "",
        guild.memberCount ?? null,
      ],
    );
  }

  function describe() {
    const guild = state.configured ? client.guilds.cache.get(config.discord.guildId) ?? null : null;
    const me = guild?.members?.me ?? null;

    return {
      configured: state.configured,
      ready: state.ready,
      loginAt: state.loginAt,
      lastReadyAt: state.lastReadyAt,
      lastError: state.lastError,
      pingMs: state.ready ? client.ws.ping : null,
      uptimeSec: Math.round(process.uptime()),
      user: client.user
        ? { id: client.user.id, tag: client.user.tag, avatarUrl: client.user.displayAvatarURL({ size: 128 }) }
        : null,
      guild: guild
        ? {
            id: guild.id,
            name: guild.name,
            iconUrl: guild.iconURL({ extension: "png", size: 128 }) ?? null,
            ownerId: guild.ownerId,
            memberCount: guild.memberCount ?? null,
            channelCount: guild.channels.cache.size,
            roleCount: guild.roles.cache.size,
          }
        : null,
      botPermissions: me ? me.permissions.bitfield.toString() : null,
      guildId: config.discord.guildId || null,
    };
  }

  async function getStructureSummary() {
    const guild = await requireGuild();
    const structure = await readStructure(guild, log);

    return summarizeStructure(structure);
  }

  /** ready/interaction 핸들러를 붙입니다. index.js 가 부팅 시 1회 호출합니다. */
  function attachHandlers({ onReady, onInteraction }) {
    if (handlersAttached) {
      return;
    }

    handlersAttached = true;

    let readyHandled = false;

    const handleReady = async () => {
      if (readyHandled) {
        return;
      }

      readyHandled = true;
      state.ready = true;
      state.lastReadyAt = new Date().toISOString();
      state.lastError = null;
      log.info("discord ready", { user: client.user?.tag ?? null, guildId: config.discord.guildId });

      try {
        await onReady?.();
      } catch (error) {
        log.error("discord ready hook failed", { err: error });
      }
    };

    // discord.js 14.22+ 는 clientReady 를 쓰고, 그 이전 이름은 ready 입니다.
    client.on("clientReady", handleReady);
    client.on("ready", handleReady);

    client.on("interactionCreate", async (interaction) => {
      try {
        await onInteraction?.(interaction);
      } catch (error) {
        log.error("interaction handler failed", { err: error });
      }
    });
  }

  async function start() {
    if (!state.configured) {
      log.warn("discord disabled: missing token or guild id", {
        hasToken: Boolean(config.discord.token),
        hasGuildId: Boolean(config.discord.guildId),
      });

      return false;
    }

    state.loginAt = new Date().toISOString();

    try {
      await client.login(config.discord.token);

      return true;
    } catch (error) {
      state.lastError = error?.message ?? String(error);
      log.error("discord login failed", { err: error });

      return false;
    }
  }

  async function stop() {
    if (client.isReady() || state.loginAt) {
      await client.destroy().catch(() => {});
    }

    state.ready = false;
  }

  return {
    client,
    state,
    attachHandlers,
    describe,
    getStructureSummary,
    requireGuild,
    start,
    stop,
    upsertGuild,
  };
}
