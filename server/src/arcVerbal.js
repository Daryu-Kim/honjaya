// P14O — ARC 대표(RN) 전용 구두테스트(정기·불시) 평가표.
//
// 성격
//   * 이 파일은 "최윤희가 실제로 들고 물어보는 평가표"입니다. 원문(AS-GDE-001 §15·§16,
//     AS-KIT-001 §06·§07)을 근거로 항목·판정기준·배점·이론적 근거·질문을 한 표에 담았습니다.
//   * 조회·수정은 ARC 대표(RN)만 가능합니다(라우트에서 requireDirector).
//   * 불시 테스트는 3~5분, 정기 테스트는 20분을 기준으로 나눠 배점을 조절합니다.
//
// 판정
//   수행(PERFORM) = 배점 100% · 부분수행(PARTIAL) = 배점 50% · 미수행(NONE) = 0점
//   총점 85% 이상 통과 / 70~85% 재평가(14일 내) / 70% 미만 재교육
//   '핵심(critical)' 항목을 하나라도 미수행하면 통과 불가(최대 재평가),
//   두 개 이상이면 재교육입니다. — 생명과 직결되는 항목은 부분 점수로 넘어가면 안 됩니다.

import { randomUUID } from "node:crypto";

import { pool } from "./db.js";
import { badRequest, HttpError } from "./http/errors.js";
import { createArcTrainingSession } from "./arcTraining.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const RESULTS = new Set(["PERFORM", "PARTIAL", "NONE"]);
const VERDICTS = new Set(["PENDING", "PASS", "RETAKE", "FAIL"]);
const RESULT_WEIGHT = { PERFORM: 1, PARTIAL: 0.5, NONE: 0 };

export const ARC_VERBAL_RESULTS = [
  { key: "PERFORM", label: "수행", weight: 1, desc: "도움 없이 정확하게 말하거나 시연했다." },
  {
    key: "PARTIAL",
    label: "부분수행",
    weight: 0.5,
    desc: "방향은 맞지만 순서·숫자·금지사항 중 일부를 놓쳤다. 유도 질문 후 고쳤다.",
  },
  { key: "NONE", label: "미수행", weight: 0, desc: "틀렸거나 답하지 못했고, 유도해도 고치지 못했다." },
];

export const ARC_VERBAL_VERDICT_RULES = {
  pass: 85,
  retake: 70,
  // 핵심 항목 미수행 허용 개수
  criticalNoneForRetake: 1,
  guide: [
    "85% 이상이면 통과입니다.",
    "70~85%는 14일 안에 다시 확인(재평가)합니다.",
    "70% 미만이거나 핵심 항목 미수행이 2개 이상이면 재교육 대상입니다.",
    "핵심 항목을 하나라도 못 하면 점수와 상관없이 통과할 수 없습니다.",
  ],
};

/**
 * 평가 섹션. points 는 정기 테스트(20분) 기준 배점입니다.
 * 불시 테스트는 critical 항목만 골라 3~5분 안에 확인합니다.
 */
export const ARC_VERBAL_SECTIONS = [
  {
    key: "SAFE",
    label: "1. 현장 안전 · 반응·호흡 확인",
    desc: "모든 상황의 첫 단계. 여기서 틀리면 뒤의 처치가 모두 위험해집니다.",
    minutes: 4,
    items: [
      {
        key: "hazard",
        label: "구조자 안전 먼저 확보",
        points: 5,
        critical: true,
        criteria: {
          perform: "깨진 유리·화기·전기·폭력·미끄럼 위험을 구체적으로 3가지 이상 말하고, 제거·차단 순서를 설명한다.",
          partial: "'안전 먼저'는 말하지만 어떤 위험을 어떻게 치울지 구체적으로 말하지 못한다.",
          none: "환자에게 바로 달려가겠다고 하거나, 위험 요소를 언급하지 못한다.",
        },
        basis:
          "구조자가 다치면 환자는 물론 다음 사람까지 위험해집니다. 감전·화재·폭력 현장에서는 접근 자체가 2차 사고가 됩니다.",
        ask: ["손님이 피를 흘리며 쓰러졌습니다. 문을 열자 바닥에 깨진 유리가 있습니다. 가장 먼저 무엇을 합니까?"],
        answer:
          "장갑을 끼고 미끄럼·유리를 치운 뒤 접근합니다. 감전이면 전원을 먼저 차단하고, 폭력 상황이면 119와 함께 거리를 둡니다.",
      },
      {
        key: "call_shoulder",
        label: "부르고 어깨 두드려 반응 확인",
        points: 5,
        critical: true,
        criteria: {
          perform: "'괜찮으세요?'라고 소리 내어 부르고 어깨를 두드린다고 정확히 말한다.",
          partial: "부르기는 하지만 '흔들어 깨운다'거나 '일으켜 세운다'처럼 위험한 표현이 섞인다.",
          none: "맥박부터 확인한다거나 손목을 잡는다고 답한다.",
        },
        basis:
          "반응 확인은 10초면 끝나고, 목·척추 손상이 의심될 때 흔들면 손상이 커질 수 있습니다. 맥박 확인은 일반인이 정확히 할 수 없어 권장되지 않습니다.",
        ask: ["반응 확인은 어떻게 하고, 왜 흔들면 안 됩니까?"],
        answer: "부르고 어깨를 두드립니다. 목·척추 손상 가능성이 있어 흔들면 손상이 악화될 수 있습니다.",
      },
      {
        key: "breath",
        label: "정상호흡 10초 판정 · 헐떡임 구분",
        points: 8,
        critical: true,
        criteria: {
          perform: "10초 동안 가슴을 보고, '헐떡임은 비정상호흡'이라고 명확히 말한다.",
          partial: "10초라는 시간은 말하지만 헐떡임을 정상호흡으로 오해한다.",
          none: "호흡 확인 시간을 모르거나, 헐떡임을 '숨 쉬고 있다'고 판단한다.",
        },
        basis:
          "심정지 직후에는 30초~1분 정도 드문드문 헐떡이는 호흡(agonal gasp)이 나옵니다. 이걸 정상호흡으로 보면 CPR 시작이 몇 분 늦어지고, 그만큼 생존율이 떨어집니다.",
        ask: ["쓰러진 사람이 5초에 한 번씩 '컥' 소리를 냅니다. 정상호흡입니까?"],
        answer: "아닙니다. 헐떡임은 비정상호흡이며 심정지로 보고 즉시 119 요청 후 가슴압박을 시작합니다.",
      },
      {
        key: "position",
        label: "의식저하자 자세 · 이동 금지",
        points: 6,
        criteria: {
          perform: "숨은 있지만 반응이 없으면 옆으로 눕혀 기도를 확보하고, 필요 없는 이동은 하지 않는다고 말한다.",
          partial: "옆으로 눕히기는 하지만 '베개를 베어 준다', '의자에 앉힌다' 등이 섞인다.",
          none: "일으켜 세우거나 물을 먹인다고 답한다.",
        },
        basis:
          "반응이 없으면 혀·분비물·구토물이 기도를 막습니다. 옆으로 눕히면 기도가 열리고, 억지로 앉히면 쓰러지며 머리를 다칠 수 있습니다.",
        ask: ["숨은 쉬는데 부르면 대답이 없습니다. 어떻게 눕힙니까?"],
        answer: "옆으로 눕혀(회복자세) 기도를 확보하고 119를 기다립니다. 물이나 약은 주지 않습니다.",
      },
      {
        key: "log_5w",
        label: "5하(누가·언제·어디서·무엇을·어떻게) 기록·인계",
        points: 6,
        criteria: {
          perform: "5하 항목을 모두 말하고, 인계 시각과 관찰한 변화를 함께 전달한다고 답한다.",
          partial: "3~4개만 말하거나 '메모한다' 수준에 그친다.",
          none: "기억에 의존한다고 하거나 기록 필요성을 말하지 못한다.",
        },
        basis:
          "119·병원 인계에서 시간 정보가 가장 중요합니다. '5분 전에 쓰러졌다'와 '20분 전'은 치료 방향을 바꿉니다.",
        ask: ["119에 무엇을 어떤 순서로 말합니까?"],
        answer:
          "위치(상호·층·출입구) → 환자 상태(의식·호흡) → 발견 시각과 변화 → 지금까지 한 처치 → 연락 가능한 번호 순으로 전달합니다.",
      },
    ],
  },
  {
    key: "CPR",
    label: "2. 심정지 · 가슴압박 · AED",
    desc: "생존율이 가장 크게 갈리는 구간입니다. 숫자(깊이·속도·비율)를 정확히 말해야 합니다.",
    minutes: 5,
    items: [
      {
        key: "start",
        label: "심정지 판단 즉시 압박 시작",
        points: 8,
        critical: true,
        criteria: {
          perform: "반응·정상호흡 없음 = 심정지로 보고, 119 요청과 가슴압박을 동시에 시작한다고 말한다.",
          partial: "압박은 말하지만 '맥박 확인 후'라거나 119 요청이 빠진다.",
          none: "물을 먹이거나 안아 올린다, 또는 판단을 미룬다.",
        },
        basis:
          "심정지 후 1분마다 생존율이 약 7~10%씩 떨어집니다. 일반인의 맥박 확인은 정확도가 낮아 권장되지 않습니다.",
        ask: ["언제 가슴압박을 시작합니까?"],
        answer: "반응이 없고 정상호흡이 없거나 헐떡이면 즉시 시작합니다. 맥박을 찾느라 미루지 않습니다.",
      },
      {
        key: "depth_rate",
        label: "압박 위치·깊이·속도",
        points: 8,
        critical: true,
        criteria: {
          perform: "가슴 중앙(손바닥 아래쪽), 깊이 5cm, 속도 분당 100~120회를 모두 정확히 말한다.",
          partial: "위치는 맞지만 숫자 하나를 틀리거나 말하지 못한다.",
          none: "숫자를 모르거나 '힘껏 빨리' 수준으로만 답한다.",
        },
        basis:
          "너무 얕으면 혈액이 뇌까지 가지 않고, 너무 빠르면 심장이 피로 채우지 못합니다. 5cm·100~120회가 가장 효과적인 구간입니다.",
        ask: ["깊이와 속도를 숫자로 말해 보세요."],
        answer: "가슴 중앙을 5cm 깊이로, 1분에 100~120회 속도로 누릅니다.",
      },
      {
        key: "recoil_change",
        label: "완전 이완 · 2분마다 교대",
        points: 6,
        criteria: {
          perform: "압박 뒤 가슴이 완전히 올라오게 하고, 2분마다 10초 안에 교대한다고 말한다.",
          partial: "교대는 말하지만 이완 개념이 빠지거나 교대 시간을 모른다.",
          none: "계속 한 사람이 한다고 하거나, 손을 뗀 채로 쉰다고 답한다.",
        },
        basis:
          "가슴이 완전히 돌아오지 않으면 심장에 피가 차지 않습니다. 2분이 지나면 압박의 질이 떨어져 교대가 필요합니다.",
        ask: ["왜 2분마다 사람을 바꿉니까?"],
        answer: "2분이 지나면 피로로 압박 깊이·속도가 떨어지기 때문입니다. 교대는 10초 안에 끝냅니다.",
      },
      {
        key: "aed",
        label: "AED 순서 · 분석 중 접촉 금지",
        points: 10,
        critical: true,
        criteria: {
          perform: "전원 → 패드 부착 → 분석 중 접촉 금지 → 충격 후 즉시 압박 재개 순서를 정확히 말한다.",
          partial: "순서는 대체로 맞지만 '분석 중 접촉 금지' 또는 '충격 후 압박 재개'가 빠진다.",
          none: "패드 위치를 모르거나 충격 후 무엇을 하는지 답하지 못한다.",
        },
        basis:
          "분석 중에 사람이 닿으면 기계가 심장 리듬을 잘못 읽어 충격을 못 하거나 엉뚱한 판단을 합니다. 충격 후 심장은 아직 스스로 뛰지 못하므로 압박을 다시 해야 합니다.",
        ask: ["AED가 '충격을 주세요'라고 합니다. 무엇을 확인하고 어떤 순서로 합니까?"],
        answer:
          "모두 떨어지라고 외우고 접촉이 없는지 눈으로 확인 → 충격 → 바로 가슴압박 재개(2분 후 재분석) 순서입니다.",
      },
      {
        key: "record_cpr",
        label: "압박 시작 시각·충격 횟수 기록",
        points: 5,
        criteria: {
          perform: "압박 시작 시각, 교대 횟수, 충격 횟수를 AS-CARE에 남긴다고 말한다.",
          partial: "'기록한다'만 말하고 무엇을 남기는지 구체적이지 않다.",
          none: "기록하지 않는다고 답한다.",
        },
        basis:
          "병원에서는 '목격 시각 → 압박 시작까지 걸린 시간'과 '충격 횟수'를 치료 판단에 씁니다.",
        ask: ["CPR 중에 무엇을 기록합니까?"],
        answer: "발견·압박 시작 시각, 2분 교대 횟수, AED 충격 횟수, 의식·호흡 변화입니다.",
      },
    ],
  },
  {
    key: "CHOKE",
    label: "3. 기도폐쇄 · 질식",
    desc: "부분 폐쇄와 심한 폐쇄를 구분하는 것이 핵심입니다. 잘못 구분하면 오히려 다치게 합니다.",
    minutes: 4,
    items: [
      {
        key: "judge",
        label: "부분 폐쇄 / 심한 폐쇄 구분",
        points: 10,
        critical: true,
        criteria: {
          perform: "말할 수 있고 기침이 나오면 부분 폐쇄(기침 유도·관찰), 말 못 하고 목을 잡으면 심한 폐쇄(즉시 119)로 구분한다.",
          partial: "구분은 하지만 부분 폐쇄에서 바로 등을 두드린다고 답한다.",
          none: "구분하지 못하고 무조건 등을 두드린다거나 물을 먹인다.",
        },
        basis:
          "부분 폐쇄에서 등을 두드리면 이물이 더 깊이 들어가 완전 폐쇄로 악화될 수 있습니다. 기침은 가장 강력한 자연 배출 기전입니다.",
        ask: ["손님이 기침을 하며 '목에 뭐가 걸렸다'고 말합니다. 어떻게 합니까?"],
        answer: "부분 폐쇄입니다. 기침을 계속하게 하고 옆에서 관찰하며, 악화되면 즉시 119입니다.",
      },
      {
        key: "back_abdomen",
        label: "등 두드리기 5회 → 복부 밀어내기 5회",
        points: 8,
        critical: true,
        criteria: {
          perform: "등 두드리기 5회와 복부 밀어내기 5회를 번갈아 반복한다고 정확히 말한다.",
          partial: "동작은 알지만 횟수를 틀리거나 한쪽만 말한다.",
          none: "복부 밀어내기를 모르거나 '가슴을 누른다'고 답한다.",
        },
        basis:
          "기침 반사와 압력 변화를 함께 쓰는 방식이 단일 방법보다 이물 배출 성공률이 높습니다. 횟수를 세는 이유는 세지 않으면 압력이 일정하지 않기 때문입니다.",
        ask: ["심한 폐쇄입니다. 정확히 몇 회씩 어떻게 반복합니까?"],
        answer: "등 두드리기 5회 → 복부 밀어내기 5회를 번갈아 반복하고, 의식을 잃으면 즉시 CPR로 전환합니다.",
      },
      {
        key: "special",
        label: "임신부·비만은 가슴 밀어내기",
        points: 6,
        criteria: {
          perform: "임신부·비만인 경우 복부 대신 가슴 밀어내기로 바꾼다고 말한다.",
          partial: "'가슴'이라는 말은 하지만 이유를 설명하지 못한다.",
          none: "임신부에게도 복부를 압박한다고 답한다.",
        },
        basis: "배를 누르면 태아와 장기 손상 위험이 있어, 같은 원리를 가슴 압박으로 대신합니다.",
        ask: ["임신 8개월 손님이 목에 걸렸습니다. 무엇이 달라집니까?"],
        answer: "복부 밀어내기 대신 가슴 밀어내기를 하고, 즉시 119를 요청합니다.",
      },
      {
        key: "after",
        label: "해소 후 관찰 · 의료평가 안내",
        points: 5,
        criteria: {
          perform: "이물이 빠져도 기침·쉰 목소리·이물감이 남으면 의료평가를 안내하고 기록한다고 말한다.",
          partial: "안내한다고만 하고 어떤 증상을 확인하는지 말하지 못한다.",
          none: "'빠졌으니 괜찮다'고 끝낸다.",
        },
        basis: "복부 밀어내기 자체로 내부 손상이 생길 수 있고, 남은 이물이 뒤늦게 문제를 일으킵니다.",
        ask: ["이물이 빠진 뒤 무엇을 확인합니까?"],
        answer: "쉰 목소리·지속 기침·가슴 통증·이물감을 확인하고, 있으면 병원 진료를 권합니다.",
      },
    ],
  },
  {
    key: "BLEED",
    label: "4. 출혈 · 상처 · 절단",
    desc: "유리·칼이 많은 공간이라 가장 자주 생기는 사고입니다. '거즈를 떼지 않는다'가 핵심입니다.",
    minutes: 4,
    items: [
      {
        key: "direct_pressure",
        label: "장갑 → 직접압박 유지",
        points: 10,
        critical: true,
        criteria: {
          perform: "장갑을 끼고 깨끗한 거즈로 강하게 직접 누르며, 피가 비쳐도 거즈를 떼지 않고 위에 덧댄다고 말한다.",
          partial: "압박은 말하지만 '피를 확인하려고 거즈를 든다'고 답한다.",
          none: "상처를 물로 씻은 뒤 지혈대를 감는다고 답한다.",
        },
        basis:
          "거즈를 떼면 방금 만들어진 혈전이 함께 떨어져 출혈이 다시 시작됩니다. 직접압박은 일반인이 할 수 있는 가장 효과적인 지혈법입니다.",
        ask: ["손에서 피가 계속 납니다. 거즈가 빨갛게 젖었습니다. 갈아 줍니까?"],
        answer: "갈지 않고 그 위에 새 거즈를 덧대어 계속 누릅니다. 지혈대는 최후의 수단이며 일반인이 임의로 쓰지 않습니다.",
      },
      {
        key: "handover_119",
        label: "119 판단 기준",
        points: 6,
        criteria: {
          perform: "출혈이 10분 이상 멈추지 않을 때, 뿜어져 나올 때, 깊은 상처일 때 119를 부른다고 말한다.",
          partial: "119 필요성은 알지만 기준을 구체적으로 말하지 못한다.",
          none: "'병원 가면 된다'고만 답한다.",
        },
        basis: "동맥 출혈은 압박만으로 멈추지 않을 수 있고, 내부 손상은 겉으로 보이지 않습니다.",
        ask: ["언제 119를 부릅니까?"],
        answer: "10분 이상 지혈되지 않거나, 피가 뿜어지거나, 깊은 상처·이물이 박힌 경우 즉시 119입니다.",
      },
      {
        key: "amputation",
        label: "부분 절단 · 조직 보관",
        points: 6,
        critical: true,
        criteria: {
          perform: "떼어내지 않고 지속 압박 → 즉시 119 → 조직은 얼음에 직접 대지 않고 밀봉해 서늘하게 보관한다고 말한다.",
          partial: "119는 말하지만 조직을 얼음에 직접 넣는다고 답한다.",
          none: "남은 조직을 당겨 떼어낸다거나 버린다고 답한다.",
        },
        basis: "조직을 얼음에 직접 대면 냉동 손상으로 재접합 가능성이 떨어집니다. 간접 냉각이 정답입니다.",
        ask: ["손가락 끝이 부분적으로 잘렸습니다. 떨어진 조직은 어떻게 합니까?"],
        answer: "떨어진 조직을 거즈로 싸서 비닐에 밀봉하고, 얼음물이 담긴 통에 담아(직접 접촉 금지) 119와 함께 병원으로 갑니다.",
      },
      {
        key: "impaled",
        label: "박힌 이물 제거 금지",
        points: 5,
        critical: true,
        criteria: {
          perform: "박힌 칼·큰 유리·깊은 이물은 빼지 않고 주변을 고정해 119를 부른다고 말한다.",
          partial: "빼지 않는다는 건 알지만 고정·119 언급이 빠진다.",
          none: "바로 빼서 소독한다고 답한다.",
        },
        basis: "이물이 혈관을 막아 지혈 역할을 하고 있을 수 있습니다. 빼는 순간 큰 출혈이 시작됩니다.",
        ask: ["손님 손바닥에 유리 조각이 박혀 있습니다. 빼야 합니까?"],
        answer: "빼지 않습니다. 주변을 패드로 고정하고 119를 부릅니다.",
      },
    ],
  },
  {
    key: "BURN",
    label: "5. 화상 · 눈 · 화학물질",
    desc: "주방·바 운영과 직결됩니다. '무엇을 바르지 않는가'를 정확히 아는 것이 핵심입니다.",
    minutes: 4,
    items: [
      {
        key: "cool",
        label: "흐르는 시원한 물 15~20분",
        points: 8,
        critical: true,
        criteria: {
          perform: "흐르는 시원한 물로 15~20분 식히고, 얼음·기름·연고·치약은 바르지 않는다고 말한다.",
          partial: "물로 식힌다고는 하지만 시간이 짧거나 얼음을 쓴다고 답한다.",
          none: "된장·치약·소주를 바르거나 물집을 터뜨린다고 답한다.",
        },
        basis:
          "화상은 열이 피부 깊이 남아 계속 진행합니다. 15~20분 냉각이 손상 범위를 줄입니다. 얼음은 혈관을 수축시켜 손상을 악화시킵니다.",
        ask: ["뜨거운 물이 팔에 쏟아졌습니다. 무엇부터 합니까?"],
        answer: "흐르는 시원한 물로 15~20분 식히고, 젖은 천으로 덮은 뒤 필요하면 119·병원으로 갑니다. 아무것도 바르지 않습니다.",
      },
      {
        key: "call_119_burn",
        label: "119·병원 판단",
        points: 6,
        criteria: {
          perform: "넓은 화상, 얼굴·손·관절, 물집이 큰 경우, 전기·화학 화상은 즉시 119라고 말한다.",
          partial: "기준 일부만 말한다.",
          none: "무조건 집에서 치료한다고 답한다.",
        },
        basis: "기도 화상이나 넓은 화상은 시간이 지나며 부종으로 기도가 막힐 수 있어 즉시 평가가 필요합니다.",
        ask: ["얼굴에 화상을 입고 목소리가 쉬었습니다. 어떻게 합니까?"],
        answer: "즉시 119입니다. 기도 화상 가능성이 있어 스스로 병원에 가면 위험합니다.",
      },
      {
        key: "eye",
        label: "눈 이물·화학물질 세척",
        points: 6,
        critical: true,
        criteria: {
          perform: "눈은 핀셋·면봉으로 건드리지 않고, 화학물질은 흐르는 물로 15분 이상 씻으며 119에 문의한다고 말한다.",
          partial: "씻는다고는 하지만 시간이 짧거나 핀셋 사용을 말한다.",
          none: "손으로 문지르거나 중화제를 넣는다고 답한다.",
        },
        basis: "각막은 문지르면 즉시 손상됩니다. 화학물질은 희석·세척이 유일한 응급처치이고, 중화 반응은 열을 만들어 더 위험합니다.",
        ask: ["세제가 눈에 들어갔습니다. 어떻게 합니까?"],
        answer: "눈을 벌린 채 흐르는 물로 15분 이상 씻고, 씻는 동안 119에 문의합니다. 문지르지 않습니다.",
      },
      {
        key: "no_burn_ointment",
        label: "금지 행동(바르기·물집 터뜨리기)",
        points: 5,
        criteria: {
          perform: "연고·기름·치약·소주 금지, 물집 터뜨리기 금지를 이유와 함께 말한다.",
          partial: "금지는 말하지만 이유를 설명하지 못한다.",
          none: "물집을 터뜨려 물을 빼면 낫는다고 답한다.",
        },
        basis: "물집은 무균 보호막입니다. 터뜨리면 감염 창구가 열리고 흉터가 남습니다.",
        ask: ["화상에 물집이 생겼습니다. 터뜨려도 됩니까?"],
        answer: "안 됩니다. 물집은 감염을 막는 보호막이므로 그대로 두고 덮어서 병원으로 갑니다.",
      },
    ],
  },
  {
    key: "SUDDEN",
    label: "6. 실신 · 경련 · 저혈당 · 흉통",
    desc: "겉으로 정상처럼 보이는 것이 가장 위험합니다. 'BP·SpO₂ 정상'에 안심하면 안 됩니다.",
    minutes: 4,
    items: [
      {
        key: "faint",
        label: "실신 환자 자세 · 회복 관찰",
        points: 6,
        criteria: {
          perform: "누이고 다리를 올려 주며, 의식이 돌아와도 바로 일으키지 않고 5~10분 관찰한다고 말한다.",
          partial: "눕히기는 하지만 다리 올리기나 관찰 시간이 빠진다.",
          none: "일으켜 세우거나 물을 먹인다.",
        },
        basis: "실신은 뇌로 가는 혈류가 잠깐 줄어 생깁니다. 다리를 올리면 혈류가 회복됩니다. 바로 세우면 다시 쓰러집니다.",
        ask: ["손님이 잠깐 쓰러졌다가 깨어났습니다. 바로 앉아도 됩니까?"],
        answer: "아직 안 됩니다. 눕힌 채 다리를 올려 5~10분 관찰하고, 다시 쓰러지면 119입니다.",
      },
      {
        key: "seizure",
        label: "경련 중 보호 · 금지 행동",
        points: 8,
        critical: true,
        criteria: {
          perform: "주변 위험물을 치우고 머리를 보호하며, 입에 아무것도 넣지 않고 시간을 잰다고 말한다.",
          partial: "보호는 말하지만 시간 측정이나 입에 넣지 않기 중 하나가 빠진다.",
          none: "혀를 깨물지 않게 숟가락을 넣는다거나 몸을 눌러 멈추게 한다고 답한다.",
        },
        basis: "경련 중에는 물릴 힘이 매우 강해 숟가락·손가락이 부러지고 이가 깨집니다. 경련은 대개 스스로 멈춥니다.",
        ask: ["손님이 경련을 합니다. 입에 수건을 물려야 합니까?"],
        answer: "절대 넣지 않습니다. 위험물만 치우고 머리를 보호하며 시간을 재고, 5분 이상 지속되면 119입니다.",
      },
      {
        key: "hypoglycemia",
        label: "저혈당 의심 · 의식 확인 후 당분",
        points: 6,
        criteria: {
          perform: "식은땀·손떨림·말이 어눌함이면 저혈당을 의심하고, 의식이 있으면 당분을, 없으면 먹이지 않고 119라고 말한다.",
          partial: "당분은 말하지만 의식 없을 때의 금지를 모른다.",
          none: "의식 없는 사람에게 음료를 먹인다.",
        },
        basis: "의식이 없을 때 먹이면 기도로 들어가 질식·흡인성 폐렴이 생깁니다. 혈당이 낮으면 뇌 기능이 빠르게 떨어집니다.",
        ask: ["식은땀을 흘리며 힘이 없다고 합니다. 의식이 흐립니다. 주스를 먹입니까?"],
        answer: "의식이 흐리면 먹이지 않고 119를 부릅니다. 의식이 명료할 때만 당분을 줍니다.",
      },
      {
        key: "chest_pain",
        label: "흉통 · 정상 활력징후에 안심 금지",
        points: 6,
        critical: true,
        criteria: {
          perform: "가슴 통증·식은땀·팔 저림은 119 대상이며, BP·SpO₂가 정상이어도 무시하지 않는다고 말한다.",
          partial: "119는 말하지만 정상 수치일 때의 판단을 잘못 말한다.",
          none: "혈압이 정상이라 괜찮다고 안심시킨다.",
        },
        basis: "심근경색 초기에는 활력징후가 정상인 경우가 많습니다. 시간이 곧 심근 손상입니다.",
        ask: ["혈압 130/85, 산소포화도 98%인데 가슴이 아프다고 합니다. 어떻게 합니까?"],
        answer: "수치와 무관하게 119를 부르고, 안정시키고 움직이지 않게 합니다. 운전은 하지 않습니다.",
      },
    ],
  },
  {
    key: "REPORT",
    label: "7. 보고·기록·개인정보",
    desc: "처치만큼 중요한 부분입니다. 기록이 없으면 일어나지 않은 일이 됩니다.",
    minutes: 3,
    items: [
      {
        key: "report_order",
        label: "보고 순서 · 보고 대상",
        points: 6,
        criteria: {
          perform: "119 → ARC 대표(RN) → 사장 순으로 보고하고, 총괄에게는 5하로 전달한다고 말한다.",
          partial: "순서가 뒤바뀌거나 대상이 빠진다.",
          none: "누구에게 보고하는지 모른다.",
        },
        basis: "처치가 먼저, 보고가 다음입니다. 다만 총괄이 사후 대응(병원·보험·기록)을 하려면 즉시 알아야 합니다.",
        ask: ["손님을 다쳐서 119를 불렀습니다. 그다음 누구에게 무엇을 알립니까?"],
        answer: "119 신고 후 ARC 대표(RN)에게 즉시, 다음으로 사장에게 알립니다. 내용은 5하로 전달합니다.",
      },
      {
        key: "care_record",
        label: "AS-CARE 기록 · 허위 기록 금지",
        points: 8,
        critical: true,
        criteria: {
          perform: "발견 시각·상태·조치·인계를 그 자리에서 AS-CARE에 남기고, 하지 않은 일은 쓰지 않는다고 말한다.",
          partial: "기록은 말하지만 시점(즉시)이나 허위 금지가 빠진다.",
          none: "'나중에 기억해서 쓴다'고 하거나 실제로 하지 않은 처치를 적는다고 답한다.",
        },
        basis: "기억은 30분이면 흐려집니다. 허위 기록은 보험·법적 판단에서 신뢰를 완전히 잃게 만듭니다.",
        ask: ["기록은 언제, 무엇을 남깁니까?"],
        answer: "사건 직후 바로, 발견 시각·상태 변화·한 처치·인계 내용을 남깁니다. 하지 않은 처치는 쓰지 않습니다.",
      },
      {
        key: "privacy",
        label: "환자 정보 보호",
        points: 6,
        criteria: {
          perform: "손님·동료에게 환자 정보를 공유하지 않고, 필요한 정보만 필요 범위에서 전달한다고 말한다.",
          partial: "보호는 말하지만 예외(의료진·119)를 구분하지 못한다.",
          none: "SNS·단체 채팅방에 사진·이름을 올린다고 답한다.",
        },
        basis: "개인정보는 목적 범위 내 최소 수집·이용 원칙이 적용됩니다. 의료 목적 외 공유는 분쟁의 시작입니다.",
        ask: ["다친 손님 사진을 직원 단체방에 올려도 됩니까?"],
        answer: "안 됩니다. 얼굴·상처·이름은 개인정보이며, 교육 목적이어도 동의 없이 공유할 수 없습니다.",
      },
      {
        key: "evidence",
        label: "증빙 연결 · 재발 방지 메모",
        points: 5,
        criteria: {
          perform: "사건 기록과 사용한 물품·비용을 연결하고, 재발 방지 한 줄을 남긴다고 말한다.",
          partial: "'기록한다'만 말한다.",
          none: "재발 방지에 대해 언급하지 않는다.",
        },
        basis: "사후검토에서 반복되는 원인을 찾으려면 물품·동선·시간대가 함께 남아야 합니다.",
        ask: ["사후검토에서 무엇을 봅니까?"],
        answer: "같은 시간대·같은 동선에서 반복되는지, 물품이 부족하지 않았는지, 교육이 닿지 않은 부분이 있었는지 봅니다.",
      },
    ],
  },
  {
    key: "KIT_OTC",
    label: "8. 구급상자 · 직원 개인 상비약",
    desc: "재고·유효기간·권한(Level C)을 정확히 알아야 합니다. '누구 약을 누가 먹는가'가 핵심입니다.",
    minutes: 4,
    items: [
      {
        key: "level",
        label: "Level A/B/C 구분",
        points: 8,
        critical: true,
        criteria: {
          perform: "A=응급·SOP, B=교육·승인, C=RN 제한(일반직원 사용 금지)을 정확히 구분한다.",
          partial: "A·B는 알지만 C의 의미나 일반직원 금지를 말하지 못한다.",
          none: "Level 구분을 모르거나 C를 일반직원이 써도 된다고 답한다.",
        },
        basis: "C 등급은 판단이 필요한 품목(주사·전문 처치 등)이라 RN이 직접 해야 합니다. 일반인이 쓰면 손상 위험이 큽니다.",
        ask: ["Level C 품목이 필요해 보입니다. 직원이 직접 써도 됩니까?"],
        answer: "안 됩니다. C는 RN 제한 품목이므로 ARC 대표(RN)에게 즉시 연락합니다.",
      },
      {
        key: "expiry",
        label: "유효기간·월 1회 실사",
        points: 6,
        criteria: {
          perform: "월 1회 실사로 수량·유효기간을 확인하고, 임박 품목은 교체·폐기한다고 말한다.",
          partial: "실사는 말하지만 유효기간 임박 기준(예: 3개월)을 모른다.",
          none: "유효기간을 확인하지 않는다고 답한다.",
        },
        basis: "유효기간이 지난 소독제·거즈는 무균이 보장되지 않고, 지난 약은 효과가 떨어지거나 변질됩니다.",
        ask: ["실사에서 유효기간이 2개월 남은 품목을 발견했습니다. 어떻게 합니까?"],
        answer: "교체 대상으로 표시하고 구매 요청에 올린 뒤, 폐기·교체 이력을 남깁니다.",
      },
      {
        key: "otc_rule",
        label: "직원 개인 상비약 원칙",
        points: 8,
        critical: true,
        criteria: {
          perform: "개인 상비약은 본인 자가선택·자가복용이며, 남에게 약 이름·용량을 정해 주지 않는다고 말한다.",
          partial: "본인 복용은 말하지만 타인에게 권하는 것의 금지를 빠뜨린다.",
          none: "'이거 먹어'라고 약을 건네도 된다고 답한다.",
        },
        basis: "약 추천·용량 결정은 의료 행위입니다. 알레르기·복용 중인 약과의 상호작용을 일반인이 판단할 수 없습니다.",
        ask: ["동료가 두통이 심하다며 약을 달라고 합니다. 내 상비약을 줘도 됩니까?"],
        answer: "안 됩니다. 약 이름·용량을 정해 주거나 건네면 안 되고, 본인이 자기 상비약을 자기 판단으로 복용해야 합니다.",
      },
      {
        key: "usage_log",
        label: "사용대장 기록 · 단가·정산",
        points: 6,
        criteria: {
          perform: "사용하면 언제·누가·어디서·무엇을·왜·몇 개를 사용대장에 남기고, 단가로 소모금액이 계산된다고 말한다.",
          partial: "기록은 말하지만 항목이 3개 이하다.",
          none: "기록 없이 쓰고 나중에 개수만 맞춘다고 답한다.",
        },
        basis: "육하원칙 기록이 있어야 소모금액·정산·재구매 시점이 자동으로 맞습니다. 개수만 맞추면 비용이 어긋납니다.",
        ask: ["상비약을 쓴 뒤 무엇을 남깁니까?"],
        answer: "사용일시·사용자·장소·품목·사유·수량을 남깁니다. 단가가 등록돼 있으면 소모금액이 바로 계산됩니다.",
      },
    ],
  },
];

/**
 * 난이도 상 구두 질문 은행.
 * 정기 테스트에서 2~3개, 불시 테스트에서 1개를 골라 씁니다.
 */
export const ARC_VERBAL_QUESTIONS = [
  {
    key: "Q01",
    level: "상",
    tag: "CPR",
    q: "가슴압박을 30:2로 하는 이유를 설명해 보세요.",
    a: "압박으로 혈액을 돌리고, 구조자가 숨을 불어넣을 때 심장에 피가 차서 다음 압박이 효과적으로 나가게 하기 위해서입니다. 무구호자·일반인은 손만 쓰는 압박도 가능합니다.",
    wrong: "'숨을 안 쉬면 죽으니까' 수준으로만 답한다.",
  },
  {
    key: "Q02",
    level: "상",
    tag: "CPR",
    q: "AED가 '충격이 필요 없다'고 합니다. 이때 무엇을 합니까?",
    a: "패드를 붙인 채로 즉시 가슴압박을 다시 시작하고 2분마다 재분석합니다. 패드를 떼지 않습니다.",
    wrong: "패드를 떼거나, 환자가 살았다고 판단해 압박을 멈춘다.",
  },
  {
    key: "Q03",
    level: "상",
    tag: "SAFE",
    q: "헐떡이는 호흡을 정상호흡으로 보면 어떤 결과가 생깁니까?",
    a: "CPR 시작이 늦어져 뇌로 가는 혈류가 끊긴 시간이 길어지고, 생존율과 회복 가능성이 크게 떨어집니다.",
    wrong: "'숨은 쉬고 있으니 괜찮다'고 답한다.",
  },
  {
    key: "Q04",
    level: "상",
    tag: "BLEED",
    q: "지혈대를 일반인이 함부로 쓰면 안 되는 이유는 무엇입니까?",
    a: "잘못 감으면 정맥을 막아 출혈이 오히려 늘고, 오래 두면 조직이 괴사할 수 있습니다. 직접압박이 우선이고 지혈대는 교육받은 경우의 최후 수단입니다.",
    wrong: "'피를 완전히 막아야 하니까 무조건 쓴다'고 답한다.",
  },
  {
    key: "Q05",
    level: "상",
    tag: "BURN",
    q: "화상에 얼음을 대면 왜 안 됩니까?",
    a: "혈관이 급격히 수축해 오히려 손상 부위가 깊어지고 동상 위험이 생깁니다. 흐르는 시원한 물 15~20분이 원칙입니다.",
    wrong: "'차가울수록 좋다'고 답한다.",
  },
  {
    key: "Q06",
    level: "상",
    tag: "INTOX",
    q: "술을 마신 손님이 쓰러졌습니다. 저혈당과 중독을 어떻게 구분합니까?",
    a: "일반인이 구분할 수 없습니다. 술 냄새가 나도 의식저하·비정상호흡이면 119 대상으로 보고, 의식이 없으면 아무것도 먹이지 않습니다.",
    wrong: "'술 때문에 그렇다'고 판단해 재우거나 물을 먹인다.",
  },
  {
    key: "Q07",
    level: "상",
    tag: "REPORT",
    q: "사후검토에서 같은 사건이 반복된다는 것을 어떻게 확인합니까?",
    a: "시간대·동선·품목·교육 이수 여부를 함께 봅니다. 사람만 탓하면 원인이 남습니다.",
    wrong: "'직원이 부주의했다'로 끝낸다.",
  },
  {
    key: "Q08",
    level: "상",
    tag: "KIT_OTC",
    q: "Level C 품목을 일반직원이 쓰면 어떤 문제가 생깁니까?",
    a: "판단이 필요한 처치라 잘못된 사용으로 손상·감염 위험이 커지고, 권한 규정 위반이 됩니다. 즉시 RN에게 인계해야 합니다.",
    wrong: "'급하면 써도 된다'고 답한다.",
  },
  {
    key: "Q09",
    level: "상",
    tag: "CHOKE",
    q: "부분 폐쇄에서 등을 두드리면 왜 위험합니까?",
    a: "이물이 더 깊이 들어가 완전 폐쇄로 악화될 수 있습니다. 기침을 유지시키고 악화될 때만 등 두드리기를 시작합니다.",
    wrong: "'빨리 두드릴수록 좋다'고 답한다.",
  },
  {
    key: "Q10",
    level: "상",
    tag: "PRIVACY",
    q: "교육 자료로 쓰려고 사건 사진을 남기려 합니다. 무엇을 확인해야 합니까?",
    a: "얼굴·이름·문신 등 식별 가능 정보를 지우고, 목적·보관 기간을 정하며, 가능하면 동의를 받습니다. 목적 외 사용은 금지입니다.",
    wrong: "'교육용이면 괜찮다'고 답한다.",
  },
];

function text(value, max = 200) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function isoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function round2(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

/** 평가표 + 질문 은행 + 판정 규칙을 한 번에 내려 줍니다(총괄 전용). */
export function arcVerbalTemplate() {
  const flattened = ARC_VERBAL_SECTIONS.flatMap((section) =>
    section.items.map((item) => ({ sectionKey: section.key, ...item }))
  );

  return {
    sections: ARC_VERBAL_SECTIONS,
    results: ARC_VERBAL_RESULTS,
    verdictRules: ARC_VERBAL_VERDICT_RULES,
    questions: ARC_VERBAL_QUESTIONS,
    totals: {
      sections: ARC_VERBAL_SECTIONS.length,
      items: flattened.length,
      maxScore: round2(flattened.reduce((sum, item) => sum + Number(item.points ?? 0), 0)),
      criticalItems: flattened.filter((item) => item.critical).length,
      minutes: ARC_VERBAL_SECTIONS.reduce((sum, item) => sum + Number(item.minutes ?? 0), 0),
    },
  };
}

/** 응시 결과로 점수·판정을 계산합니다. 입력이 없으면 참고용 미리보기를 돌려줍니다. */
export function scoreArcVerbal(entries = []) {
  const itemIndex = new Map();
  for (const section of ARC_VERBAL_SECTIONS) {
    for (const item of section.items) {
      itemIndex.set(`${section.key}:${item.key}`, item);
    }
  }

  let score = 0;
  let maxScore = 0;
  let criticalNone = 0;
  const missing = [];

  for (const entry of Array.isArray(entries) ? entries : []) {
    const sectionKey = text(entry.sectionKey, 20).toUpperCase();
    const itemKey = text(entry.itemKey, 30);
    const item = itemIndex.get(`${sectionKey}:${itemKey}`);

    if (!item) continue;

    const result = RESULTS.has(text(entry.result, 10).toUpperCase())
      ? text(entry.result, 10).toUpperCase()
      : "NONE";
    const points = Number(item.points ?? 0);

    maxScore += points;
    score += points * RESULT_WEIGHT[result];

    if (result === "NONE") {
      missing.push(`${sectionKey}:${itemKey}`);
      if (item.critical) criticalNone += 1;
    }
  }

  const percent = maxScore > 0 ? round2((score / maxScore) * 100) : 0;
  let verdict = "PENDING";

  if (maxScore > 0) {
    if (percent >= ARC_VERBAL_VERDICT_RULES.pass && criticalNone === 0) verdict = "PASS";
    else if (percent >= ARC_VERBAL_VERDICT_RULES.retake && criticalNone < 2) verdict = "RETAKE";
    else verdict = "FAIL";
  }

  return {
    score: round2(score),
    maxScore: round2(maxScore),
    percent,
    verdict,
    criticalNone,
    missing,
  };
}

function examNo(prefixDate, seq) {
  return `VB-${prefixDate}-${String(seq).padStart(2, "0")}`;
}

async function nextExamNo(scheduledOn) {
  const stamp = scheduledOn.replaceAll("-", "");
  const { rows } = await pool.query(
    `select count(*)::int as used
       from public.arc_verbal_exams
      where exam_no like $1`,
    [`VB-${stamp}-%`]
  );
  const used = Number(rows[0]?.used ?? 0);

  return examNo(stamp, used + 1);
}

function mapExam(row, scores = []) {
  return {
    id: row.id,
    examNo: row.exam_no,
    sessionId: row.session_id,
    kind: row.kind,
    scheduledOn: isoDate(row.scheduled_on),
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    examinerName: row.examiner_name,
    totalScore: round2(row.total_score),
    maxScore: round2(row.max_score),
    percent: Number(row.max_score) > 0
      ? round2((Number(row.total_score) / Number(row.max_score)) * 100)
      : 0,
    verdict: row.verdict,
    feedback: row.feedback,
    retestOn: isoDate(row.retest_on),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    scores,
  };
}

function mapScore(row) {
  return {
    sectionKey: row.section_key,
    itemKey: row.item_key,
    result: row.result,
    score: round2(row.score),
    note: row.note,
  };
}

export async function listArcVerbalExams({ period = null, employeeId = "", limit = 60 } = {}) {
  const safePeriod = text(period, 7);
  const safeLimit = Math.min(Math.max(Number(limit) || 60, 1), 200);

  if (safePeriod && !PERIOD_PATTERN.test(safePeriod)) {
    throw badRequest("조회 월은 YYYY-MM 형식으로 입력해 주세요.");
  }

  const { rows } = await pool.query(
    `select *
       from public.arc_verbal_exams
      where ($1::text is null or to_char(scheduled_on, 'YYYY-MM') = $1)
        and ($2::text = '' or employee_id = $2)
      order by scheduled_on desc, created_at desc
      limit $3`,
    [safePeriod || null, text(employeeId, 60), safeLimit]
  );

  const examIds = rows.map((row) => row.id);
  const scoreMap = new Map();

  if (examIds.length > 0) {
    const { rows: scoreRows } = await pool.query(
      `select exam_id, section_key, item_key, result, score, note
         from public.arc_verbal_scores
        where exam_id = any($1::uuid[])
        order by sort_order`,
      [examIds]
    );

    for (const row of scoreRows) {
      const list = scoreMap.get(row.exam_id) ?? [];
      list.push(mapScore(row));
      scoreMap.set(row.exam_id, list);
    }
  }

  const exams = rows.map((row) => mapExam(row, scoreMap.get(row.id) ?? []));

  return {
    period: safePeriod || null,
    exams,
    summary: {
      total: exams.length,
      pending: exams.filter((item) => item.verdict === "PENDING").length,
      pass: exams.filter((item) => item.verdict === "PASS").length,
      retake: exams.filter((item) => item.verdict === "RETAKE").length,
      fail: exams.filter((item) => item.verdict === "FAIL").length,
      surprise: exams.filter((item) => item.kind === "SURPRISE").length,
    },
  };
}

export async function getArcVerbalExam(examId) {
  const { rows } = await pool.query(
    `select * from public.arc_verbal_exams where id = $1`,
    [examId]
  );

  if (rows.length === 0) {
    throw new HttpError(404, "HJ404", "구두테스트 기록을 찾을 수 없어요.");
  }

  const { rows: scoreRows } = await pool.query(
    `select section_key, item_key, result, score, note
       from public.arc_verbal_scores
      where exam_id = $1
      order by sort_order`,
    [examId]
  );

  return mapExam(rows[0], scoreRows.map(mapScore));
}

/**
 * 구두테스트 일정을 잡습니다.
 * 달력(arc_training_sessions)에도 함께 올려서 월간 캘린더에서 바로 보이게 합니다.
 */
export async function createArcVerbalExam(input = {}, employee = null) {
  const kind = text(input.kind, 20).toUpperCase() === "SURPRISE" ? "SURPRISE" : "REGULAR";
  const scheduledOn = text(input.scheduledOn, 10) || new Date().toISOString().slice(0, 10);

  if (!DATE_PATTERN.test(scheduledOn)) {
    throw badRequest("테스트 날짜는 YYYY-MM-DD 형식으로 입력해 주세요.");
  }

  const employeeName = text(input.employeeName, 60);

  if (!employeeName) {
    throw badRequest("누구를 평가하는지 선택해 주세요.");
  }

  const examinerName = text(input.examinerName, 60) || text(employee?.name, 60) || "ARC 대표(RN)";
  let sessionId = text(input.sessionId, 60) || null;

  // 달력에도 올립니다(불시 테스트 제목은 달력에 그대로 남지 않도록 일반 문구 사용).
  if (!sessionId && input.addToCalendar !== false) {
    const session = await createArcTrainingSession(
      {
        kind: kind === "SURPRISE" ? "VERBAL_SURPRISE" : "VERBAL",
        scheduledOn,
        startTime: text(input.startTime, 5) || "15:00",
        durationMin: Number(input.durationMin) > 0 ? Number(input.durationMin) : 20,
        title: `${kind === "SURPRISE" ? "구두테스트(불시)" : "구두테스트(정기)"} · ${employeeName}`,
        place: text(input.place, 120) || "카운터",
        instructor: examinerName,
        status: "PLANNED",
        note: text(input.note, 1000),
      },
      employee
    );

    sessionId = session.id;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const { rows } = await pool.query(
        `insert into public.arc_verbal_exams
           (id, exam_no, session_id, kind, scheduled_on, employee_id, employee_name,
            examiner_name, verdict, feedback, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', $9, $10)
         returning *`,
        [
          randomUUID(),
          await nextExamNo(scheduledOn),
          sessionId,
          kind,
          scheduledOn,
          text(input.employeeId, 60) || null,
          employeeName,
          examinerName,
          text(input.feedback, 1000),
          text(employee?.name, 60) || examinerName,
        ]
      );

      return mapExam(rows[0], []);
    } catch (error) {
      if (error?.code === "23505") continue;
      throw error;
    }
  }

  throw badRequest("구두테스트 번호를 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
}

/** 채점 결과를 저장합니다. 점수·판정은 서버가 다시 계산합니다. */
export async function gradeArcVerbalExam(examId, input = {}, employee = null) {
  const current = await getArcVerbalExam(examId);
  const entries = Array.isArray(input.entries) ? input.entries : [];
  const summary = scoreArcVerbal(entries);
  const verdictInput = text(input.verdict, 20).toUpperCase();
  // 총괄이 판정을 직접 덮어쓸 수는 있지만, 기본값은 서버 계산을 따릅니다.
  const verdict = VERDICTS.has(verdictInput) ? verdictInput : summary.verdict;
  const retestOn = text(input.retestOn, 10);

  if (retestOn && !DATE_PATTERN.test(retestOn)) {
    throw badRequest("재평가 날짜는 YYYY-MM-DD 형식으로 입력해 주세요.");
  }

  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query(`delete from public.arc_verbal_scores where exam_id = $1`, [examId]);

    let order = 0;
    for (const entry of entries) {
      const sectionKey = text(entry.sectionKey, 20).toUpperCase();
      const itemKey = text(entry.itemKey, 30);
      const result = text(entry.result, 10).toUpperCase();

      if (!sectionKey || !itemKey || !RESULTS.has(result)) continue;

      const section = ARC_VERBAL_SECTIONS.find((item) => item.key === sectionKey);
      const item = section?.items.find((row) => row.key === itemKey);

      if (!item) continue;

      await client.query(
        `insert into public.arc_verbal_scores
           (exam_id, section_key, item_key, result, score, note, sort_order)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          examId,
          sectionKey,
          itemKey,
          result,
          round2(Number(item.points ?? 0) * RESULT_WEIGHT[result]),
          text(entry.note, 400),
          order,
        ]
      );
      order += 1;
    }

    await client.query(
      `update public.arc_verbal_exams
          set total_score = $2,
              max_score = $3,
              verdict = $4,
              feedback = $5,
              retest_on = $6,
              examiner_name = coalesce(nullif($7, ''), examiner_name),
              updated_at = now()
        where id = $1`,
      [
        examId,
        summary.score,
        summary.maxScore,
        verdict,
        text(input.feedback, 1000) || current.feedback,
        retestOn || null,
        text(employee?.name, 60),
      ]
    );

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  return getArcVerbalExam(examId);
}

export async function deleteArcVerbalExam(examId) {
  const { rowCount } = await pool.query(
    `delete from public.arc_verbal_exams where id = $1`,
    [examId]
  );

  if (rowCount === 0) {
    throw new HttpError(404, "HJ404", "구두테스트 기록을 찾을 수 없어요.");
  }

  return { deleted: true };
}

/** 화면 상단 카드 — 이번 달 테스트 현황과 재평가 대상. */
export async function arcVerbalSummary({ period = null } = {}) {
  const safePeriod = PERIOD_PATTERN.test(text(period, 7))
    ? text(period, 7)
    : new Date().toISOString().slice(0, 7);

  const { rows } = await pool.query(
    `select
        count(*)::int as total,
        count(*) filter (where verdict = 'PASS')::int as pass,
        count(*) filter (where verdict = 'RETAKE')::int as retake,
        count(*) filter (where verdict = 'FAIL')::int as fail,
        count(*) filter (where verdict = 'PENDING')::int as pending,
        count(*) filter (where kind = 'SURPRISE')::int as surprise
       from public.arc_verbal_exams
      where to_char(scheduled_on, 'YYYY-MM') = $1`,
    [safePeriod]
  );

  const { rows: retestRows } = await pool.query(
    `select exam_no, employee_name, verdict, retest_on, scheduled_on
       from public.arc_verbal_exams
      where verdict in ('RETAKE', 'FAIL')
      order by coalesce(retest_on, scheduled_on) asc
      limit 20`,
    []
  );

  const row = rows[0] ?? {};

  return {
    period: safePeriod,
    today: new Date().toISOString().slice(0, 10),
    total: Number(row.total ?? 0),
    pass: Number(row.pass ?? 0),
    retake: Number(row.retake ?? 0),
    fail: Number(row.fail ?? 0),
    pending: Number(row.pending ?? 0),
    surprise: Number(row.surprise ?? 0),
    retests: retestRows.map((item) => ({
      examNo: item.exam_no,
      employeeName: item.employee_name,
      verdict: item.verdict,
      retestOn: isoDate(item.retest_on),
      scheduledOn: isoDate(item.scheduled_on),
    })),
  };
}
