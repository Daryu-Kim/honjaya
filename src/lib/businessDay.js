export const BUSINESS_DAY_START_HOUR = 19;

export function formatInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getBusinessDate(date = new Date()) {
  const businessDate = new Date(date);

  if (businessDate.getHours() < BUSINESS_DAY_START_HOUR) {
    businessDate.setDate(businessDate.getDate() - 1);
  }

  return businessDate;
}

export function getCurrentBusinessDateInput(date = new Date()) {
  return formatInputDate(getBusinessDate(date));
}

export function getBusinessDayStart(date = new Date()) {
  const businessDate = getBusinessDate(date);
  return new Date(
    businessDate.getFullYear(),
    businessDate.getMonth(),
    businessDate.getDate(),
    BUSINESS_DAY_START_HOUR,
    0,
    0,
    0
  );
}

export function getBusinessWeekStart(date = new Date()) {
  const businessDate = getBusinessDate(date);
  const day = businessDate.getDay();
  const diff = day === 0 ? -6 : 1 - day;

  businessDate.setDate(businessDate.getDate() + diff);

  return new Date(
    businessDate.getFullYear(),
    businessDate.getMonth(),
    businessDate.getDate(),
    BUSINESS_DAY_START_HOUR,
    0,
    0,
    0
  );
}

export function getBusinessMonthStart(date = new Date()) {
  const businessDate = getBusinessDate(date);

  return new Date(
    businessDate.getFullYear(),
    businessDate.getMonth(),
    1,
    BUSINESS_DAY_START_HOUR,
    0,
    0,
    0
  );
}

export function parseBusinessDateStart(dateText) {
  if (!dateText) return null;

  const [year, month, day] = dateText.split("-").map(Number);
  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day, BUSINESS_DAY_START_HOUR, 0, 0, 0);
}

export function parseBusinessDateEnd(dateText) {
  const start = parseBusinessDateStart(dateText);
  if (!start) return null;

  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setMilliseconds(end.getMilliseconds() - 1);
  return end;
}
