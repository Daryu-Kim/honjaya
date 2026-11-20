import { HttpError } from "./http/errors.js";

// REST 계층이 노출하는 테이블 화이트리스트. supabase/schema.sql 과 맞춰 관리합니다.
export const TABLES = {
  app_settings: { pk: "id" },
  active_order_sheets: { pk: "id" },
  bar_tables: { pk: "table_number", readOnly: true },
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

// 읽기 전용 표(마스터 데이터)는 /rest/v1 으로 쓰지 못하게 막습니다.
// 수정은 권한 검사를 거치는 /api/admin/* 로만 합니다.
export function assertWritable(name, meta) {
  if (meta.readOnly) {
    throw new HttpError(
      403,
      "HJ403",
      `읽기 전용 테이블이에요: ${name} (관리자 API 로 수정하세요)`
    );
  }
}
