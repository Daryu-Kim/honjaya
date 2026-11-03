// 매장 영업일은 한국 시간(KST) 오후 3시에 시작해 다음 날 오전 4시에 끝납니다.
// 하루 집계 구간은 KST 15:00:00 ~ 익일 14:59:59 입니다.
export const BUSINESS_DAY_START_HOUR = 15;
export const BUSINESS_DAY_END_HOUR = 4;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function formatInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// KST 기준 연/월/일/시(0~23)를 돌려줍니다.
function getKstParts(date) {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
  };
}

// KST 연/월/일/시를 실제 시각(Date)으로 바꿉니다. 한국은 서머타임이 없습니다.
function toKstInstant(year, month, day, hour = 0) {
  return new Date(Date.UTC(year, month, day, hour - 9, 0, 0, 0));
}

// 영업일 기준 연/월/일(오후 3시 이전이면 전날)을 돌려줍니다.
function getBusinessDateParts(date = new Date()) {
  const { year, month, day, hour } = getKstParts(date);

  if (hour >= BUSINESS_DAY_START_HOUR) {
    return { year, month, day };
  }

  const previousDay = new Date(Date.UTC(year, month, day) - DAY_MS);

  return {
    year: previousDay.getUTCFullYear(),
    month: previousDay.getUTCMonth(),
    day: previousDay.getUTCDate(),
  };
}

// 날짜 표시용: 로컬 연/월/일이 곧 영업일 날짜인 Date를 돌려줍니다.
export function getBusinessDate(date = new Date()) {
  const { year, month, day } = getBusinessDateParts(date);

  return new Date(year, month, day, 0, 0, 0, 0);
}

export function getCurrentBusinessDateInput(date = new Date()) {
  return formatInputDate(getBusinessDate(date));
}

export function getBusinessDayStart(date = new Date()) {
  const { year, month, day } = getBusinessDateParts(date);

  return toKstInstant(year, month, day, BUSINESS_DAY_START_HOUR);
}

// ISO 문자열(UTC) 형태의 영업일 시작 시각. Supabase 조회 조건에 씁니다.
export function getBusinessDayStartIso(date = new Date()) {
  return getBusinessDayStart(date).toISOString();
}

export function getBusinessWeekStart(date = new Date()) {
  const { year, month, day } = getBusinessDateParts(date);
  const weekday = new Date(Date.UTC(year, month, day)).getUTCDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  const monday = new Date(Date.UTC(year, month, day) + diff * DAY_MS);

  return toKstInstant(
    monday.getUTCFullYear(),
    monday.getUTCMonth(),
    monday.getUTCDate(),
    BUSINESS_DAY_START_HOUR
  );
}

export function getBusinessMonthStart(date = new Date()) {
  const { year, month } = getBusinessDateParts(date);

  return toKstInstant(year, month, 1, BUSINESS_DAY_START_HOUR);
}

export function parseBusinessDateStart(dateText) {
  if (!dateText) return null;

  const [year, month, day] = dateText.split("-").map(Number);
  if (!year || !month || !day) return null;

  return toKstInstant(year, month - 1, day, BUSINESS_DAY_START_HOUR);
}

export function parseBusinessDateEnd(dateText) {
  const start = parseBusinessDateStart(dateText);
  if (!start) return null;

  return new Date(start.getTime() + DAY_MS - 1);
}
