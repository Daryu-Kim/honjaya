import { pool } from "../db.js";

// 주문서 번호 발급: 예전에는 브라우저에서 read → upsert → CAS 를 반복했지만,
// 서버에서는 한 번의 원자적 UPDATE ... RETURNING 으로 처리합니다.
const RESERVE_SEQUENCE_SQL = `
insert into public.counters (id, last_sequence_no, updated_at)
values ($1, 1, now())
on conflict (id) do update
   set last_sequence_no = public.counters.last_sequence_no + 1,
       updated_at = now()
returning last_sequence_no
`;

export function registerRpcRoutes(app) {
  app.get("/health", async () => {
    const started = Date.now();
    const { rows } = await pool.query("select now() as now");

    return {
      ok: true,
      db: "up",
      dbTime: rows[0].now,
      latencyMs: Date.now() - started,
      uptimeSec: Math.round(process.uptime()),
    };
  });

  app.post("/api/rpc/reserve-sequence", async (request) => {
    const body = request.body || {};
    const counterId = String(body.counterId || body.counter_id || "orderSheet").trim() || "orderSheet";
    const { rows } = await pool.query(RESERVE_SEQUENCE_SQL, [counterId]);

    return { counterId, lastSequenceNo: rows[0].last_sequence_no };
  });
}
