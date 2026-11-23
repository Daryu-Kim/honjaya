// 최소 cron 파서. 의존성을 늘리지 않기 위해 5필드 표준 cron 만 지원합니다.
//   분 시 일 월 요일   예) "0 5 * * *" = 매일 05:00
// 컨테이너 TZ=Asia/Seoul 이므로 로컬 시간 기준으로 계산합니다.

const FIELD_SPECS = [
  { name: "분", min: 0, max: 59 },
  { name: "시", min: 0, max: 23 },
  { name: "일", min: 1, max: 31 },
  { name: "월", min: 1, max: 12 },
  { name: "요일", min: 0, max: 6 },
];

const DOW_ALIASES = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

function parseToken(token, spec) {
  const lower = token.toLowerCase();

  if (Object.prototype.hasOwnProperty.call(DOW_ALIASES, lower)) {
    return DOW_ALIASES[lower];
  }

  // 요일은 7 을 일요일로 쓰는 표기가 흔합니다.
  let value = Number(lower);

  if (!Number.isInteger(value)) {
    throw new Error(`${spec.name} 필드에 숫자가 아닌 값이 있습니다: ${token}`);
  }

  if (spec.name === "요일" && value === 7) {
    value = 0;
  }

  if (value < spec.min || value > spec.max) {
    throw new Error(`${spec.name} 필드는 ${spec.min}~${spec.max} 범위여야 합니다: ${token}`);
  }

  return value;
}

function expandField(field, spec) {
  const out = new Set();

  for (const chunk of String(field).split(",")) {
    const part = chunk.trim();

    if (!part) {
      throw new Error(`${spec.name} 필드가 비어 있습니다.`);
    }

    const [rangeText, stepText] = part.split("/");
    const step = stepText === undefined ? 1 : Number(stepText);

    if (!Number.isInteger(step) || step < 1) {
      throw new Error(`${spec.name} 필드의 간격이 올바르지 않습니다: ${part}`);
    }

    let start;
    let end;

    if (rangeText === "*") {
      start = spec.min;
      end = spec.max;
    } else if (rangeText.includes("-")) {
      const [from, to] = rangeText.split("-");

      start = parseToken(from, spec);
      end = parseToken(to, spec);
    } else {
      start = parseToken(rangeText, spec);
      end = stepText === undefined ? start : spec.max;
    }

    if (start > end) {
      throw new Error(`${spec.name} 필드의 범위가 뒤집혔습니다: ${part}`);
    }

    for (let value = start; value <= end; value += step) {
      out.add(value);
    }
  }

  return out;
}

export function parseCron(expression) {
  const fields = String(expression ?? "").trim().split(/\s+/);

  if (fields.length !== 5) {
    throw new Error("cron 식은 '분 시 일 월 요일' 5개 필드여야 합니다. 예) 0 5 * * *");
  }

  const [minute, hour, dom, month, dow] = fields.map((field, index) =>
    expandField(field, FIELD_SPECS[index]),
  );

  return {
    expression: fields.join(" "),
    minute,
    hour,
    month,
    dom,
    dow,
    domRestricted: fields[2] !== "*",
    dowRestricted: fields[4] !== "*",
  };
}

function matchesDay(schedule, date) {
  if (!schedule.month.has(date.getMonth() + 1)) {
    return false;
  }

  const domHit = schedule.dom.has(date.getDate());
  const dowHit = schedule.dow.has(date.getDay());

  // 표준 cron: 일·요일 중 하나만 제한하면 그 필드만 보고,
  // 둘 다 제한하면 둘 중 하나만 맞아도 실행합니다.
  if (schedule.domRestricted && schedule.dowRestricted) {
    return domHit || dowHit;
  }

  if (schedule.domRestricted) {
    return domHit;
  }

  if (schedule.dowRestricted) {
    return dowHit;
  }

  return true;
}

/** from 다음으로 cron 이 가리키는 시각을 반환합니다. 1년 안에 없으면 null. */
export function nextCronTime(expression, from = new Date()) {
  const schedule = parseCron(expression);

  const cursor = new Date(from.getTime());

  cursor.setSeconds(0, 0);

  let candidate = new Date(cursor.getTime() + 60_000);
  const maxMinutes = 366 * 24 * 60;

  for (let step = 0; step < maxMinutes; step += 1) {
    if (
      schedule.minute.has(candidate.getMinutes()) &&
      schedule.hour.has(candidate.getHours()) &&
      matchesDay(schedule, candidate)
    ) {
      return candidate;
    }

    candidate = new Date(candidate.getTime() + 60_000);
  }

  return null;
}

export function isValidCron(expression) {
  try {
    parseCron(expression);

    return true;
  } catch {
    return false;
  }
}
