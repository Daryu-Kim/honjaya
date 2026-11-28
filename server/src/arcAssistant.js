// P14N — 응급안전관리센터 「ARC 비서」 브리핑.
//
// 최윤희(ARC 대표·RN)가 매일 아침 한 화면만 보면 오늘·이번 주에 놓치면 안 되는 일을
// 바로 알 수 있도록, 이미 있는 도메인 요약들을 모아 "할 일 카드"로 정리합니다.
//   * 새 테이블을 만들지 않습니다. 기존 요약 함수의 결과만 재사용합니다.
//   * 카드마다 원본 화면 링크(link)를 달아 클릭 한 번으로 처리하게 합니다.
//   * 사장 보고용 3줄 요약을 함께 만듭니다.
import { pool } from "./db.js";
import { arcDashboardSummary } from "./arc.js";
import { arcEventSummary } from "./arcEvents.js";
import { arcExpenseSummary } from "./arcExpense.js";
import { arcQualitySummary } from "./arcQuality.js";
import { listArcRoutine } from "./arcRoutine.js";
import { arcStockSummary } from "./arcStock.js";
import { arcTrainingSummary } from "./arcTraining.js";
import { arcUsageSummary } from "./arcUsage.js";

const SEOUL_TIME_ZONE = "Asia/Seoul";

/** KST 기준 오늘 날짜(YYYY-MM-DD)·월(YYYY-MM). */
function todayKst() {
  const now = new Date();
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  return { today: iso, period: iso.slice(0, 7) };
}

function won(amount) {
  return `${Number(amount ?? 0).toLocaleString("ko-KR")}원`;
}

/**
 * 동의서·실사처럼 요약 함수가 따로 없는 항목은 여기서 한 번에 셉니다.
 * (개인정보가 없는 건수만 조회합니다.)
 */
async function loadComplianceCounts(period) {
  const { rows } = await pool.query(
    `select
        (select count(*)::int from public.arc_consents
          where status = 'PENDING') as consent_pending,
        (select count(*)::int from public.arc_consents
          where status = 'ACTIVE'
            and retention_until is not null
            and retention_until <= current_date + 30) as consent_expiring,
        (select count(*)::int from public.arc_consents
          where status = 'ACTIVE'
            and retention_until is not null
            and retention_until < current_date) as consent_expired,
        (select count(*)::int from public.arc_sensitive_access
          where status = 'PENDING') as access_pending,
        (select status from public.arc_stocktakes where period = $1) as stocktake_status,
        (select count(*)::int from public.arc_stocktake_items t
           join public.arc_stocktakes s on s.id = t.stocktake_id
          where s.period = $1 and t.counted_qty is null) as stocktake_uncounted`,
    [period]
  );

  const row = rows[0] ?? {};

  return {
    consentPending: Number(row.consent_pending ?? 0),
    consentExpiring: Number(row.consent_expiring ?? 0),
    consentExpired: Number(row.consent_expired ?? 0),
    accessPending: Number(row.access_pending ?? 0),
    stocktakeStatus: row.stocktake_status ?? null,
    stocktakeUncounted: Number(row.stocktake_uncounted ?? 0),
  };
}

function card({ key, priority, title, detail, count = 0, unit = "건", link, action }) {
  return { key, priority, title, detail, count, unit, link, action };
}

/**
 * ARC 비서 브리핑.
 * @param {{ employee?: object|null }} options
 */
export async function arcAssistantBriefing({ employee = null } = {}) {
  const { today, period } = todayKst();

  const [routine, stock, usage, expense, quality, events, training, dashboard, counts] =
    await Promise.all([
      listArcRoutine({ period }),
      arcStockSummary({ employee }),
      arcUsageSummary(),
      arcExpenseSummary(),
      arcQualitySummary(5),
      arcEventSummary(6),
      arcTrainingSummary({ period }),
      arcDashboardSummary(employee?.id ?? null),
      loadComplianceCounts(period),
    ]);

  const cards = [];

  // ── 1) 기한이 지난 루틴 (가장 급함) ────────────────────────────────
  const overdueSteps = routine.steps.filter((step) => step.state === "OVERDUE");

  if (overdueSteps.length) {
    cards.push(
      card({
        key: "routine-overdue",
        priority: "P0",
        title: "기한이 지난 월간 루틴",
        detail: overdueSteps.map((step) => `${step.title}(${step.windowLabel})`).join(" · "),
        count: overdueSteps.length,
        link: "/admin/arc/routine",
        action: "루틴 열기",
      })
    );
  }

  // ── 2) 지금 진행해야 하는 루틴 ──────────────────────────────────────
  const activeSteps = routine.steps.filter((step) => step.state === "ACTIVE");

  if (activeSteps.length) {
    cards.push(
      card({
        key: "routine-active",
        priority: "P1",
        title: "오늘 처리할 루틴",
        detail: activeSteps
          .map(
            (step) =>
              `${step.title} — ${step.windowLabel} · 체크 ${step.checkedCount}/${step.items.length}`
          )
          .join(" · "),
        count: activeSteps.length,
        link: "/admin/arc/routine",
        action: "체크하기",
      })
    );
  }

  // ── 3) 상세 건강기록 열람 승인 대기(사장 요청) ──────────────────────
  if (counts.accessPending > 0) {
    cards.push(
      card({
        key: "access-pending",
        priority: "P0",
        title: "사장 열람 요청 검토 대기",
        detail: "사유·증빙을 읽고 승인 여부를 정해 주세요. 승인 전에는 기록이 열리지 않습니다.",
        count: counts.accessPending,
        link: "/admin/arc/access",
        action: "요청 검토",
      })
    );
  }

  // ── 4) 유효기간·개봉 후 기한 ────────────────────────────────────────
  if (stock.expired > 0 || stock.openedOverdue > 0) {
    cards.push(
      card({
        key: "stock-overdue",
        priority: "P0",
        title: "사용금지·교체 대상 품목",
        detail: `유효기간 경과 ${stock.expired}건 · 개봉 후 기한 초과 ${stock.openedOverdue}건. 즉시 분리하고 '사용금지' 표시 후 교체하세요.`,
        count: stock.expired + stock.openedOverdue,
        link: "/admin/arc/stock",
        action: "재고 확인",
      })
    );
  }

  if (stock.expiring7 > 0) {
    cards.push(
      card({
        key: "stock-expiring7",
        priority: "P1",
        title: "7일 안에 만료되는 품목",
        detail: "이번 주 안에 교체·보충 목록에 올려 주세요(90일/30일 교체 목록과 함께 정리).",
        count: stock.expiring7,
        link: "/admin/arc/stock",
        action: "교체 목록",
      })
    );
  }

  // ── 5) 기준수량 미달·재고 부족 ──────────────────────────────────────
  if (stock.belowBaseline > 0 || stock.lowStock > 0) {
    cards.push(
      card({
        key: "stock-low",
        priority: "P1",
        title: "기준수량 미달·재고 부족",
        detail: `기준수량 미달 ${stock.belowBaseline}건 · 재고 부족 ${stock.lowStock}건. 보충·구매 등록으로 이어 주세요.`,
        count: Math.max(stock.belowBaseline, stock.lowStock),
        link: "/admin/arc/purchases",
        action: "보충 등록",
      })
    );
  }

  // ── 6) 월 1회 실사 ──────────────────────────────────────────────────
  if (!counts.stocktakeStatus) {
    cards.push(
      card({
        key: "stocktake-missing",
        priority: "P1",
        title: `${period} 실사 미등록`,
        detail: "이번 달 실사를 아직 시작하지 않았어요. 실사 시작을 누르면 품목 목록이 자동으로 채워집니다.",
        link: "/admin/arc/stocktakes",
        action: "실사 시작",
      })
    );
  } else if (counts.stocktakeStatus === "DRAFT") {
    cards.push(
      card({
        key: "stocktake-draft",
        priority: "P1",
        title: `${period} 실사 마무리 필요`,
        detail:
          counts.stocktakeUncounted > 0
            ? `아직 세지 않은 품목 ${counts.stocktakeUncounted}건이 있어요. 수량을 채우고 확정해 주세요.`
            : "수량 입력이 끝났어요. 실사 확정을 눌러 차이를 반영해 주세요.",
        count: counts.stocktakeUncounted,
        unit: "개",
        link: "/admin/arc/stocktakes",
        action: "실사 확정",
      })
    );
  }

  // ── 7) 개인 상비약 월 점검(본인 확인) ───────────────────────────────
  if (stock.myOtcDue > 0) {
    cards.push(
      card({
        key: "otc-due",
        priority: "P1",
        title: "개인 상비약 미확인",
        detail: "본인 상비약 원포장·유효기간을 확인하고 월 점검을 남겨 주세요.",
        count: stock.myOtcDue,
        link: "/admin/arc/otc",
        action: "점검 등록",
      })
    );
  }

  // ── 8) 사용대장 → 실비정산 연결 ─────────────────────────────────────
  if (usage.unbilledCount > 0 || expense.openCount > 0 || expense.overdueCount > 0) {
    cards.push(
      card({
        key: "billing-open",
        priority: "P1",
        title: "정산 대기(사용대장·실비)",
        detail: `청구 미연결 사용 ${usage.unbilledCount}건(${won(
          usage.unbilledAmount
        )}) · 미정산 실비 ${expense.openCount}건(${won(expense.openAmount)})${
          expense.overdueCount > 0 ? ` · 기한 초과 ${expense.overdueCount}건` : ""
        }`,
        count: usage.unbilledCount + expense.openCount,
        link: "/admin/arc/expenses",
        action: "정산하기",
      })
    );
  }

  // ── 9) 이번 달 교육·상황연습 ────────────────────────────────────────
  if (training.total === 0) {
    cards.push(
      card({
        key: "training-missing",
        priority: "P1",
        title: `${period} 교육 미등록`,
        detail: "월간 OT·정기교육 계획을 세우고 교육자료(프린트)를 함께 준비해 주세요.",
        link: "/admin/arc/training",
        action: "교육 등록",
      })
    );
  } else if (training.planned > 0) {
    cards.push(
      card({
        key: "training-planned",
        priority: "P2",
        title: "예정된 교육·상황연습",
        detail: `계획만 있고 아직 완료되지 않은 교육 ${training.planned}건이 있어요.`,
        count: training.planned,
        link: "/admin/arc/training",
        action: "일정 확인",
      })
    );
  }

  if (training.followups.length > 0) {
    cards.push(
      card({
        key: "training-followup",
        priority: "P1",
        title: "보수교육·재응시 대상",
        detail: training.followups
          .slice(0, 5)
          .map(
            (row) =>
              `${row.employeeName}(${row.sessionNo || row.title}${
                row.makeupDueOn ? ` · 보충기한 ${row.makeupDueOn}` : ""
              })`
          )
          .join(" · "),
        count: training.followups.length,
        link: "/admin/arc/training",
        action: "보수교육 잡기",
      })
    );
  }

  // ── 10) 동의서 ──────────────────────────────────────────────────────
  if (counts.consentPending > 0) {
    cards.push(
      card({
        key: "consent-pending",
        priority: "P1",
        title: "동의 확인 대기",
        detail: "종이 동의서 서명을 받은 뒤 '동의 확인'을 눌러야 효력이 생깁니다.",
        count: counts.consentPending,
        link: "/admin/arc/consents",
        action: "동의 확인",
      })
    );
  }

  if (counts.consentExpiring > 0) {
    cards.push(
      card({
        key: "consent-expiring",
        priority: "P2",
        title: "보존기간 만료 예정 동의서",
        detail: `30일 안에 보존기간이 끝나는 동의서 ${counts.consentExpiring}건${
          counts.consentExpired > 0 ? ` (이미 만료 ${counts.consentExpired}건)` : ""
        }. 파기·연장 여부를 정해 주세요.`,
        count: counts.consentExpiring,
        link: "/admin/arc/consents",
        action: "동의서 관리",
      })
    );
  }

  // ── 11) 사건 접수·응급기록 ──────────────────────────────────────────
  if (quality.reviewPending > 0) {
    cards.push(
      card({
        key: "incident-review",
        priority: "P1",
        title: "종결 사건 사후검토 미작성",
        detail: "종결된 사건은 사후검토(REVIEW)를 남겨야 품질 기록이 완성됩니다.",
        count: quality.reviewPending,
        link: "/admin/arc/quality",
        action: "사후검토 작성",
      })
    );
  }

  if (quality.overdueActions > 0) {
    cards.push(
      card({
        key: "quality-action",
        priority: "P0",
        title: "기한 지난 개선조치",
        detail: quality.overdueActionList
          .slice(0, 4)
          .map((row) => `${row.recordNo || row.title} — ${row.action}(${row.dueOn})`)
          .join(" · "),
        count: quality.overdueActions,
        link: "/admin/arc/quality",
        action: "조치 완료",
      })
    );
  }

  // ── 12) 행사·의료지원 ───────────────────────────────────────────────
  if (events.thisWeek > 0 || events.scopeMissing > 0 || events.noticeMissing > 0) {
    const parts = [];

    if (events.thisWeek > 0) parts.push(`이번 주 행사 ${events.thisWeek}건`);
    if (events.scopeMissing > 0) parts.push(`사전합의 누락 ${events.scopeMissing}건`);
    if (events.noticeMissing > 0) parts.push(`외부의료인 고지 누락 ${events.noticeMissing}건`);

    cards.push(
      card({
        key: "event-briefing",
        priority: events.thisWeek > 0 ? "P1" : "P2",
        title: "행사·의료지원 준비",
        detail: `${parts.join(" · ")}. 행사 전 브리핑(동선·연락·장비)을 확인해 주세요.`,
        count: events.thisWeek,
        link: "/admin/arc/events",
        action: "행사 확인",
      })
    );
  }

  // ── 13) 알림 미확인 ─────────────────────────────────────────────────
  if (dashboard.unreadNotifications > 0) {
    cards.push(
      card({
        key: "notifications",
        priority: "P2",
        title: "확인하지 않은 알림",
        detail: "새 알림을 확인해 주세요.",
        count: dashboard.unreadNotifications,
        link: "/admin/arc",
        action: "알림 보기",
      })
    );
  }

  // ── 14) 필수 설정 누락 ──────────────────────────────────────────────
  if (!dashboard.fieldKeyConfigured) {
    cards.push(
      card({
        key: "settings-key",
        priority: "P2",
        title: "암호화 키 미설정",
        detail: "상세 건강기록·동의서 암호화에 필요한 키가 아직 없습니다. 서버 환경변수를 확인하세요.",
        link: "/admin/arc/settings",
        action: "설정 확인",
      })
    );
  }

  const priorityRank = { P0: 0, P1: 1, P2: 2 };
  const sorted = cards.sort(
    (a, b) => priorityRank[a.priority] - priorityRank[b.priority] || a.title.localeCompare(b.title)
  );

  const p0 = sorted.filter((item) => item.priority === "P0");
  const p1 = sorted.filter((item) => item.priority === "P1");

  return {
    today,
    period,
    employee: employee ? { name: employee.name, title: employee.title ?? "" } : null,
    cards: sorted,
    counts: {
      p0: p0.length,
      p1: p1.length,
      p2: sorted.length - p0.length - p1.length,
      total: sorted.length,
    },
    routine: {
      period: routine.period,
      todayDay: routine.today.day,
      done: routine.progress.done,
      total: routine.progress.total,
      percent: routine.progress.percent,
      overdue: overdueSteps.length,
      active: activeSteps.map((step) => ({
        key: step.key,
        title: step.title,
        windowLabel: step.windowLabel,
        link: step.link,
        checkedCount: step.checkedCount,
        itemCount: step.items.length,
        requiresSignature: step.requiresSignature,
      })),
      next: routine.steps
        .filter((step) => step.state === "UPCOMING")
        .slice(0, 3)
        .map((step) => ({
          key: step.key,
          title: step.title,
          windowLabel: step.windowLabel,
          link: step.link,
        })),
    },
    // 사장 보고용 3줄 요약 — 그대로 복사해서 보고에 쓸 수 있게 만듭니다.
    briefing: [
      `[${period} ARC] 월간 루틴 ${routine.progress.done}/${routine.progress.total}건 완료(${routine.progress.percent}%)${
        overdueSteps.length ? `, 기한 초과 ${overdueSteps.length}건` : ""
      }`,
      `즉시 조치 ${p0.length}건${
        p0.length ? ` — ${p0.map((item) => item.title).join(", ")}` : " 없음"
      }`,
      `이번 주 확인 ${p1.length}건${
        p1.length ? ` — ${p1.map((item) => item.title).join(", ")}` : " 없음"
      }`,
    ],
  };
}
