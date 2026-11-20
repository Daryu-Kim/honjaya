// 영업일 계산. 15:00(KST) 에 영업일이 넘어갑니다. src/lib/businessDay.js 와 같은 규칙입니다.
const BUSINESS_DAY_START_HOUR = 15;

export function toBusinessDate(date = new Date()) {
  const kst = new Date(
    (date instanceof Date ? date.getTime() : Date.now()) + 9 * 60 * 60 * 1000
  );

  if (kst.getUTCHours() < BUSINESS_DAY_START_HOUR) {
    kst.setUTCDate(kst.getUTCDate() - 1);
  }

  return kst.toISOString().slice(0, 10);
}
