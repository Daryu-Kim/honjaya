// P12C — 스냅샷 두 개(structures)를 비교합니다.
//
// structure 는 server/bot/src/structure.js 가 만든 JSON 한 덩어리이고,
// 스냅샷은 그대로 discord_snapshots.structure 에 저장됩니다.
// 여기서는 id 기준으로 추가/삭제/변경을 뽑아 화면이 바로 그릴 수 있게 만듭니다.

function canonical(value) {
  if (value === null || value === undefined) {
    return "null";
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }

  if (typeof value === "object") {
    const keys = Object.keys(value).sort();

    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }

  return JSON.stringify(value);
}

function displayName(entity) {
  return entity?.name ?? entity?.typeName ?? entity?.id ?? "(이름 없음)";
}

function categoryLabel(channel) {
  const type = channel?.typeName ?? "";

  if (type === "GuildCategory") return "카테고리";
  if (type === "GuildVoice" || type === "GuildStageVoice") return "음성";
  if (type === "GuildForum") return "포럼";
  if (type === "GuildAnnouncement") return "공지";
  if (type === "GuildDirectory") return "디렉터리";
  if (type === "GuildMedia") return "미디어";

  return "텍스트";
}

function diffFieldSets(before, after, ignore = []) {
  const skip = new Set(["id", ...ignore]);
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const fields = [];

  for (const key of [...keys].sort()) {
    if (skip.has(key)) {
      continue;
    }

    const beforeValue = before?.[key] ?? null;
    const afterValue = after?.[key] ?? null;

    if (canonical(beforeValue) !== canonical(afterValue)) {
      fields.push({ key, before: beforeValue, after: afterValue });
    }
  }

  return fields;
}

function diffEntityList(beforeList = [], afterList = [], { ignore = [] } = {}) {
  const beforeById = new Map(beforeList.map((item) => [item.id, item]));
  const afterById = new Map(afterList.map((item) => [item.id, item]));

  const added = [];
  const removed = [];
  const changed = [];

  for (const [id, item] of afterById) {
    if (!beforeById.has(id)) {
      added.push({ id, name: displayName(item) });
    }
  }

  for (const [id, item] of beforeById) {
    if (!afterById.has(id)) {
      removed.push({ id, name: displayName(item) });
    }
  }

  for (const [id, beforeItem] of beforeById) {
    const afterItem = afterById.get(id);

    if (!afterItem) {
      continue;
    }

    const fields = diffFieldSets(beforeItem, afterItem, ignore);

    if (fields.length > 0) {
      changed.push({ id, name: displayName(afterItem), fields });
    }
  }

  const byName = (a, b) => a.name.localeCompare(b.name);

  return {
    added: added.sort(byName),
    removed: removed.sort(byName),
    changed: changed.sort(byName),
    counts: {
      added: added.length,
      removed: removed.length,
      changed: changed.length,
    },
  };
}

/**
 * @param {object} before 스냅샷 structure (과거)
 * @param {object} after  스냅샷 structure (최근)
 */
export function diffStructures(before, after) {
  const beforeStructure = before ?? {};
  const afterStructure = after ?? {};

  const guild = diffFieldSets(beforeStructure.guild, afterStructure.guild);

  // permissionOverwrites / colors 는 객체 안에 또 들어 있어 값 비교만으로 충분합니다.
  const roles = diffEntityList(beforeStructure.roles, afterStructure.roles, { ignore: ["iconUrl"] });
  const channels = diffEntityList(beforeStructure.channels, afterStructure.channels, {
    ignore: ["iconUrl"],
  });
  const emojis = diffEntityList(beforeStructure.emojis, afterStructure.emojis);
  const stickers = diffEntityList(beforeStructure.stickers, afterStructure.stickers);
  const autoModeration = diffEntityList(beforeStructure.autoModeration, afterStructure.autoModeration);
  const scheduledEvents = diffEntityList(
    beforeStructure.scheduledEvents,
    afterStructure.scheduledEvents,
  );

  const counts = {
    guild: guild.length,
    roles: roles.counts,
    channels: channels.counts,
    emojis: emojis.counts,
    stickers: stickers.counts,
    autoModeration: autoModeration.counts,
    scheduledEvents: scheduledEvents.counts,
  };

  const totalChanges =
    counts.guild +
    counts.roles.added +
    counts.roles.removed +
    counts.roles.changed +
    counts.channels.added +
    counts.channels.removed +
    counts.channels.changed +
    counts.emojis.added +
    counts.emojis.removed +
    counts.emojis.changed +
    counts.stickers.added +
    counts.stickers.removed +
    counts.stickers.changed +
    counts.autoModeration.added +
    counts.autoModeration.removed +
    counts.autoModeration.changed +
    counts.scheduledEvents.added +
    counts.scheduledEvents.removed +
    counts.scheduledEvents.changed;

  return {
    same: totalChanges === 0,
    totalChanges,
    guild,
    roles,
    channels,
    channelKinds: Object.fromEntries(
      (afterStructure.channels ?? []).map((channel) => [channel.id, categoryLabel(channel)]),
    ),
    emojis,
    stickers,
    autoModeration,
    scheduledEvents,
  };
}
