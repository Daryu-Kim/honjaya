// 매장 테이블 마스터(bar_tables) 접근 도우미.
//
// 주문서(order_sheets)는 손님이 입장한 테이블에만 생기므로, "빈 테이블까지" 보여주려면
// 이 마스터 표를 기준으로 화면을 그려야 합니다.
//
// 읽기는 공개 경로(/rest/v1/bar_tables)를 쓰고,
// 수정은 권한 검사를 거치는 관리자 API(/api/admin/tables/:number)로만 합니다.
import { apiPatch } from "./api";
import { fetchList, subscribeTable } from "./supabase";

export const TABLE_ZONES = {
  BAR: "바",
  LARGE: "큰 테이블",
};

export function zoneLabel(zone) {
  return TABLE_ZONES[String(zone || "").toUpperCase()] || "테이블";
}

// 마스터 표시 이름. displayName 이 비어 있으면 구역에 맞는 기본 이름을 만듭니다.
export function tableLabelOf(table) {
  const custom = String(table?.displayName || "").trim();

  if (custom) {
    return custom;
  }

  const number = Number(table?.tableNumber ?? 0);

  return String(table?.zone || "").toUpperCase() === "BAR"
    ? `바 ${number}`
    : `${number}번 테이블`;
}

export async function fetchTableMaster() {
  const rows = await fetchList("barTables", {
    order: ["sortOrder", "asc"],
    limit: 500,
  });

  return [...rows].sort((a, b) => {
    const sortDiff = Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0);

    return sortDiff !== 0
      ? sortDiff
      : Number(a.tableNumber ?? 0) - Number(b.tableNumber ?? 0);
  });
}

export function subscribeTableMaster(reload) {
  return subscribeTable("barTables", reload);
}

export async function updateTableMaster(tableNumber, payload) {
  const result = await apiPatch(`/api/admin/tables/${tableNumber}`, payload);

  return result?.table || null;
}
