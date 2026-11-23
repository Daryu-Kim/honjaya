function backoffSeconds(attempts) {
  return Math.min(2 ** Math.max(attempts, 1) * 5, 300);
}

function errorText(error) {
  if (!error) {
    return "unknown error";
  }

  const message = error instanceof Error ? error.message : String(error);

  return message.slice(0, 2000);
}

/**
 * PostgreSQL 기반 작업 큐. Redis 를 두지 않기 위해 for update skip locked 로 1건씩 집어갑니다.
 * 봇은 1개 인스턴스 전제(동시성 1)이며, 늘리더라도 SKIP LOCKED 덕분에 중복 실행은 없습니다.
 */
export function createJobQueue({ pool, log }) {
  return {
    async enqueue({ kind, payload = {}, maxAttempts = 5, runAfter = null, createdBy = "system", dedupe = false }) {
      if (dedupe) {
        const existing = await pool.query(
          `select id from public.discord_jobs
            where kind = $1 and status = 'QUEUED'
            order by created_at asc
            limit 1`,
          [kind],
        );

        if (existing.rowCount > 0) {
          return { id: existing.rows[0].id, deduped: true };
        }
      }

      const { rows } = await pool.query(
        `insert into public.discord_jobs (kind, payload, max_attempts, run_after, created_by)
         values ($1, $2::jsonb, $3, coalesce($4::timestamptz, now()), $5)
         returning *`,
        [kind, JSON.stringify(payload), maxAttempts, runAfter, createdBy],
      );

      log?.info?.("job enqueued", { jobId: rows[0].id, kind });

      return { id: rows[0].id, deduped: false };
    },

    async claim() {
      const { rows } = await pool.query(
        `with next as (
           select id from public.discord_jobs
            where status = 'QUEUED' and run_after <= now()
            order by run_after asc, created_at asc
            limit 1
            for update skip locked
         )
         update public.discord_jobs j
            set status = 'RUNNING',
                attempts = j.attempts + 1,
                locked_at = now(),
                started_at = coalesce(j.started_at, now()),
                last_error = null
           from next
          where j.id = next.id
          returning j.*`,
      );

      return rows[0] ?? null;
    },

    async succeed(id, result = null) {
      await pool.query(
        `update public.discord_jobs
            set status = 'SUCCEEDED', finished_at = now(), locked_at = null, result = $2::jsonb
          where id = $1`,
        [id, result === null ? null : JSON.stringify(result)],
      );
    },

    async fail(job, error, { retry = true } = {}) {
      const attempts = Number(job.attempts) || 0;
      const max = Number(job.max_attempts) || 1;
      const willRetry = retry && attempts < max;
      const delay = backoffSeconds(attempts);

      await pool.query(
        `update public.discord_jobs
            set status = $2,
                locked_at = null,
                last_error = $3,
                finished_at = case when $2 = 'FAILED' then now() else null end,
                run_after = case when $2 = 'QUEUED' then now() + ($4 || ' seconds')::interval else run_after end
          where id = $1`,
        [job.id, willRetry ? "QUEUED" : "FAILED", errorText(error), String(delay)],
      );

      if (willRetry) {
        log?.warn?.("job will retry", { jobId: job.id, kind: job.kind, attempts, delay });
      } else {
        log?.error?.("job failed permanently", { jobId: job.id, kind: job.kind, attempts });
      }

      return willRetry;
    },

    async requeueStale(maxAgeMinutes = 10) {
      const { rowCount } = await pool.query(
        `update public.discord_jobs
            set status = 'QUEUED', locked_at = null
          where status = 'RUNNING'
            and locked_at is not null
            and locked_at < now() - ($1 || ' minutes')::interval`,
        [String(maxAgeMinutes)],
      );

      if (rowCount > 0) {
        log?.warn?.("stale jobs requeued", { count: rowCount });
      }

      return rowCount;
    },

    async depth() {
      const { rows } = await pool.query(
        `select status, count(*)::int as count
           from public.discord_jobs
          where status in ('QUEUED', 'RUNNING')
          group by status`,
      );

      const out = { QUEUED: 0, RUNNING: 0 };

      for (const row of rows) {
        out[row.status] = row.count;
      }

      return out;
    },
  };
}

export function startJobWorker({ queue, log, handlers, pollMs = 3000 }) {
  let stopped = false;
  let running = false;
  let sleepTimer = null;
  let wakeUp = null;

  const sleep = (ms) =>
    new Promise((resolve) => {
      wakeUp = resolve;
      sleepTimer = setTimeout(() => {
        sleepTimer = null;
        wakeUp = null;
        resolve();
      }, ms);
    });

  async function runOne() {
    const job = await queue.claim();

    if (!job) {
      return false;
    }

    const handler = handlers[job.kind];

    if (!handler) {
      await queue.fail(job, new Error(`unknown job kind: ${job.kind}`), { retry: false });

      return true;
    }

    log.info("job started", { jobId: job.id, kind: job.kind, attempts: job.attempts });

    try {
      const result = await handler(job);

      await queue.succeed(job.id, result ?? null);
      log.info("job succeeded", { jobId: job.id, kind: job.kind });
    } catch (error) {
      log.error("job threw", { jobId: job.id, kind: job.kind, err: error });
      await queue.fail(job, error);
    }

    return true;
  }

  async function loop() {
    running = true;
    log.info("job worker started", { pollMs, kinds: Object.keys(handlers) });

    while (!stopped) {
      let worked = false;

      try {
        worked = await runOne();
      } catch (error) {
        log.error("job worker poll error", { err: error });
      }

      if (!worked && !stopped) {
        await sleep(pollMs);
      }
    }

    running = false;
    log.info("job worker stopped");
  }

  const done = loop();

  return {
    get running() {
      return running;
    },
    async stop() {
      stopped = true;

      if (wakeUp) {
        const resolve = wakeUp;

        wakeUp = null;

        if (sleepTimer) {
          clearTimeout(sleepTimer);
          sleepTimer = null;
        }

        resolve();
      }

      await done.catch(() => {});
    },
  };
}
