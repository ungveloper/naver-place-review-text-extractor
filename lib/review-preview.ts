import type { ReviewDetails } from './review-details';

type Field = { key: keyof ReviewDetails; label: string };

export type PreviewSection = { key: keyof ReviewDetails; label: string; value: string };

/** Use the same selected fields/order as TXT and Excel, without changing either export. */
export function getPreviewSections(
  review: ReviewDetails,
  selectedFields: readonly Field[],
): PreviewSection[] {
  return selectedFields.flatMap(({ key, label }) => {
    const raw = review[key];
    const value = Array.isArray(raw) ? raw.filter(Boolean).join(', ') : raw;
    return value ? [{ key, label, value }] : [];
  });
}

/** Only validated image sources are passed to the browser's image element. */
export function isSupportedAvatarSource(value: string | null): value is string {
  if (!value) return false;
  return /^https:\/\//i.test(value) || /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(value);
}

/** Data-URI images can be very large. Display a useful excerpt but always copy the full value. */
export function readablePreviewValue(value: string): string {
  if (/^data:image\//i.test(value) && value.length > 180) {
    return `${value.slice(0, 110)}… (네이버 기본 프로필 이미지 · ${value.length.toLocaleString('ko-KR')}자, 복사 시 전체 데이터)`;
  }
  return value;
}
