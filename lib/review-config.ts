export const MIN_REVIEW_LIMIT = 1;
export const DEFAULT_MAX_REVIEWS = 100;
export const MAX_REVIEW_LIMIT = 500;

export function normalizeMaxReviews(value?: number): number {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) return DEFAULT_MAX_REVIEWS;

  const normalized = Math.floor(numericValue);

  if (normalized < MIN_REVIEW_LIMIT) return DEFAULT_MAX_REVIEWS;

  return Math.min(normalized, MAX_REVIEW_LIMIT);
}
