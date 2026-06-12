# 네이버 플레이스 방문자 리뷰 수집기

네이버 모바일 플레이스 리뷰 페이지에서 방문자 텍스트 리뷰만 최대 100개까지 수집하는 Next.js + Playwright 앱입니다.

## 실행 방법

```bash
npm install
npm run playwright:install
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속한 뒤 네이버 플레이스 숫자 ID 또는 모바일 리뷰 URL을 입력합니다.

예시:

```txt
2070415865
https://m.place.naver.com/restaurant/2070415865/review/visitor
```

## 구현 요약

- `/api/reviews` 서버 API 라우트에서 Playwright Chromium을 실행합니다.
- 숫자 ID만 입력하면 `https://m.place.naver.com/restaurant/{placeId}/review/visitor`로 접속합니다.
- 페이지 접속 시 `오류로 데이터를 불러오지 못했습니다.` 같은 임시 오류 문구가 보이면 최대 5회 새로고침합니다.
- `div.place_section_content`, `#_review_list`, `li.place_apply_pui`, `.pui__vn15t2` 중심으로 리뷰 텍스트를 추출합니다.
- 하단 `펼쳐서 더보기` 버튼을 반복 클릭하고 스크롤하면서 최대 100개까지 수집합니다.
- 개별 리뷰가 접혀 있을 때 보이는 `더보기` 버튼도 가능한 범위에서 먼저 펼친 뒤 텍스트를 읽습니다.

## 주의 사항

네이버 플레이스 화면 클래스명은 수시로 바뀔 수 있으므로, 동작이 다시 멈추면 `lib/naver-place-reviews.ts`의 selector 후보를 최신 DOM에 맞춰 조정하세요. 과도한 요청은 차단될 수 있으므로 내부 확인용으로 낮은 빈도로 사용하세요.
