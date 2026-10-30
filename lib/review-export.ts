import type { ReviewDetails } from './review-details';

export const REVIEW_FIELDS = [
  { key: 'text', label: '리뷰 내용' },
  { key: 'authorName', label: '작성자 이름(닉네임)' },
  { key: 'profileImageUrl', label: '프로필 이미지 경로(URL)' },
  { key: 'profileUrl', label: '프로필 링크' },
  { key: 'writtenAt', label: '작성 날짜' },
  { key: 'visitedAt', label: '방문 날짜' },
  { key: 'visitCount', label: '방문 횟수' },
  { key: 'reviewerReviewCount', label: '작성자의 리뷰 수' },
  { key: 'rating', label: '별점' },
  { key: 'keywords', label: '리뷰 키워드' },
  { key: 'mediaUrls', label: '리뷰 사진/미디어 URL' },
  { key: 'photoCount', label: '사진 수' },
  { key: 'reviewUrl', label: '개별 리뷰 링크' },
  { key: 'reviewId', label: '리뷰 ID' },
  { key: 'verification', label: '방문 인증 정보' },
  { key: 'ownerReply', label: '사장님 답글' },
] as const;

export type ReviewFieldKey = (typeof REVIEW_FIELDS)[number]['key'];
export type ReviewFieldSelection = Record<ReviewFieldKey, boolean>;

export function initialReviewFields(): ReviewFieldSelection {
  return Object.fromEntries(
    REVIEW_FIELDS.map(({ key }) => [key, key === 'text']),
  ) as ReviewFieldSelection;
}

/** Skips missing values instead of inventing metadata. */
export function formatReviewExport(
  reviews: ReviewDetails[],
  selection: ReviewFieldSelection,
): string {
  const selected = REVIEW_FIELDS.filter(({ key }) => selection[key]);
  if (!selected.length || !reviews.length) return '';
  return reviews.map((review, index) => {
    const lines = selected.flatMap(({ key, label }) => {
      const raw = review[key];
      const value = Array.isArray(raw) ? raw.filter(Boolean).join(', ') : raw;
      if (!value) return [];
      // Every selected section has an explicit bullet, including text-only export.
      return [`- ${label}: ${value}`];
    });
    return lines.length ? `${index + 1}.\n${lines.join('\n')}` : '';
  }).filter(Boolean).join('\n\n');
}

/** A single source of truth for the Excel table and the live selected-field preview. */
export function buildSelectedReviewSheet(
  reviews: ReviewDetails[],
  selection: ReviewFieldSelection,
): { headers: string[]; rows: string[][] } {
  const fields = REVIEW_FIELDS.filter(({ key }) => selection[key]);
  return {
    headers: ['번호', ...fields.map(({ label }) => label)],
    rows: reviews.flatMap((review, index) => {
      const values = fields.map(({ key }) => {
        const value = review[key];
        return Array.isArray(value) ? value.filter(Boolean).join(', ') : value ?? '';
      });
      // A missing row must not become a blank line in the workbook.
      return values.some(Boolean) ? [[String(index + 1), ...values]] : [];
    }),
  };
}
