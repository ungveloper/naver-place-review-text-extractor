'use client';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DEFAULT_MAX_REVIEWS,
  MAX_REVIEW_LIMIT,
  normalizeMaxReviews,
} from '@/lib/review-config';
import type { ReviewDetails } from '@/lib/review-details';
import {
  formatReviewExport,
  initialReviewFields,
  REVIEW_FIELDS,
  type ReviewFieldSelection,
} from '@/lib/review-export';
import { useMemo, useState } from 'react';

type ReviewApiResult = {
  placeId: string;
  requestedUrl: string;
  finalUrl: string;
  maxReviews: number;
  reviews: string[];
  reviewDetails: ReviewDetails[];
  loadedReviewItemCount: number;
  navigationAttempts: number;
  reachedMax: boolean;
};

type ReviewProgress = {
  collectedReviewCount: number;
  totalReviewCount: number;
  loadedReviewItemCount: number;
  phase: string;
};

type ReviewStreamEvent =
  | { type: 'progress'; progress: ReviewProgress }
  | { type: 'done'; result: ReviewApiResult }
  | { type: 'error'; message: string };

export default function Page() {
  const [placeInput, setPlaceInput] = useState('');
  const [maxReviews, setMaxReviews] = useState(DEFAULT_MAX_REVIEWS);
  const [selection, setSelection] = useState<ReviewFieldSelection>(initialReviewFields);
  const [result, setResult] = useState<ReviewApiResult | null>(null);
  const [progress, setProgress] = useState<ReviewProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const reviewDetails = useMemo(() => result?.reviewDetails ?? [], [result]);
  const selectedCount = REVIEW_FIELDS.filter(({ key }) => selection[key]).length;
  const outputText = useMemo(
    () => formatReviewExport(reviewDetails, selection),
    [reviewDetails, selection],
  );
  const availableCounts = useMemo(() => Object.fromEntries(
    REVIEW_FIELDS.map(({ key }) => [key, reviewDetails.filter((review) => {
      const value = review[key];
      return Array.isArray(value) ? value.length > 0 : Boolean(value);
    }).length]),
  ) as Record<keyof ReviewFieldSelection, number>, [reviewDetails]);

  const handleExtract = async () => {
    const normalizedMaxReviews = normalizeMaxReviews(maxReviews);
    setIsLoading(true);
    setErrorMessage('');
    setCopied(false);
    setResult(null);
    setProgress({
      collectedReviewCount: 0,
      totalReviewCount: normalizedMaxReviews,
      loadedReviewItemCount: 0,
      phase: 'initializing',
    });

    try {
      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeInput, maxReviews: normalizedMaxReviews }),
      });
      if (!response.ok || !response.body) {
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.message || `리뷰 수집 실패 (${response.status})`);
        }
        const text = await response.text().catch(() => '');
        throw new Error(text ? `리뷰 수집 실패 (${response.status}) ${text.slice(0, 500)}` :
          `리뷰 수집 실패 (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult: ReviewApiResult | null = null;

      const handleLine = (line: string) => {
        if (!line.trim()) return;
        let event: ReviewStreamEvent;
        try {
          event = JSON.parse(line) as ReviewStreamEvent;
        } catch {
          throw new Error(`응답을 분석하지 못했습니다: ${line.slice(0, 300)}`);
        }
        if (event.type === 'progress') setProgress(event.progress);
        if (event.type === 'done') {
          finalResult = event.result;
          setResult(event.result);
          setProgress({
            collectedReviewCount: event.result.reviews.length,
            totalReviewCount: event.result.maxReviews,
            loadedReviewItemCount: event.result.loadedReviewItemCount,
            phase: 'done',
          });
        }
        if (event.type === 'error') {
          throw new Error(event.message || '리뷰 수집에 실패했습니다.');
        }
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) handleLine(line);
      }
      buffer += decoder.decode();
      if (buffer.trim()) handleLine(buffer);
      if (!finalResult) throw new Error('리뷰 수집 결과를 받지 못했습니다.');
    } catch (error) {
      console.error(error);
      setResult(null);
      setProgress(null);
      setErrorMessage(error instanceof Error ? error.message : '리뷰 수집에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!outputText) return;
    try {
      await navigator.clipboard.writeText(outputText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error(error);
      alert('클립보드 복사에 실패했습니다. 브라우저의 권한과 HTTPS 환경을 확인해 주세요.');
    }
  };

  const handleDownloadTxt = () => {
    if (!outputText) return;
    const blob = new Blob(['\uFEFF', outputText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const safePlaceId =
      (result?.placeId ?? placeInput.replace(/[^\dA-Za-z가-힣_-]/g, '').slice(0, 32)) ||
      'naver-place';
    anchor.href = url;
    anchor.download = `naver-place-reviews-${safePlaceId}-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const setAll = (checked: boolean) => {
    setSelection(Object.fromEntries(REVIEW_FIELDS.map(({ key }) => [key, checked])) as ReviewFieldSelection);
    setCopied(false);
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">네이버 플레이스 리뷰 추출기</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          리뷰를 수집한 후 원하는 정보만 체크하여 복사하거나 TXT로 저장할 수 있습니다.
        </p>
      </header>

      <section className="space-y-4 rounded-2xl border bg-muted/35 p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
          <label className="block space-y-2">
            <span className="text-sm font-medium">네이버 플레이스 ID 또는 리뷰 URL</span>
            <input
              value={placeInput}
              onChange={(event) => setPlaceInput(event.target.value)}
              placeholder="플레이스 ID 또는 https://m.place.naver.com/..."
              className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-ring/30"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium">최대 리뷰 수</span>
            <input
              type="number"
              min={1}
              max={MAX_REVIEW_LIMIT}
              value={maxReviews}
              onChange={(event) => setMaxReviews(Number(event.target.value))}
              className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-ring/30"
            />
          </label>
        </div>
        <Button onClick={handleExtract} disabled={isLoading || !placeInput.trim()}>
          {isLoading ? '리뷰 수집 중…' : '리뷰 수집하기'}
        </Button>
        {progress && (
          <p role="status" className="text-sm leading-6 text-muted-foreground">
            {progress.totalReviewCount}개 중 {progress.collectedReviewCount}개 수집
            {isLoading ? ' · 수집 중' : ' · 완료'} · 불러온 리뷰 카드 {progress.loadedReviewItemCount}개
          </p>
        )}
      </section>

      {errorMessage && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </p>
      )}

      <section className="space-y-4 rounded-2xl border bg-muted/35 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">내보낼 정보 선택</h2>
            <p className="text-xs leading-6 text-muted-foreground">
              {selectedCount}개 항목 선택됨 · 기본은 기존과 같은 리뷰 내용만 선택
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setAll(true)}>전체 선택</Button>
            <Button size="sm" variant="outline" onClick={() => setAll(false)}>전체 해제</Button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label="내보낼 리뷰 정보">
          {REVIEW_FIELDS.map(({ key, label }) => (
            <label key={key} className="flex cursor-pointer items-center gap-3 rounded-xl border bg-background px-3 py-3 text-sm transition hover:border-ring/40">
              <input
                type="checkbox"
                checked={selection[key]}
                onChange={(event) => {
                  setSelection((previous) => ({ ...previous, [key]: event.target.checked }));
                  setCopied(false);
                }}
                className="size-4 shrink-0 accent-foreground"
              />
              <span className="min-w-0 flex-1">{label}</span>
              {result && (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground" title="해당 값이 확인된 리뷰 개수">
                  {availableCounts[key]}/{reviewDetails.length}
                </span>
              )}
            </label>
          ))}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          네이버 화면에서 확인되는 공개 정보만 수집합니다. 값이 없거나 찾지 못한 항목은 출력에서 생략하며,
          리뷰 본문이 있는 방문자 리뷰를 대상으로 합니다. 프로필 이미지와 사진은 파일이 아닌 URL로 내보냅니다.
        </p>
      </section>

      <section className="space-y-3 rounded-2xl border bg-muted/35 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">추출 결과 {reviewDetails.length ? `(${reviewDetails.length})` : ''}</h2>
            <p className="text-xs leading-5 text-muted-foreground">
              {result
                ? `플레이스 ID ${result.placeId} · 불러온 카드 ${result.loadedReviewItemCount}개 · 페이지 접근 ${result.navigationAttempts}회`
                : '수집된 리뷰가 없습니다.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleCopy} disabled={!outputText || isLoading}>
              {copied ? '복사 완료!' : '선택 항목 복사'}
            </Button>
            <Button variant="outline" onClick={handleDownloadTxt} disabled={!outputText || isLoading}>
              TXT로 내보내기
            </Button>
          </div>
        </div>
        {result && reviewDetails.length > 0 && !outputText && (
          <p className="text-sm text-amber-700" role="status">
            선택한 정보에 값이 없거나 항목을 모두 해제했습니다. 다른 항목을 선택해 주세요.
          </p>
        )}
        <Textarea
          value={outputText}
          readOnly
          placeholder="수집한 리뷰에서 선택한 정보가 여기에 표시됩니다."
          className="min-h-80 resize-y whitespace-pre-wrap bg-background font-mono text-sm leading-6"
          aria-label="선택한 리뷰 정보 미리보기"
        />
      </section>
    </main>
  );
}
