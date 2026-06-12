# 네이버 플레이스 방문자 리뷰 수집기

네이버 모바일 플레이스 리뷰 페이지에서 방문자 텍스트 리뷰를 수집하는 Next.js + Playwright 앱입니다.

숫자 플레이스 ID만 입력하면 네이버 모바일 플레이스의 범용 경로인 `place/{placeId}`를 먼저 시도하고, 정상 리뷰 페이지를 찾지 못하면 업종별 후보 URL을 순서대로 재시도합니다.

리뷰 수 기본값과 최대값은 `lib/review-config.ts`에서 공통으로 관리합니다. 현재 기본 수집 개수와 최대 수집 개수는 모두 500개입니다.

## 실행 방법

```bash
npm install
npm run playwright:install
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속한 뒤 네이버 플레이스 숫자 ID 또는 모바일 리뷰 URL을 입력합니다.

예시:

```txt
https://m.place.naver.com/place/2070415865/review/visitor
https://m.place.naver.com/restaurant/2070415865/review/visitor
https://m.place.naver.com/hospital/13350806/review/visitor
```

## 리뷰 수 설정

리뷰 수 제한은 `lib/review-config.ts`에서 관리합니다.

```ts
export const MIN_REVIEW_LIMIT = 1;
export const DEFAULT_MAX_REVIEWS = 500;
export const MAX_REVIEW_LIMIT = 500;
```

입력값은 `normalizeMaxReviews` 함수로 정규화합니다.

- 입력값이 없거나 숫자가 아니면 `DEFAULT_MAX_REVIEWS`를 사용합니다.
- 입력값이 1보다 작으면 `DEFAULT_MAX_REVIEWS`를 사용합니다.
- 입력값이 `MAX_REVIEW_LIMIT`보다 크면 `MAX_REVIEW_LIMIT`로 제한합니다.

예시:

```txt
입력값 없음 → 500개
입력값 100 → 100개
입력값 200 → 200개
입력값 500 → 500개
입력값 700 → 500개로 제한
```

`app/page.tsx`와 `lib/naver-place-reviews.ts`는 모두 `lib/review-config.ts`의 `DEFAULT_MAX_REVIEWS`, `MAX_REVIEW_LIMIT`, `normalizeMaxReviews`를 재사용합니다.

## 구현 요약

- `/api/reviews` 서버 API 라우트에서 Playwright Chromium을 실행합니다.
- 숫자 ID만 입력하면 `https://m.place.naver.com/place/{placeId}/review/visitor`로 먼저 접속합니다.
- `place/{placeId}` 경로에서 네이버가 실제 업종 URL로 리다이렉트하면, 리다이렉트된 최종 URL을 기준으로 리뷰를 수집합니다.
- `place/{placeId}`에서 정상 리뷰 페이지를 찾지 못하면 아래 순서로 후보 URL을 재시도합니다.
  - `place`
  - `hospital`
  - `restaurant`
  - `hairshop`
  - `nailshop`
  - `accommodation`
  - `pharmacy`
- 페이지 접속 시 `오류로 데이터를 불러오지 못했습니다.` 같은 임시 오류 문구가 보이면 최대 5회 새로고침합니다.
- `div.place_section_content`, `#_review_list`, `li.place_apply_pui`, `.pui__vn15t2` 중심으로 리뷰 텍스트를 추출합니다.
- 하단 `펼쳐서 더보기` 버튼을 반복 클릭하고 스크롤하면서 설정된 최대 리뷰 수까지 수집합니다.
- 개별 리뷰가 접혀 있을 때 보이는 `더보기` 버튼도 가능한 범위에서 먼저 펼친 뒤 텍스트를 읽습니다.
- 수집 중에는 사용자가 요청한 최대 리뷰 개수 기준으로 `총 n개 중 현재 n개 수집` 진행 상태를 표시합니다.
- 추출 결과는 아래처럼 번호가 포함된 텍스트 형식으로 출력합니다.

```txt
1.
리뷰 내용

2.
리뷰 내용
```

- 중복으로 보이던 `리뷰 미리보기` 영역은 제거하고, `추출 결과`만 표시합니다.
- 추출 결과는 클립보드로 복사할 수 있습니다.
- 추출 결과는 `.txt` 파일로 내보낼 수 있습니다.

## URL 처리 방식

네이버 모바일 플레이스는 `restaurant`, `hospital` 같은 URL 경로보다 숫자 `placeId`를 더 강하게 기준으로 삼는 경우가 있습니다.

예를 들어 음식점 ID가 `hospital/{placeId}` 경로에서도 열릴 수 있습니다. 하지만 업종별 경로에 따라 탭 구성이나 화면 구조가 달라질 수 있으므로, 특정 경로 하나에만 의존하지 않습니다.

이 앱은 아래 흐름으로 리뷰 페이지를 찾습니다.

```txt
place → hospital → restaurant → hairshop → nailshop → accommodation → pharmacy
```

즉, `place/{placeId}`를 범용 진입점처럼 먼저 사용하고, 실패하면 업종별 후보 URL을 순서대로 fallback합니다.

## 주의 사항

네이버 플레이스 화면 클래스명과 URL 라우팅 방식은 수시로 바뀔 수 있습니다.

동작이 다시 멈추면 `lib/naver-place-reviews.ts`의 URL 후보 목록 또는 selector 후보를 최신 DOM에 맞춰 조정하세요.

`place/{placeId}` 경로는 업종별 실제 페이지로 리다이렉트되는 범용 진입점처럼 동작할 수 있지만, 모든 업종과 상황에서 항상 동일하게 동작한다고 보장하기는 어렵습니다. 그래서 `hospital`, `restaurant` 등 업종별 URL을 fallback 후보로 함께 유지합니다.

최대 리뷰 수를 500개로 늘렸더라도 실제 리뷰가 500개보다 적거나, 네이버가 더보기 로딩을 중간에 제한하거나, 중복 리뷰가 제거되면 최종 결과는 요청 개수보다 적을 수 있습니다.

과도한 요청은 차단될 수 있으므로 내부 확인용으로 낮은 빈도로 사용하세요.

## 커밋 메시지 예시

```bash
refactor: 리뷰 수 제한 설정 공통화
```

본문까지 작성하려면 아래처럼 남길 수 있습니다.

```txt
refactor: 리뷰 수 제한 설정 공통화

- 리뷰 수 기본값과 최대값을 review-config로 분리
- 기본 수집 개수와 최대 수집 개수를 500개로 변경
- 클라이언트와 서버 수집 로직에서 동일한 정규화 함수 재사용
- README에 URL fallback 순서와 리뷰 수 제한 정책 반영
```
