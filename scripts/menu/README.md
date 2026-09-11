# Menu import (메뉴판 → products)

PDF 메뉴판을 `products` / `categories`에 반영할 때 쓰는 도구입니다.
PDF에서 뽑아낸 메뉴를 JSON으로 만들면, 이 스크립트가 기존 상품과 이름을 대조해서 갱신/추가/소프트 삭제를 계산합니다.

## 실행

```bash
# 1) 미리보기 (DB 변경 없음)
pnpm menu:import -- --file menu-data/menu.json

# 2) 실제 반영
pnpm menu:import -- --file menu-data/menu.json --apply

# 레시피(recipeInfo)만 반영 — 카테고리/가격/재고/삭제는 건드리지 않음
pnpm menu:import -- --file menu-data/menu.json --recipes-only --apply

# 재고 기본값 변경 (기본 99999)
pnpm menu:import -- --file menu-data/menu.json --apply --stock=500
```

루트의 `.env`(또는 `.env.migration`)에서 `VITE_SUPABASE_URL` / 키를 읽습니다.

## 입력 JSON 형식

```json
{
  "source": "메뉴판 2026-09",
  "syncCategories": true,
  "categories": [
    { "name": "시그니처 칵테일", "code": "signature" },
    { "name": "라이트 칵테일", "code": "cocktail-light" },
    { "name": "미디엄 칵테일", "code": "cocktail-medium" },
    { "name": "푸드", "code": "food" }
  ],
  "items": [
    {
      "name": "마티니",
      "price": 17000,
      "categories": ["인텐스 칵테일", "스트롱 칵테일"],
      "ingredients": ["진", "드라이 베르무트"],
      "recipeInfo": {
        "description": "마티니잔 · 스터",
        "ingredients": [
          { "name": "바톤 진", "amount": "2 oz" },
          { "name": "드라이 베르무트", "amount": "1 oz" }
        ],
        "steps": ["잔에 얼음 넣고 칠링"],
        "tips": ["가니쉬: 레몬 필"]
      },
      "optionGroups": [],
      "description": "진 · 드라이 베르무트\n진의 선명하고 드라이한 풍미를 담은 클래식 칵테일 · Alc 30%"
    },
    { "name": "감자튀김", "price": 8000, "category": "푸드" }
  ]
}
```

- `categories`는 생략 가능합니다. 생략하면 `items`에 처음 등장한 순서로 카테고리를 만듭니다.
- `categories`의 **배열 순서가 고객 화면 카테고리 칩 순서**입니다. 기존 카테고리도 이 순서에 맞춰 `sort_order`(순번 × 1000)를 동기화하고, `code`가 다르면 갱신합니다. 고객·태블릿 메뉴 목록에는 '전체' 칩이 없고 **첫 번째 카테고리가 기본 선택**됩니다.
- `categories[].code`는 어드민/필터에서 쓰는 식별자입니다(예: `cocktail-light`). 이미 같은 code면 건너뜁니다.
- `items[].categories`는 카테고리 **이름 배열**입니다. 첫 번째가 대표 카테고리(`category_id`)가 되고, 나머지는 `category_ids`에 함께 태깅됩니다(예: 한 메뉴를 여러 계열 카테고리에 동시에 노출).
- `items[].category`(단일 문자열)도 계속 지원합니다.
- `items[].ingredients`는 태블릿 레시피 모달용 재료 목록입니다. **기존 상품의 레시피가 비어 있을 때만** 채웁니다(작성해 둔 레시피를 덮어쓰지 않음).
- `items[].recipeInfo`는 레시피를 **통째로 교체**할 때 씁니다(키를 쓰면 그 값으로 맞춤). `description`은 레시피 모달 제목 아래 부제(예: `마티니잔 · 보스턴쉐이킹`), `ingredients`는 `{ name, amount }` 목록, `steps`는 제조 순서 문자열 배열, `tips`는 참고사항(가니쉬 등) 문자열 배열입니다. 표기 규칙: **숫자만 = oz**, `1bar` = 1 바스푼, `full` = 잔 채우기.
- `recipeInfo`를 쓰지 않는 항목은 기존 레시피가 그대로 유지됩니다(예: DB에 이미 정리된 레시피가 있는 메뉴).
- `--recipes-only`로 실행하면 `recipeInfo`가 있는 항목의 레시피만 갱신합니다. 카테고리·가격·설명·재고·소프트 삭제는 계산하지 않으니, 레시피만 손볼 때 안전합니다.
- `items[].description`은 고객 카드/옵션 시트에 그대로 노출됩니다. 줄바꿈(`\n`)을 넣으면 두 줄로 보입니다.
- `items[].optionGroups`는 옵션 그룹 배열입니다. **지정하면 기존 상품의 옵션 구성도 그 값으로 맞춥니다**(빈 배열 `[]` = 옵션 제거). 키를 아예 쓰지 않으면 기존 옵션은 그대로 두고, 새 상품만 옵션 없이 추가됩니다.
- `items[].stock`도 선택 사항이고, 없으면 `--stock` 기본값을 씁니다.

## 반영 규칙

| 상황 | 처리 |
| --- | --- |
| 이름이 같은 기존 상품 (공백/대소문자 무시) | 가격·카테고리·설명·정렬 갱신, `deleted_at=null` / `is_active=true`로 되살림 |
| `optionGroups`를 지정한 항목 | 기존 옵션 구성을 그 값으로 교체(빈 배열 `[]`이면 옵션 제거) |
| `recipeInfo`를 지정한 항목 | 레시피를 그 값으로 교체(재료/제조 순서/참고사항/부제 전부) |
| 메뉴 파일에 없는 기존 상품 | 소프트 삭제 (`deleted_at` + `is_active=false`) |
| 새 이름 | 새 상품 추가 (`image_url`은 빈 값 → 촬영 후 어드민에서 등록) |
| 재고가 0 이하인 기존 상품 | 기본 재고로 복구 (앱에서 재고 0은 품절로 처리됨) |
| `categories`에 없는 기존 카테고리 (`syncCategories: true`) | `is_active=false`로 비활성화 (어드민에서 다시 켤 수 있음) |

- 비활성화된 카테고리는 고객 화면 칩·선물 화면 칩·태블릿 필터에서 자동으로 빠집니다.
- 임포터는 카테고리 **행을 삭제하지 않습니다**. 완전히 지우려면 Supabase SQL Editor에서 `supabase/patch-004-remove-cocktail-category.sql` 같은 패치를 한 번 실행하세요.

- 정렬은 카테고리 순서 × 1000 + 항목 순서로 넣습니다. 고객 화면은 `sort_order` 오름차순으로 보여줍니다.
- 옵션 그룹·이미지·(recipeInfo를 쓰지 않은 항목의) 레시피 내용은 유지됩니다(설명은 메뉴판 기준으로 교체됨).
- 주문 내역은 `orders.items` 스냅샷이라 메뉴를 교체해도 영향이 없습니다.

## PDF 파싱

PDF → JSON 변환은 별도 단계입니다(`items` 배열만 만들어 주면 됩니다). 스캔 이미지 PDF는 OCR이 필요하니, 텍스트를 복사할 수 있는 PDF를 권장합니다.
