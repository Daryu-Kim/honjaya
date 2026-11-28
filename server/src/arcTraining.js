// P14G — 응급안전관리센터 월간 교육·OT 도메인 로직.
//
// 원본 근거:
//   * AS-CAL-001 1년 업무달력 — 월 1회 정기교육·OT, 분기 모의훈련
//   * AS-KIT-001 §직원 정기교육 — 주제 목록, 신규직원 7일 기본교육·30일 실습, 불참 14일 보충
//   * AS-GDE-001 §15 상황연습(21개) · §16 절대금지(30개) · §17 Quick Card
//
// 카탈로그(모듈·상황연습·절대금지)는 원문을 옮긴 상수입니다. DB에는
// "잡아 둔 세션(계획)"과 "참석 결과"만 남기고, 화면은 그 둘을 합쳐 보여줍니다.
import { randomUUID } from "node:crypto";

import { collectArcTerms } from "./arcGlossary.js";
import { mergeTrainingContent } from "./arcTrainingDeep.js";
import { pool } from "./db.js";
import { badRequest, HttpError } from "./http/errors.js";

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAKEUP_DAYS = 14;
const MAX_LIMIT = 120;

export const ARC_TRAINING_KINDS = [
  {
    key: "OT",
    label: "월간 OT",
    desc: "월 1회 운영회의. 지난달 사건·재고·민원 회고와 이번 달 일정·역할 정렬.",
    minutes: 30,
    modules: ["ROLE", "REPORT"],
  },
  {
    key: "REGULAR",
    label: "정기교육",
    desc: "AS-CAL-001 월 1회 정기교육. 이번 달 주제 1~2개를 골라 구두평가까지 진행.",
    minutes: 45,
    modules: ["SAFE", "BLEED", "BURN"],
  },
  {
    key: "NEWBIE",
    label: "신규직원 기본교육",
    desc: "입사 7일 이내 기본교육 + 30일 이내 실습형 교육. 구급상자 위치부터 시작.",
    minutes: 60,
    modules: ["ROLE", "KIT", "SAFE"],
  },
  {
    key: "DRILL",
    label: "상황연습",
    desc: "AS-GDE-001 §15 상황연습으로 말로 답하게 훈련. 분기 모의훈련은 CPR 포함.",
    minutes: 40,
    modules: ["CPR"],
  },
  {
    key: "REFRESH",
    label: "보수·재교육",
    desc: "불참자 14일 이내 보충 또는 오답·실수 항목 재교육.",
    minutes: 30,
    modules: ["ROLE"],
  },
  {
    key: "ROUTINE",
    label: "월간 운영 루틴",
    desc:
      "AS-CAL-001 월간 운영 루틴. 월초 오픈부터 월말 마감까지 그 달에 해야 할 일을 " +
      "달력에 미리 깔아 두고 진행 상황을 함께 봅니다.",
    minutes: 30,
    modules: [],
    // 루틴은 체크리스트가 본체라 교육 모듈을 고르지 않아도 됩니다.
    modulesOptional: true,
  },
  {
    key: "PERSONAL",
    label: "개인 일정",
    desc:
      "ARC 대표(RN) 개인 일정. 총괄 계정에만 보이고 다른 계정에는 나타나지 않습니다.",
    minutes: 30,
    modules: [],
    modulesOptional: true,
    // 본인만 볼 수 있는 달력 (서버에서도 본인 것만 돌려줍니다)
    personal: true,
  },
  {
    key: "VERBAL",
    label: "정기 구두테스트",
    desc:
      "미리 예고한 날짜에 직원·사장을 한 명씩 불러 핵심술기와 이론을 구두로 확인합니다. " +
      "결과는 평가표에 수행/부분수행/미수행으로 남고, 총괄만 볼 수 있습니다.",
    minutes: 20,
    modules: [],
    modulesOptional: true,
    directorOnly: true,
  },
  {
    key: "VERBAL_SURPRISE",
    label: "불시 구두테스트",
    desc:
      "예고 없이 영업 중 짧게 확인하는 테스트입니다. 3~5분 안에 끝나야 하며, " +
      "틀린 항목은 그 자리에서 바로 알려 주고 14일 안에 다시 확인합니다.",
    minutes: 10,
    modules: [],
    modulesOptional: true,
    directorOnly: true,
  },
];

// 총괄(ARC 대표)만 조회·수정할 수 있는 구분 — 다른 계정에는 아예 내려보내지 않습니다.
const DIRECTOR_ONLY_KINDS = ARC_TRAINING_KINDS.filter((item) => item.directorOnly).map(
  (item) => item.key
);

export const ARC_TRAINING_STATUSES = [
  { key: "PLANNED", label: "예정" },
  { key: "DONE", label: "완료" },
  { key: "CANCELED", label: "취소" },
];

export const ARC_TRAINING_RESULTS = [
  { key: "PENDING", label: "미평가" },
  { key: "PASS", label: "통과" },
  { key: "MAKEUP", label: "보충 필요" },
  { key: "FAIL", label: "재교육" },
  { key: "EXCUSED", label: "사유 불참" },
];

/**
 * 교육 모듈. items 는 [키, 세부 항목] 이고, 화면에서는 체크리스트로 씁니다.
 * goal = 교육자가 이 시간에 반드시 남겨야 하는 한 문장.
 */
export const ARC_TRAINING_MODULES = [
  {
    key: "ROLE",
    phase: "기본",
    title: "역할·권한·기본원칙",
    minutes: 15,
    goal: "직원이 '할 수 있는 일'과 '절대 못 하는 일'을 자기 말로 구분할 수 있게 합니다.",
    items: [
      ["scope", "일반직원 업무 범위 = 현장 안전확보 · 119 신고 · CPR/AED · 직접압박 · 냉각 · 인계"],
      ["no_dx", "진단·투약·처방 판단은 하지 않습니다. '이 병원체가 맞다'는 말도 금지"],
      ["first_119", "위급하면 RN 답변을 기다리지 않고 119를 먼저 부릅니다"],
      ["roles", "총괄(최윤희 RN) / 대표 / 일반직원 / 확인자 역할 구분"],
      ["level_c", "Level C(RN 제한관리품)는 일반직원 임의 사용 금지"],
      ["guest_otc", "고객에게 경구 일반의약품 제공·판매·권유 금지(한 알도)"],
      ["honest", "실제로 하지 않은 처치·교육·점검은 기록하지 않습니다"],
      ["access", "기록 열람은 권한자만. 열람·승인은 감사로그에 남습니다"],
    ],
    materials: ["AS-GDE-001 §03 권한·책임", "AS-NOT-001 외부인 고지서 사본", "직원 서명지"],
    evaluation: [
      "일반직원이 할 수 있는 일 5가지를 말할 수 있는가",
      "119를 먼저 불러야 하는 상황을 3가지 이상 말할 수 있는가",
      "고객에게 약을 주면 안 되는 이유를 설명할 수 있는가",
    ],
  },
  {
    key: "SAFE",
    phase: "기본",
    title: "현장 안전확보 · 반응·호흡 확인",
    minutes: 15,
    goal: "구조자 안전을 먼저 확보하고, 10초 안에 '반응·호흡'을 판정할 수 있게 합니다.",
    items: [
      ["hazard", "깨진 유리·칼·화기·전기·폭력·미끄럼 위험을 먼저 제거(구조자 안전 우선)"],
      ["glove", "장갑·보호구를 가능한 범위에서 착용"],
      ["call_shoulder", "부르고 어깨를 두드려 반응 확인"],
      ["breath", "정상호흡 확인(10초 이내). 헐떡임은 '비정상호흡'으로 봅니다"],
      ["position", "의식저하자는 옆으로 눕혀 기도 확보, 불필요한 이동 금지"],
      ["log", "발견 시각·상태·취한 조치를 그 자리에서 메모"],
      ["handover", "119·의료기관 인계 시 5하(누가·언제·어디서·무엇을·어떻게)로 전달"],
    ],
    materials: ["AS-GDE-001 §04·§05", "Quick Card(§17) 출력본", "현장 배치도"],
    evaluation: [
      "반응·호흡 확인 순서를 그대로 시연할 수 있는가",
      "왜 '헐떡임'을 정상호흡으로 보면 안 되는지 설명할 수 있는가",
      "의식저하자를 앉히거나 걷게 하면 안 되는 이유를 말할 수 있는가",
    ],
  },
  {
    key: "CPR",
    phase: "생명위협",
    title: "심정지 · CPR · AED",
    minutes: 30,
    goal: "반응·정상호흡이 없으면 지체 없이 가슴압박을 시작하고 AED를 붙일 수 있게 합니다.",
    items: [
      ["start", "반응 없고 정상호흡 없거나 헐떡임 = 심정지 의심 → 119 요청 후 즉시 압박"],
      ["hand", "가슴 중앙·손바닥 아래쪽, 깊이 5cm·속도 100~120회/분, 완전히 이완"],
      ["change", "2분마다 교대(교대 10초 이내), 가능하면 30:2"],
      ["aed", "전원 켜기 → 패드 부착 → 분석 중 접촉 금지 → 충격 후 바로 압박 재개"],
      ["no_pulse", "맥박을 오래 찾느라 압박을 미루지 않습니다"],
      ["stop", "현장 회복·119 도착·구조자 탈진 전까지 계속"],
      ["record", "압박 시작 시각·교대·충격 횟수를 AS-CARE에 기록"],
    ],
    materials: ["CPR 마네킹(가능 시)", "AED 위치·배터리·패드 유효기간 확인", "119 신고 문구(§18)"],
    evaluation: [
      "가슴압박 위치·깊이·속도를 숫자로 말할 수 있는가",
      "AED 분석 중 접촉하면 안 되는 이유와 순서를 말할 수 있는가",
      "심정지 의심에서 119·압박·AED 중 무엇을 먼저 하는지 말할 수 있는가",
    ],
  },
  {
    key: "CHOKE",
    phase: "생명위협",
    title: "기도폐쇄 · 질식",
    minutes: 15,
    goal: "기침 가능/불가를 구분해 등 두드리기와 복부 밀어내기를 바로 할 수 있게 합니다.",
    items: [
      ["judge", "말할 수 있고 기침이 나오면 '부분 폐쇄' → 기침 유도·관찰, 등 두드리기 시작하지 않음"],
      ["severe", "말 못 하고 목을 잡으면 '심한 폐쇄' → 즉시 119 요청"],
      ["back", "등 두드리기 5회 → 복부 밀어내기 5회 반복"],
      ["pregnant", "임신부·비만은 가슴 밀어내기로 대체"],
      ["collapse", "의식을 잃으면 즉시 CPR로 전환"],
      ["after", "해소 후에도 이물감·기침·쉰 목소리가 남으면 의료평가 안내"],
    ],
    materials: ["AS-GDE-001 §05", "의자·테이블 배치 확인(밀어내기 공간)", "119 신고 문구"],
    evaluation: [
      "부분 폐쇄와 심한 폐쇄를 구분하는 기준을 말할 수 있는가",
      "등 두드리기·복부 밀어내기 횟수와 순서를 말할 수 있는가",
      "의식을 잃었을 때 다음 행동을 즉시 말할 수 있는가",
    ],
  },
  {
    key: "BLEED",
    phase: "손상",
    title: "베임 · 출혈 · 유리 · 낙상",
    minutes: 20,
    goal: "거즈를 떼지 않고 직접압박을 유지한 채 119 판단까지 갈 수 있게 합니다.",
    items: [
      ["glove", "장갑 → 깨끗한 거즈로 강한 직접압박"],
      ["keep", "피가 비쳐도 거즈를 계속 떼지 않고 위에 덧댑니다"],
      ["cut", "부분절단은 떼어내지 않고 지속 압박 → 즉시 119 → 조직은 얼음에 직접 대지 않음"],
      ["neuro", "손끝 감각·움직임 확인 후 기록"],
      ["impaled", "박힌 칼·큰 유리·깊은 이물은 빼지 않고 주변 고정"],
      ["glass", "유리 파손 시 장갑·집게·손전등 사용, 맨손 수거 금지"],
      ["fall", "낙상은 머리·목·골반 확인, 억지로 일으키지 않음"],
      ["tetanus", "상처 특성상 파상풍 상담이 필요할 수 있음을 안내"],
    ],
    materials: ["거즈·붕대·장갑 실물", "AS-GDE-001 §07", "구급상자 지혈 구역 위치"],
    evaluation: [
      "거즈를 계속 떼면 안 되는 이유를 설명할 수 있는가",
      "부분절단에서 '하지 말아야 할 것' 3가지를 말할 수 있는가",
      "박힌 이물을 빼면 안 되는 이유를 설명할 수 있는가",
    ],
  },
  {
    key: "BURN",
    phase: "손상",
    title: "화상 · 눈 · 화학 · 전기",
    minutes: 20,
    goal: "20분 냉각과 '바르면 안 되는 것'을 습관으로 만들고, 전원 차단을 먼저 하게 합니다.",
    items: [
      ["cool", "열원 제거 → 흐르는 서늘한 물 20분(얼음 직접 접촉 금지)"],
      ["remove", "반지·시계 등 부을 수 있는 것은 부기 전에 제거 시도"],
      ["no_apply", "얼음·바세린·치약·소주·연고 임의 도포 금지, 물집 터뜨리지 않음"],
      ["eye", "눈 세척제·화학물질은 즉시 흐르는 물 20분 이상, 눈을 비비지 않음"],
      ["neutralize", "화학물질을 다른 화학물질로 중화하지 않습니다"],
      ["electric", "감전은 전원 차단 전 맨손 접근 금지 → 차단 후 반응·호흡 → 119"],
      ["hospital", "넓은 화상·얼굴·손·관절·화학·전기 화상은 곧바로 의료기관"],
    ],
    materials: ["AS-GDE-001 §08", "세척 가능한 싱크 위치 확인", "화상·눈 세척 안내문"],
    evaluation: [
      "화상 냉각 시간과 '바르면 안 되는 것' 3가지를 말할 수 있는가",
      "눈에 화학물질이 들어갔을 때 첫 행동을 말할 수 있는가",
      "감전 환자에게 맨손으로 접근하면 안 되는 이유를 설명할 수 있는가",
    ],
  },
  {
    key: "INTOX",
    phase: "주취·복부",
    title: "음주 · 구토 · 복부 · 저혈당",
    minutes: 20,
    goal: "'술 때문'이라고 단정하지 않고 위험신호를 먼저 확인하게 합니다.",
    items: [
      ["no_assume", "주취자도 '술 때문'으로 단정하지 않고 반응·호흡을 먼저 확인"],
      ["vomit", "구토는 옆으로 눕혀 기도 확보, 반복 구토·혈액·커피색 구토는 119"],
      ["head", "머리외상 가능성 확인. 억지로 걷게 하거나 혼자 귀가시키지 않음"],
      ["abdomen", "복부 통증 위치·시작 시각·동반 증상 확인, 진통제 임의 제공 금지"],
      ["low", "식사 적음 + 식은땀·손떨림·말 어눌 = 저혈당 의심 → 119/의료기관"],
      ["rarely", "평소보다 적게 마셨는데 걷지 못하거나 기억이 끊기면 즉시 119"],
      ["observe", "의식저하자는 물·커피·사탕·약을 억지로 먹이지 않음"],
    ],
    materials: ["AS-GDE-001 §06", "구토물 처리 키트", "119 신고 문구"],
    evaluation: [
      "주취자에게서 먼저 확인해야 하는 2가지를 말할 수 있는가",
      "저혈당 의심 신호 3가지를 말할 수 있는가",
      "의식저하자에게 먹이면 안 되는 것들을 말할 수 있는가",
    ],
  },
  {
    key: "SUDDEN",
    phase: "생명위협",
    title: "갑자기 아픈 손님 — 실신·흉통·뇌졸중·아나필락시스",
    minutes: 20,
    goal: "FAST·아나필락시스 신호를 보고 '먹이지 않고 즉시 119'로 갈 수 있게 합니다.",
    items: [
      ["faint", "실신은 눕혀 다리 올리기, 5분 이상 회복 없거나 머리부상 시 119"],
      ["chest", "가슴통증·식은땀·숨참·팔 저림은 심장 위험신호 → 즉시 119"],
      ["fast", "FAST(얼굴처짐·팔 약화·말 어눌) 양성이면 시작시각 기록 후 즉시 119"],
      ["no_eat", "뇌졸중 의심자에게 먹거나 마시게 하지 않습니다"],
      ["anaphylaxis", "입술·얼굴 부종, 숨쉬기 힘듦, 전신 두드러기 = 아나필락시스 → 즉시 119"],
      ["epi", "본인 처방 자가주사기가 있으면 사용을 돕고 혼자 두지 않음"],
      ["vitals", "BP·SpO₂가 정상이어도 심한 증상은 무시하지 않습니다"],
    ],
    materials: ["AS-GDE-001 §09", "FAST 안내 카드", "AED·자가주사기 보관 위치"],
    evaluation: [
      "FAST 네 글자가 무엇인지 말할 수 있는가",
      "뇌졸중 의심자에게 먹이면 안 되는 이유를 설명할 수 있는가",
      "아나필락시스에서 가장 먼저 할 일을 말할 수 있는가",
    ],
  },
  {
    key: "MISC",
    phase: "손상",
    title: "발작 · 이물 · 벌레 · 더위·추위 · 치아",
    minutes: 15,
    goal: "경련 중 입에 넣지 않기, 코피 자세, 빠진 치아 보관을 정확히 익히게 합니다.",
    items: [
      ["seizure", "경련은 주변 위험물 치우고 시간을 잽니다. 입에 아무것도 넣지 않습니다"],
      ["seizure_119", "5분 이상 지속·반복·의식 회복 지연이면 119"],
      ["nosebleed", "고개를 앞으로 숙이고 콧방울 10~15분 연속 압박, 뒤로 젖히지 않음"],
      ["tooth", "빠진 영구치는 뿌리를 만지지 않고 우유에 담아 빠른 치과 안내"],
      ["insect", "벌침 제거·냉찜질, 전신 반응(호흡곤란·전신 두드러기)은 119"],
      ["heat", "더위: 시원한 곳·옷 느슨하게·수분, 의식 이상은 119"],
      ["cold", "추위: 젖은 옷 제거·서서히 따뜻하게, 문지르지 않음"],
    ],
    materials: ["AS-GDE-001 §10·§11", "냉찜질팩·얼음주머니", "우유 보관 안내(치아)"],
    evaluation: [
      "경련 중 해서는 안 되는 행동을 말할 수 있는가",
      "코피 자세와 압박 시간을 정확히 말할 수 있는가",
      "빠진 영구치 보관 방법을 말할 수 있는가",
    ],
  },
  {
    key: "INFECT",
    phase: "감염",
    title: "혈액·구토물 처리 · 감염노출",
    minutes: 15,
    goal: "장갑·소독·폐기 순서와 노출 후 보고 절차를 몸에 익히게 합니다.",
    items: [
      ["ppe", "장갑 필수, 필요 시 마스크·앞치마 착용"],
      ["absorb", "흡수재로 덮어 안쪽에서 바깥으로 닦아냄, 흩날리지 않게"],
      ["disinfect", "염소계 소독제로 소독 후 세척, 사용한 도구는 폐기·소독"],
      ["waste", "오염 폐기물은 밀봉해 지정 폐기, 손 위생 철저"],
      ["exposure", "직원이 혈액·체액에 노출되면 즉시 세척 후 총괄 보고 → 의료평가 안내"],
      ["record", "노출·처리 내용을 AS-CARE에 기록, 필요 시 사건으로 승격"],
    ],
    materials: ["구토물 처리 키트", "염소계 소독제·1회용 장갑", "AS-GDE-001 §12"],
    evaluation: [
      "처리 순서(덮기→닦기→소독→폐기)를 말할 수 있는가",
      "직원 감염노출 시 첫 행동과 보고 대상을 말할 수 있는가",
      "오염 폐기물을 일반 쓰레기로 버리면 안 되는 이유를 설명할 수 있는가",
    ],
  },
  {
    key: "KIT",
    phase: "운영",
    title: "구급상자 운영 · 사용 · 보충 · 폐기",
    minutes: 20,
    goal: "위치·사용기록 원칙과 실사 때 확인할 항목을 그대로 점검할 수 있게 합니다.",
    items: [
      ["where", "3개 Site 구급상자 위치·접근 방법을 실제로 걸어보며 확인"],
      ["baseline", "기준수량 대비 안전재고(min_qty)와 보충 권장량 이해"],
      ["label", "EXP·개봉 후 사용기한(생리식염수 24시간 등) 표시 확인"],
      ["use_log", "사용 시 반드시 장부(사용대장) 기록, 영업종료 전 마감"],
      ["refill", "부족·손상 발견 시 구매 요청 → 입고 → 로트 등록"],
      ["level_c", "Level C 제한관리품 분리 보관·표시 확인"],
      ["dispose", "유효기간 경과·개봉 후 초과 품목은 폐기 기록 후 교체"],
      ["stocktake", "월 1회 실사: 전수/샘플 구분, 확인자 동석, 대표 서명"],
    ],
    materials: ["구급상자 실물", "AS-KIT-001 §06 정기점검 16항목", "실사표·사용대장"],
    evaluation: [
      "구급상자 사용 후 반드시 해야 하는 기록을 말할 수 있는가",
      "안전재고와 보충 권장량의 차이를 설명할 수 있는가",
      "폐기 대상이 되는 두 가지 기준을 말할 수 있는가",
    ],
  },
  {
    key: "OTC",
    phase: "운영",
    title: "직원 개인 상비약 · 중복성분",
    minutes: 20,
    goal: "직원 상비약은 '본인 자가선택·자가복용'임을 정확히 이해시키고 중복성분을 확인하게 합니다.",
    items: [
      ["owner", "상비약은 소유 직원 본인만 복용. 다른 직원에게 권하지 않습니다"],
      ["self", "약 종류·용량을 남이 정해주지 않습니다. 본인이 포장·설명서를 확인"],
      ["redflag", "복용 전 가슴통증·식은땀·숨참 등 위험신호 먼저 확인"],
      ["duplicate_ibu", "이브400(이부프로펜)과 이지엔6 이브는 중복 → 함께 먹지 않음"],
      ["duplicate_apap", "레드코프-F·블루콜엠 등은 아세트아미노펜 중복 가능 → 확인 없이 추가 금지"],
      ["alcohol", "음주 중이거나 취기가 있으면 개인 상비약을 복용하지 않습니다"],
      ["reaction", "복용 후 숨참·처짐 등 이상 시 추가 복용 중단 → 119, 제품명·수량·시각 인계"],
      ["record", "복용·이상 반응은 AS-CARE에 기록. 지시받지 않은 내용을 말하지 않음"],
    ],
    materials: ["OTC-001~013 목록표", "AS-KIT-001 §07", "AS-CARE 작성 예시"],
    evaluation: [
      "중복성분이 되는 조합을 2가지 이상 말할 수 있는가",
      "다른 직원이 '이 약 먹어'라고 하면 어떻게 해야 하는지 말할 수 있는가",
      "복용 후 이상 반응 시 인계해야 하는 3가지를 말할 수 있는가",
    ],
  },
  {
    key: "REPORT",
    phase: "기록",
    title: "AS-CARE · 사건기록 · 119 인계 · 증빙",
    minutes: 20,
    goal: "사건 직후 기록을 남기고, 119 인계 문구를 그대로 읽을 수 있게 합니다.",
    items: [
      ["when", "AS-CARE는 비응급 3일 이내·응급 24시간 이내 작성(원칙)"],
      ["header", "사건 접수(비식별) → AS-CARE(상세) 순서로 연결"],
      ["content", "발생시각·장소·상태·취한 조치·경과·인계 대상을 사실만 기록"],
      ["attach", "사진·서명본·외부문서(HWP·DOCX·PDF)를 AS-CARE에 첨부"],
      ["followup", "후속조치(경과 확인·재발 방지)는 7일 이내 마감"],
      ["call119", "119 신고 시 주소·출입구·환자 상태·조치 내용을 순서대로 전달"],
      ["no_fake", "하지 않은 처치·교육·점검 기록 금지, 지시받지 않은 말을 만들지 않음"],
    ],
    materials: ["AS-CARE 서식", "119 신고 문구(§18)", "증빙ID 규칙표"],
    evaluation: [
      "AS-CARE 작성 기한 두 가지를 말할 수 있는가",
      "119 신고 시 전달할 4가지를 순서대로 말할 수 있는가",
      "기록에 절대 쓰면 안 되는 내용을 예를 들어 설명할 수 있는가",
    ],
  },
  {
    key: "PRIVACY",
    phase: "기록",
    title: "개인정보 · 민감정보 · 열람사유",
    minutes: 15,
    goal: "상세 건강기록의 열람 조건과 사유·증빙 원칙을 정확히 알게 합니다.",
    items: [
      ["scope", "성명·연락처·증상·처치 등 식별 가능 정보는 상세 건강기록으로만 관리"],
      ["director", "상세 건강기록 작성·조회는 총괄(최윤희 RN) 권한"],
      ["owner_reason", "대표 열람은 정당한 사유와 증빙이 있어야 하고 총괄 승인 후 가능"],
      ["per_record", "승인은 사건 1건 단위. 다른 사건으로 확장되지 않습니다"],
      ["nolook", "고객·직원에게 환자 정보를 공유하지 않습니다"],
      ["log", "열람·승인·반려는 모두 감사로그에 남고 월 1회 점검 대상입니다"],
    ],
    materials: ["AS-PRIV-001 개인정보 처리방침", "열람 신청서 예시", "감사로그 화면"],
    evaluation: [
      "상세 건강기록을 조회할 수 있는 사람을 말할 수 있는가",
      "대표가 열람하려면 무엇이 필요한지 말할 수 있는가",
      "환자 정보를 대화로 공유하면 왜 문제인지 설명할 수 있는가",
    ],
  },
  {
    key: "GATE",
    phase: "마감",
    title: "월말 Gate · 실사 · 서명",
    minutes: 15,
    goal: "월말 마감 순서(실사 → 정산 → Gate → 대표 서명)를 순서대로 확인하게 합니다.",
    items: [
      ["stocktake", "월 1회 실사 완료 후 재고 반영(적용) 여부 확인"],
      ["usage", "사용대장·소모금액 마감, 영업종료 전 누락 확인"],
      ["expense", "보충·구매 실비정산 제출, 증빙(영수증·세금계산서) 확인"],
      ["gate_day", "월말 Gate는 25일 이후 진행, 미조치 항목 0건 만들기"],
      ["signer", "대표 서명·확인자 표기, 서명자 이름을 정확히 기록"],
      ["archive", "월간 업무폴더·증빙ID 정리 후 다음 달 준비"],
    ],
    materials: ["월간 Gate 체크리스트", "실사표", "지출·정산 목록"],
    evaluation: [
      "월말 마감 순서 4단계를 순서대로 말할 수 있는가",
      "Gate 이후에도 남는 항목이 있으면 어떻게 해야 하는지 말할 수 있는가",
      "증빙이 없을 때 처리 방법을 설명할 수 있는가",
    ],
  },
];

/** AS-GDE-001 §15 상황연습 — 직원이 말로 답할 수 있어야 하는 21개 상황. */
export const ARC_TRAINING_SCENARIOS = [
  {
    key: "S01",
    no: 1,
    category: "출혈",
    scene: "유리잔 정리 중 손가락을 깊게 베었고 피가 계속 난다",
    answer:
      "장갑 → 거즈 직접압박 → 119 판단 → 감각·움직임 확인. 피가 비쳐도 거즈를 계속 떼지 않는다.",
  },
  {
    key: "S02",
    no: 2,
    category: "출혈",
    scene: "손가락이 거의 잘려 붙어 있다",
    answer: "떼어내지 않음 → 지속 압박 → 즉시 119 → 조직 보호(얼음에 직접 대지 않음).",
  },
  {
    key: "S03",
    no: 3,
    category: "주취",
    scene: "계단에서 넘어진 취객이 두 번 토하고 점점 잠든다",
    answer: "술로 단정 금지 → 즉시 119 → 호흡 관찰 → 불필요한 이동 금지.",
  },
  {
    key: "S04",
    no: 4,
    category: "기도",
    scene: "안주 먹던 손님이 목을 잡고 말을 못 한다",
    answer: "심한 기도폐쇄 → 119 → 등 5회/복부 5회 → 의식 잃으면 CPR.",
  },
  {
    key: "S05",
    no: 5,
    category: "심정지",
    scene: "손님이 바닥에 쓰러져 반응 없고 헐떡인다",
    answer: "심정지 의심 → 119 → 가슴압박 → AED.",
  },
  {
    key: "S06",
    no: 6,
    category: "화상",
    scene: "뜨거운 팬에 손등을 데었다",
    answer:
      "열원 제거 → 반지 제거 가능 시 제거 → 흐르는 물 20분 → 거즈. 얼음·바세린 금지.",
  },
  {
    key: "S07",
    no: 7,
    category: "알레르기",
    scene: "새우 안주 후 입술이 붓고 숨쉬기 힘들다",
    answer: "아나필락시스 의심 → 즉시 119 → 본인 처방 자가주사기 사용 도움 → 혼자 두지 않음.",
  },
  {
    key: "S08",
    no: 8,
    category: "주취",
    scene: "평소보다 적게 마셨는데 갑자기 걷지 못하고 기억이 끊긴다",
    answer: "원인 단정 금지 → 반응·호흡 확인 → 혼자 두지 않음 → 악화/의식저하 시 119.",
  },
  {
    key: "S09",
    no: 9,
    category: "뇌졸중",
    scene: "손님이 갑자기 한쪽 얼굴이 처지고 말이 어눌하다",
    answer: "FAST 양성 → 시작시각 확인 → 즉시 119 → 먹거나 마시게 하지 않음.",
  },
  {
    key: "S10",
    no: 10,
    category: "화학",
    scene: "직원이 세척제를 눈에 튀었다",
    answer: "즉시 흐르는 물 20분 이상 세척 → 시야·통증 확인 → 제품 라벨과 함께 진료/119 판단.",
  },
  {
    key: "S11",
    no: 11,
    category: "발작",
    scene: "경련하는 손님 입에 누군가 숟가락을 넣으려 한다",
    answer:
      "중단시킴 → 주변 치움 → 시간 재기 → 입에 아무것도 넣지 않음 → 5분 이상이면 119.",
  },
  {
    key: "S12",
    no: 12,
    category: "출혈",
    scene: "코피가 나는데 고개를 뒤로 젖히고 있다",
    answer: "앞으로 숙임 → 콧방울 10~15분 연속 압박 → 지속 시 재압박/의료평가.",
  },
  {
    key: "S13",
    no: 13,
    category: "치아",
    scene: "영구치가 빠졌다",
    answer: "뿌리 만지거나 문지르지 않음 → 우유에 보관 → 빠른 치과.",
  },
  {
    key: "S14",
    no: 14,
    category: "감전",
    scene: "감전된 직원이 기기에 붙어 있는 것처럼 보인다",
    answer: "전원 차단 전 맨손 접근 금지 → 전원 차단 → 반응·호흡 → 119/의료평가.",
  },
  {
    key: "S15",
    no: 15,
    category: "실신",
    scene: "화장실 가던 손님이 일어나다 핑 돌며 쓰러졌다",
    answer: "눕혀 반응·호흡 확인 → 머리부상 여부 → 5분 이상 회복 안 되면 119.",
  },
  {
    key: "S16",
    no: 16,
    category: "OTC",
    scene: "직원이 속쓰림이 나서 자기 개인 상비약을 찾는다",
    answer:
      "가슴통증·식은땀·숨참 등 위험신호를 먼저 확인 → 위험신호가 없으면 직원 본인이 자기 약 원포장·설명서를 확인해 스스로 판단 → AS-CARE 작성. 다른 사람이 특정 제품을 골라주지 않는다.",
  },
  {
    key: "S17",
    no: 17,
    category: "고객약",
    scene: '손님이 "타이레놀 하나만 달라"고 한다',
    answer:
      "경구 일반의약품은 직원 개인소유이므로 타인에게 제공하지 않는다. 손님 상태를 확인하고 필요 시 약국/의료기관/119를 안내한다.",
  },
  {
    key: "S18",
    no: 18,
    category: "중복성분",
    scene: "직원이 이브400을 먹었는데 이지엔6 이브도 먹으려 한다",
    answer:
      "둘 다 이부프로펜이므로 같이 먹지 않게 중복성분을 확인하게 한다. 직원 본인이 설명서를 확인하고 필요 시 약사/의료기관에 문의한다.",
  },
  {
    key: "S19",
    no: 19,
    category: "중복성분",
    scene: "직원이 레드코프-F를 먹고 타이레놀을 추가하려 한다",
    answer: "레드코프-F에 아세트아미노펜이 들어 있을 수 있어 중복 확인 없이 추가복용하지 않는다.",
  },
  {
    key: "S20",
    no: 20,
    category: "OTC",
    scene: "직원이 약을 먹은 뒤 숨이 차고 처진다",
    answer:
      "추가약 중단 → 119/의료기관 → 복용한 제품명·수량·복용시각을 인계. 실제 사실과 다르게 누가 먹으라고 했다고 말하지 않는다.",
  },
  {
    key: "S21",
    no: 21,
    category: "상처",
    scene: "작은 상처에 과산화수소를 바로 붓으려 한다",
    answer:
      "일상 상처 기본세척은 흐르는 물/멸균 생리식염수 우선. 과산화수소는 기본세척제로 지정하지 않는다.",
  },
];

/** AS-GDE-001 §16 일반직원 절대금지 30개 — 교육시험에 반드시 포함. */
export const ARC_TRAINING_FORBIDDEN = [
  { key: "F01", text: "위급한데 메딕 답변을 기다리느라 119를 늦추기" },
  { key: "F02", text: "의식 없는 사람의 맥박을 오래 찾느라 CPR을 미루기" },
  { key: "F03", text: "주취자를 '재우면 된다'고 혼자 방치하기" },
  { key: "F04", text: "의식저하자에게 물·커피·사탕·약을 억지로 먹이기" },
  { key: "F05", text: "경련 중 입에 설압자·숟가락·손가락 넣기" },
  { key: "F06", text: "박힌 칼·큰 유리·깊은 이물을 빼기" },
  { key: "F07", text: "부분절단 조직을 완전히 떼기" },
  { key: "F08", text: "절단부를 얼음에 직접 대기" },
  { key: "F09", text: "골절·탈구를 억지로 맞추기" },
  { key: "F10", text: "화상에 얼음·바세린·치약·소주·연고를 임의로 바르기" },
  { key: "F11", text: "화상 물집 터뜨리기" },
  { key: "F12", text: "눈을 핀셋/면봉으로 건드리기" },
  { key: "F13", text: "화학물질을 다른 화학물질로 중화하기" },
  { key: "F14", text: "전원 차단 전 감전 환자를 맨손으로 잡기" },
  { key: "F15", text: "과호흡처럼 보여도 종이봉투를 씌우기" },
  { key: "F16", text: "BP·SpO₂가 정상이라는 이유로 심한 증상을 무시하기" },
  { key: "F17", text: "직원이 약 종류·용량을 선택하거나 남의 약을 주기" },
  { key: "F18", text: "RN 제한품을 일반직원이 임의 사용하기" },
  { key: "F19", text: "머리 다친 주취자를 억지로 걷게 하거나 혼자 귀가시키기" },
  { key: "F20", text: "가해자·무기 위험이 남은 상황에 무리하게 뛰어들기" },
  { key: "F21", text: "실제로 하지 않은 처치·교육·점검을 기록하기" },
  { key: "F22", text: "환자 정보를 손님들에게 불필요하게 공유하기" },
  {
    key: "F23",
    text: "손님에게 타이레놀·감기약·설사약·알레르기약 등 경구 일반의약품을 한 알이라도 제공·판매·권유하기",
  },
  {
    key: "F24",
    text: "직원이 다른 직원에게 '이 약 먹어'라고 약 종류·용량을 정해 주기(개인 상비약은 본인 자가선택·자가복용)",
  },
  { key: "F25", text: "이브400원큐에스와 이지엔6 이브를 같이 먹기(이부프로펜 중복)" },
  {
    key: "F26",
    text: "레드코프-F와 타이레놀, 레드코프-F와 블루콜M 등 성분이 겹칠 수 있는 약을 확인 없이 함께 복용하기",
  },
  { key: "F27", text: "술을 마셨거나 취기가 있는 직원이 직원 개인 상비약을 복용하기" },
  { key: "F28", text: "약 복용 후 상태가 나빠졌는데 추가약을 계속 먹으며 병원/119를 미루기" },
  {
    key: "F29",
    text: "실제로 지시받지 않았는데 담당 RN이 먹으라고 했다고 허위로 말하거나 기록하기",
  },
  { key: "F30", text: "눈·화상·깊은 상처에 포비돈·과산화수소·마데카솔을 임의로 바르기" },
];

export function arcTrainingCatalog({ overrides = {} } = {}) {
  // 원문 → 심화 → 총괄 수정 순서로 합칩니다.
  const merged = mergeTrainingContent(
    {
      modules: ARC_TRAINING_MODULES,
      scenarios: ARC_TRAINING_SCENARIOS,
      forbidden: ARC_TRAINING_FORBIDDEN,
    },
    overrides
  );

  return {
    kinds: ARC_TRAINING_KINDS,
    statuses: ARC_TRAINING_STATUSES,
    results: ARC_TRAINING_RESULTS,
    // 교육자료는 일반인(사장·직원)이 그대로 읽습니다.
    // 어려운 말이 나오면 항목마다 쉬운 풀이(terms)를 함께 내려 줍니다.
    modules: merged.modules.map((item) => ({
      ...item,
      itemTerms: (item.items ?? []).map(([, line]) => collectArcTerms(line)),
      terms: collectArcTerms([
        item.goal,
        item.summary,
        item.why,
        ...(item.items ?? []).map(([, line]) => line),
        ...Object.values(item.itemDetails ?? {}),
      ]),
    })),
    scenarios: merged.scenarios.map((item) => ({
      ...item,
      terms: collectArcTerms([
        item.scene,
        item.answer,
        item.why,
        item.steps,
        item.wrong,
        item.basis,
      ]),
    })),
    forbidden: merged.forbidden.map((item) => ({
      ...item,
      terms: collectArcTerms([
        item.text,
        item.why,
        item.instead,
        item.risk,
        item.signs,
        item.drill,
        item.basis,
      ]),
    })),
    makeupDays: MAKEUP_DAYS,
  };
}

const KIND_KEYS = new Set(ARC_TRAINING_KINDS.map((item) => item.key));
// 교육 모듈을 고르지 않아도 되는 구분(루틴·개인 일정).
const OPTIONAL_MODULE_KINDS = new Set(
  ARC_TRAINING_KINDS.filter((item) => item.modulesOptional).map((item) => item.key)
);
const PERSONAL_KINDS = new Set(
  ARC_TRAINING_KINDS.filter((item) => item.personal).map((item) => item.key)
);
const STATUS_KEYS = new Set(ARC_TRAINING_STATUSES.map((item) => item.key));
const RESULT_KEYS = new Set(ARC_TRAINING_RESULTS.map((item) => item.key));
const MODULE_KEYS = new Set(ARC_TRAINING_MODULES.map((item) => item.key));
const SCENARIO_KEYS = new Set(ARC_TRAINING_SCENARIOS.map((item) => item.key));

function text(value, max = 200) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function round2(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function todayIso() {
  const now = new Date();
  const offsetMinutes = -now.getTimezoneOffset();

  return new Date(now.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

function requireDate(value, field) {
  const raw = text(value, 10);

  if (!DATE_PATTERN.test(raw)) {
    throw badRequest(`${field}은(는) YYYY-MM-DD 형식으로 입력해 주세요.`);
  }

  return raw;
}

function addDays(isoDate, days) {
  const base = new Date(`${isoDate}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + Number(days));

  return base.toISOString().slice(0, 10);
}

function normalizeKeys(value, allowed) {
  const list = Array.isArray(value) ? value : [];

  return [...new Set(list.map((item) => text(item, 20).toUpperCase()).filter((key) => allowed.has(key)))];
}

function mapAttendee(row) {
  return {
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    attended: Boolean(row.attended),
    signedAt: row.signed_at,
    score: row.score === null ? null : round2(row.score),
    result: row.result,
    makeupDueOn: row.makeup_due_on ? String(row.makeup_due_on).slice(0, 10) : null,
    note: row.note,
  };
}

function mapSession(row, attendees = []) {
  const modules = (Array.isArray(row.module_keys) ? row.module_keys : [])
    .map((key) => ARC_TRAINING_MODULES.find((item) => item.key === key))
    .filter(Boolean);
  const scenarios = (Array.isArray(row.scenario_keys) ? row.scenario_keys : [])
    .map((key) => ARC_TRAINING_SCENARIOS.find((item) => item.key === key))
    .filter(Boolean);
  const scheduledOn = row.scheduled_on ? String(row.scheduled_on).slice(0, 10) : null;
  const attendedCount = attendees.filter((item) => item.attended).length;

  return {
    id: row.id,
    sessionNo: row.session_no,
    period: row.period,
    kind: row.kind,
    isPersonal: PERSONAL_KINDS.has(row.kind),
    ownerLoginId: row.owner_login_id || "",
    title: row.title,
    scheduledOn,
    startTime: row.start_time,
    durationMin: Number(row.duration_min ?? 0),
    place: row.place,
    instructor: row.instructor,
    moduleKeys: modules.map((item) => item.key),
    modules: modules.map((item) => ({
      key: item.key,
      title: item.title,
      minutes: item.minutes,
      phase: item.phase,
    })),
    scenarioKeys: scenarios.map((item) => item.key),
    scenarios: scenarios.map((item) => ({ key: item.key, no: item.no, scene: item.scene })),
    materials: Array.isArray(row.materials) ? row.materials : [],
    status: row.status,
    evidenceId: row.evidence_id,
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    attendees,
    attendeeCount: attendees.length,
    attendedCount,
    followupCount: attendees.filter((item) => item.result === "MAKEUP" || item.result === "FAIL").length,
    estimatedMinutes: modules.reduce((total, item) => total + Number(item.minutes ?? 0), 0),
  };
}

function normalizeSessionInput(input = {}, current = null) {
  const kind = text(input.kind ?? current?.kind ?? "REGULAR", 20).toUpperCase();

  if (!KIND_KEYS.has(kind)) {
    throw badRequest("교육 구분이 올바르지 않아요.");
  }

  const status = text(input.status ?? current?.status ?? "PLANNED", 20).toUpperCase();

  if (!STATUS_KEYS.has(status)) {
    throw badRequest("진행 상태가 올바르지 않아요.");
  }

  const scheduledOn = requireDate(input.scheduledOn ?? current?.scheduledOn, "교육일");
  const startTime = text(input.startTime ?? current?.startTime ?? "15:00", 5);

  if (!TIME_PATTERN.test(startTime)) {
    throw badRequest("시작 시간은 HH:MM 형식으로 입력해 주세요.");
  }

  const durationRaw = input.durationMin ?? current?.durationMin ?? 30;
  const durationMin = Math.round(Number(durationRaw));

  if (!Number.isFinite(durationMin) || durationMin < 5 || durationMin > 480) {
    throw badRequest("교육 시간은 5~480분 사이로 입력해 주세요.");
  }

  const moduleKeys = normalizeKeys(
    input.moduleKeys ?? current?.moduleKeys ?? ARC_TRAINING_KINDS.find((item) => item.key === kind)?.modules,
    MODULE_KEYS
  );

  if (moduleKeys.length === 0 && !OPTIONAL_MODULE_KINDS.has(kind)) {
    throw badRequest("교육 모듈을 1개 이상 선택해 주세요.");
  }

  const materials = (Array.isArray(input.materials ?? current?.materials)
    ? input.materials ?? current?.materials
    : []
  )
    .map((item) => text(item, 120))
    .filter(Boolean)
    .slice(0, 20);

  return {
    kind,
    status,
    scheduledOn,
    period: scheduledOn.slice(0, 7),
    startTime,
    durationMin,
    place: text(input.place ?? current?.place, 120),
    instructor: text(input.instructor ?? current?.instructor, 60),
    title: text(input.title ?? current?.title, 160),
    moduleKeys,
    scenarioKeys: normalizeKeys(input.scenarioKeys ?? current?.scenarioKeys, SCENARIO_KEYS),
    materials,
    evidenceId: text(input.evidenceId ?? current?.evidenceId, 60),
    note: text(input.note ?? current?.note, 1000),
  };
}

async function loadAttendees(sessionIds = []) {
  if (sessionIds.length === 0) return new Map();

  const { rows } = await pool.query(
    `select session_id, employee_id, employee_name, attended, signed_at, score, result,
            makeup_due_on, note
       from public.arc_training_attendees
      where session_id = any($1::uuid[])
      order by employee_name`,
    [sessionIds]
  );

  const grouped = new Map();

  for (const row of rows) {
    const list = grouped.get(row.session_id) ?? [];
    list.push(mapAttendee(row));
    grouped.set(row.session_id, list);
  }

  return grouped;
}

/** 출석 대상이 될 수 있는 재직 직원 목록(최윤희 총괄 포함). */
export async function listArcTrainingStaff() {
  const { rows } = await pool.query(
    `select id, login_id, name, role, title
       from public.employees
      where is_active
      order by
        case role when 'OWNER' then 0 when 'MANAGER' then 1 else 2 end,
        name`,
    []
  );

  return rows.map((row) => ({
    id: row.id,
    loginId: row.login_id,
    name: row.name || row.login_id,
    role: row.role,
    title: row.title || "",
  }));
}

export async function listArcTrainingSessions({
  period = null,
  limit = 60,
  viewerLoginId = "",
  viewerIsDirector = false,
} = {}) {
  const safePeriod = text(period, 7);
  const safeLimit = Math.min(Math.max(Number(limit) || 60, 1), MAX_LIMIT);
  const viewer = text(viewerLoginId, 40).toLowerCase();

  if (safePeriod && !PERIOD_PATTERN.test(safePeriod)) {
    throw badRequest("조회 월은 YYYY-MM 형식으로 입력해 주세요.");
  }

  const { rows } = await pool.query(
    `select *
       from public.arc_training_sessions
      where ($1::text is null or period = $1)
        and (kind <> 'PERSONAL' or (owner_login_id <> '' and owner_login_id = $3))
        and (not (kind = any($4::text[])) or $5::boolean)
      order by scheduled_on desc, start_time desc, created_at desc
      limit $2`,
    [safePeriod || null, safeLimit, viewer, DIRECTOR_ONLY_KINDS, Boolean(viewerIsDirector)]
  );

  const attendees = await loadAttendees(rows.map((row) => row.id));
  const sessions = rows.map((row) => mapSession(row, attendees.get(row.id) ?? []));

  return {
    period: safePeriod || null,
    sessions,
    summary: {
      total: sessions.length,
      planned: sessions.filter((item) => item.status === "PLANNED").length,
      done: sessions.filter((item) => item.status === "DONE").length,
      canceled: sessions.filter((item) => item.status === "CANCELED").length,
      attended: sessions.reduce((total, item) => total + item.attendedCount, 0),
      followup: sessions.reduce((total, item) => total + item.followupCount, 0),
      minutes: sessions
        .filter((item) => item.status === "DONE")
        .reduce((total, item) => total + item.durationMin, 0),
    },
  };
}

export async function getArcTrainingSession(sessionId) {
  const { rows } = await pool.query(`select * from public.arc_training_sessions where id = $1`, [
    sessionId,
  ]);

  if (rows.length === 0) {
    throw new HttpError(404, "HJ404", "교육 일정을 찾을 수 없어요.");
  }

  const attendees = await loadAttendees([rows[0].id]);

  return mapSession(rows[0], attendees.get(rows[0].id) ?? []);
}

async function nextSessionNo(scheduledOn) {
  const stamp = scheduledOn.replaceAll("-", "");
  const { rows } = await pool.query(
    `select count(*)::int as used
       from public.arc_training_sessions
      where session_no like $1`,
    [`EDU-${stamp}-%`]
  );
  const used = Number(rows[0]?.used ?? 0);

  return `EDU-${stamp}-${String(used + 1).padStart(2, "0")}`;
}

function defaultTitle(input) {
  if (input.title) return input.title;

  const kind = ARC_TRAINING_KINDS.find((item) => item.key === input.kind);
  const firstModule = ARC_TRAINING_MODULES.find((item) => item.key === input.moduleKeys[0]);

  return [kind?.label, firstModule?.title].filter(Boolean).join(" · ") || "정기교육";
}

export async function createArcTrainingSession(input = {}, employee = null) {
  const session = normalizeSessionInput(input);

  if (session.status === "DONE" && !session.evidenceId) {
    throw badRequest("완료 처리하려면 증빙ID(교육일지·사진)를 남겨 주세요.");
  }

  const title = defaultTitle({ ...session, title: session.title || "" });
  const createdBy = text(employee?.name, 60) || text(employee?.loginId, 60);
  // 개인 일정은 만든 사람(총괄)에게만 귀속됩니다.
  const ownerLoginId = PERSONAL_KINDS.has(session.kind)
    ? text(employee?.loginId, 40).toLowerCase()
    : "";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const sessionNo = await nextSessionNo(session.scheduledOn);

    try {
      const { rows } = await pool.query(
        `insert into public.arc_training_sessions
           (id, session_no, period, kind, title, scheduled_on, start_time, duration_min, place,
            instructor, module_keys, scenario_keys, materials, status, evidence_id, note, created_by,
            owner_login_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb,
                 $14, $15, $16, $17, $18)
         returning id`,
        [
          randomUUID(),
          sessionNo,
          session.period,
          session.kind,
          title,
          session.scheduledOn,
          session.startTime,
          session.durationMin,
          session.place,
          session.instructor,
          JSON.stringify(session.moduleKeys),
          JSON.stringify(session.scenarioKeys),
          JSON.stringify(session.materials),
          session.status,
          session.evidenceId,
          session.note,
          createdBy,
          ownerLoginId,
        ]
      );

      return getArcTrainingSession(rows[0].id);
    } catch (error) {
      if (error?.code === "23505") continue;
      throw error;
    }
  }

  throw badRequest("교육 일정 번호를 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
}

export async function updateArcTrainingSession(sessionId, patch = {}, employee = null) {
  const current = await getArcTrainingSession(sessionId);
  const session = normalizeSessionInput(patch, current);

  if (session.status === "DONE" && !session.evidenceId) {
    throw badRequest("완료 처리하려면 증빙ID(교육일지·사진)를 남겨 주세요.");
  }

  await pool.query(
    `update public.arc_training_sessions
        set period = $2,
            kind = $3,
            title = $4,
            scheduled_on = $5,
            start_time = $6,
            duration_min = $7,
            place = $8,
            instructor = $9,
            module_keys = $10::jsonb,
            scenario_keys = $11::jsonb,
            materials = $12::jsonb,
            status = $13,
            evidence_id = $14,
            note = $15,
            owner_login_id = $16,
            updated_at = now()
      where id = $1`,
    [
      sessionId,
      session.period,
      session.kind,
      patch.title === undefined ? current.title : session.title,
      session.scheduledOn,
      session.startTime,
      session.durationMin,
      session.place,
      session.instructor,
      JSON.stringify(session.moduleKeys),
      JSON.stringify(session.scenarioKeys),
      JSON.stringify(session.materials),
      session.status,
      session.evidenceId,
      session.note,
      PERSONAL_KINDS.has(session.kind)
        ? current.ownerLoginId || text(employee?.loginId, 40).toLowerCase()
        : "",
    ]
  );

  return getArcTrainingSession(sessionId);
}

export async function deleteArcTrainingSession(sessionId) {
  const { rows } = await pool.query(
    `delete from public.arc_training_sessions where id = $1 returning session_no`,
    [sessionId]
  );

  if (rows.length === 0) {
    throw new HttpError(404, "HJ404", "교육 일정을 찾을 수 없어요.");
  }

  return { deleted: true, sessionNo: rows[0].session_no };
}

/**
 * 참석자 명단을 통째로 저장합니다(넘긴 목록이 최종 상태).
 * 이름은 서버에서 직원 테이블로 다시 확인해 화면 값을 신뢰하지 않습니다.
 */
export async function saveArcTrainingAttendees(sessionId, attendees = [], employee = null) {
  const session = await getArcTrainingSession(sessionId);
  const list = Array.isArray(attendees) ? attendees : [];
  const staff = await listArcTrainingStaff();
  const staffById = new Map(staff.map((item) => [item.id, item]));
  const kept = new Map();

  for (const raw of list) {
    const employeeId = text(raw?.employeeId, 40);

    if (!employeeId || !staffById.has(employeeId) || kept.has(employeeId)) continue;

    const result = text(raw?.result ?? "PENDING", 20).toUpperCase();

    if (!RESULT_KEYS.has(result)) {
      throw badRequest("평가 결과 값이 올바르지 않아요.");
    }

    const attended = Boolean(raw?.attended);
    const scoreRaw =
      raw?.score === undefined || raw?.score === null || raw?.score === ""
        ? null
        : Number(raw.score);

    if (scoreRaw !== null && (!Number.isFinite(scoreRaw) || scoreRaw < 0 || scoreRaw > 100)) {
      throw badRequest("점수는 0~100 사이로 입력해 주세요.");
    }

    // 불참인데 통과로 남길 수는 없습니다. 사유 불참이 아니면 보충 대상으로 돌립니다.
    const finalResult = !attended && result === "PASS" ? "MAKEUP" : result;
    const needsMakeup =
      finalResult === "FAIL" || (finalResult !== "EXCUSED" && (!attended || finalResult === "MAKEUP"));
    const makeupDueOn = needsMakeup ? addDays(session.scheduledOn ?? todayIso(), MAKEUP_DAYS) : null;

    kept.set(employeeId, {
      employeeId,
      employeeName: staffById.get(employeeId).name,
      attended,
      result: finalResult,
      score: scoreRaw === null ? null : round2(scoreRaw),
      signedAt: attended ? new Date().toISOString() : null,
      makeupDueOn,
      note: text(raw?.note, 300),
    });
  }

  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query(`delete from public.arc_training_attendees where session_id = $1`, [sessionId]);

    for (const row of kept.values()) {
      await client.query(
        `insert into public.arc_training_attendees
           (session_id, employee_id, employee_name, attended, signed_at, score, result,
            makeup_due_on, note)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          sessionId,
          row.employeeId,
          row.employeeName,
          row.attended,
          row.signedAt,
          row.score,
          row.result,
          row.makeupDueOn,
          row.note,
        ]
      );
    }

    if (kept.size > 0 && session.status === "PLANNED") {
      await client.query(
        `update public.arc_training_sessions
            set status = 'DONE', updated_at = now()
          where id = $1 and status = 'PLANNED'`,
        [sessionId]
      );
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  return getArcTrainingSession(sessionId);
}

/** 화면 상단 카드용 — 이번 달 진행률과 보충 대상자. */
export async function arcTrainingSummary({ period = null, viewerIsDirector = false } = {}) {
  const safePeriod = PERIOD_PATTERN.test(text(period, 7)) ? text(period, 7) : todayIso().slice(0, 7);
  const { rows } = await pool.query(
    `select
        count(*) filter (where s.status = 'DONE')::int as done,
        count(*) filter (where s.status = 'PLANNED')::int as planned,
        count(*)::int as total
       from public.arc_training_sessions s
      where s.period = $1
        and s.kind <> 'PERSONAL'
        and (not (s.kind = any($2::text[])) or $3::boolean)`,
    [safePeriod, DIRECTOR_ONLY_KINDS, Boolean(viewerIsDirector)]
  );
  const { rows: followupRows } = await pool.query(
    `select a.employee_name, a.result, a.makeup_due_on, s.session_no, s.title
       from public.arc_training_attendees a
       join public.arc_training_sessions s on s.id = a.session_id
      where a.result in ('MAKEUP', 'FAIL') or (a.attended is false and a.result <> 'EXCUSED')
      order by a.makeup_due_on nulls last
      limit 20`,
    []
  );

  return {
    period: safePeriod,
    today: todayIso(),
    total: Number(rows[0]?.total ?? 0),
    done: Number(rows[0]?.done ?? 0),
    planned: Number(rows[0]?.planned ?? 0),
    followups: followupRows.map((row) => ({
      employeeName: row.employee_name,
      result: row.result,
      makeupDueOn: row.makeup_due_on ? String(row.makeup_due_on).slice(0, 10) : null,
      sessionNo: row.session_no,
      title: row.title,
    })),
  };
}
