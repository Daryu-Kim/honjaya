import { hashStructure, readStructure, summarizeStructure } from "./structure.js";

export async function captureSnapshot({ pool, guild, reason = "MANUAL", createdBy = "system", log }) {
  const structure = await readStructure(guild, log);
  const structureHash = hashStructure(structure);
  const summary = summarizeStructure(structure);

  const { rows } = await pool.query(
    `insert into public.discord_snapshots
       (guild_id, reason, structure, structure_hash, channel_count, role_count, member_count, created_by)
     values ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)
     returning id, guild_id, reason, structure_hash, channel_count, role_count, member_count, created_by, captured_at`,
    [
      guild.id,
      reason,
      JSON.stringify(structure),
      structureHash,
      summary.channels,
      summary.roles,
      guild.memberCount ?? null,
      createdBy,
    ],
  );

  log?.info?.("snapshot captured", {
    snapshotId: rows[0].id,
    guildId: guild.id,
    roles: summary.roles,
    channels: summary.channels,
  });

  return { snapshot: rows[0], summary };
}

export function registerSnapshotJob(handlers, deps) {
  handlers.SNAPSHOT = async (job) => {
    const guild = await deps.requireGuild();
    const { snapshot, summary } = await captureSnapshot({
      pool: deps.pool,
      guild,
      reason: job.payload?.reason ?? "MANUAL",
      createdBy: job.payload?.createdBy ?? job.created_by ?? "system",
      log: deps.log,
    });

    return {
      snapshotId: snapshot.id,
      structureHash: snapshot.structure_hash,
      roles: summary.roles,
      channels: summary.channels,
    };
  };
}
