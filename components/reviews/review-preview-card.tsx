'use client';

import { useState } from 'react';
import { Check, Copy, ExternalLink, Image as ImageIcon, UserRound } from 'lucide-react';
import type { ReviewDetails } from '@/lib/review-details';
import type { PreviewSection } from '@/lib/review-preview';
import { isSupportedAvatarSource, readablePreviewValue } from '@/lib/review-preview';

type Props = {
  review: ReviewDetails;
  number: number;
  sections: PreviewSection[];
  showAuthor: boolean;
  showAvatar: boolean;
  showDate: boolean;
};

/** Review-style visual card. Selection controls content; each displayed value copies separately. */
export function ReviewPreviewCard({ review, number, sections, showAuthor, showAvatar, showDate }: Props) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copyError, setCopyError] = useState('');
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [expandedImageValues, setExpandedImageValues] = useState<string[]>([]);

  const avatarUrl = showAvatar && isSupportedAvatarSource(review.profileImageUrl) && !avatarFailed
    ? review.profileImageUrl : null;
  const profileUrl = showAuthor && review.profileUrl && /^https:\/\/m\.place\.naver\.com\/my\//.test(review.profileUrl)
    ? review.profileUrl : null;

  const copySection = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setCopyError('');
    } catch {
      setCopyError('복사 권한을 확인해 주세요.');
    }
  };

  if (!sections.length) return null;

  return (
    <article className="rounded-2xl border bg-background px-4 py-5 shadow-sm sm:px-6" aria-label={`${number}번 리뷰`}>
      <div className="flex items-start gap-3 border-b pb-4">
        <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground">
          {avatarUrl ? (
            // This source can be a Naver image URL or an inline Naver default avatar.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="프로필 이미지" className="size-full object-cover" loading="lazy" referrerPolicy="no-referrer" onError={() => setAvatarFailed(true)} />
          ) : <UserRound aria-hidden="true" className="size-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 break-words text-sm font-semibold">
              {showAuthor && review.authorName ? review.authorName : '방문자 리뷰'}
            </span>
            {profileUrl && <a href={profileUrl} target="_blank" rel="noopener noreferrer" aria-label="작성자 프로필 열기" className="text-muted-foreground hover:text-foreground"><ExternalLink aria-hidden="true" className="size-3.5" /></a>}
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{number}번</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {showDate && review.writtenAt && <span>{review.writtenAt}</span>}
            {sections.some(({ key }) => key === 'rating') && review.rating && <span className="font-semibold text-amber-600" aria-label={`별점 ${review.rating}`}>★ {review.rating}</span>}
            {sections.some(({ key }) => key === 'visitCount') && review.visitCount && <span>{review.visitCount}</span>}
            {sections.some(({ key }) => key === 'reviewerReviewCount') && review.reviewerReviewCount && <span>{review.reviewerReviewCount}</span>}
            {sections.some(({ key }) => key === 'verification') && review.verification && <span className="rounded bg-muted px-1.5">{review.verification}</span>}
          </div>
        </div>
      </div>

      <div className="space-y-5 pt-5">
        {sections.map(({ key, label, value }) => {
          const isImageField = key === 'profileImageUrl' || key === 'mediaUrls';
          const isExpanded = expandedImageValues.includes(key);
          const isLongImageValue = isImageField && /^data:image\//i.test(value) && value.length > 180;
          return (
            <section key={key} className="min-w-0 space-y-2" aria-label={label}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-foreground">- {label}</h3>
                <button type="button" onClick={() => { void copySection(key, value); }}
                  aria-label={`${number}번 리뷰 ${label} 복사`} title={`${label} 내용만 복사`}
                  className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border bg-background px-2.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground">
                  {copiedKey === key ? <Check aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />}
                  {copiedKey === key ? '복사됨' : '복사'}
                </button>
              </div>
              {key === 'keywords' ? (
                <div className="flex flex-wrap gap-1.5" role="text">
                  {review.keywords.map((word, i) => (
                    <span key={`${word}-${i}`} className="rounded-full border bg-muted/40 px-2.5 py-1 text-xs text-foreground">{word}</span>
                  ))}
                </div>
              ) : (
                <div className={`rounded-xl border border-border/70 bg-muted/20 px-3.5 py-3 text-sm leading-7 text-foreground ${isImageField ? 'break-all font-mono text-xs' : 'whitespace-pre-wrap break-words'}`}>
                  {key === 'mediaUrls' && review.mediaUrls.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {review.mediaUrls.filter((source) => /^https:\/\//i.test(source)).slice(0, 4).map((source, index) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={`${source}-${index}`} src={source} alt={`리뷰 사진 ${index + 1}`} loading="lazy" referrerPolicy="no-referrer"
                          className="size-20 rounded-lg border object-cover" />
                      ))}
                    </div>
                  )}
                  {isImageField && key === 'profileImageUrl' && isSupportedAvatarSource(review.profileImageUrl) && (
                    <span className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><ImageIcon aria-hidden="true" className="size-4" /> 프로필 이미지 데이터</span>
                  )}
                  {isLongImageValue && !isExpanded ? readablePreviewValue(value) : value}
                  {isLongImageValue && (
                    <button type="button" onClick={() => setExpandedImageValues((previous) => isExpanded ? previous.filter((item) => item !== key) : [...previous, key])}
                      className="mt-2 block text-xs font-medium underline underline-offset-2">
                      {isExpanded ? '이미지 데이터 접기' : '전체 데이터 펼치기'}
                    </button>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
      {copyError && <p role="alert" className="mt-3 text-xs text-destructive">{copyError}</p>}
    </article>
  );
}
