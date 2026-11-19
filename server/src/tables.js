import { HttpError } from "./http/errors.js";

// REST 계층이 노출하는 테이블 화이트리스트. supabase/schema.sql 과 맞춰 관리합니다.
export const TABLES = {
  app_settings: { pk: "id" },
  active_order_sheets: { pk: "id" },
  categories: { pk: "id" },
  counters: { pk: "id" },
  order_sheets: { pk: "id" },
  orders: { pk: "id" },
  products: { pk: "id" },
};

export const EVENT_TABLES = Object.keys(TABLES);

export function tableMeta(name) {
  const meta = TABLES[name];

  if (!meta) {
    throw new HttpError(404, "PGRST205", `테이블을 찾을 수 없어요: ${name}`);
  }

  return meta;
}
