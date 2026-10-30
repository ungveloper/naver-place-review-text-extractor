'use client';

import { useMemo, useState } from 'react';
import { Check, Copy, FileSpreadsheet, FileText, LoaderCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { DEFAULT_MAX_REVIEWS, MAX_REVIEW_LIMIT, normalizeMaxReviews } from '@/lib/review-config';
import type { ReviewDetails } from '@/lib/review-details';
import {
  buildSelectedReviewSheet,
  formatReviewExport,
  initialReviewFields,
  REVIEW_FIELDS,
  type ReviewFieldSelection,
} from '@/lib/review-export';
import { generateReviewXlsx } from '@/lib/review-xlsx';

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
  phase: 'initializing' | 'navigating' | 'collecting' | 'done';
};

type ReviewStreamEvent =
  | { type: 'progress'; progress: ReviewProgress }
  | { type: 'done'; result: ReviewApiResult }
  | { type: 'error'; message: string };

const PHASE_TEXT: Record<ReviewProgress['phase'], string> = {
  initializing: '수집 환경을 준비하고 있어요',
  navigating: '네이버 플레이스 리뷰 페이지에 연결하고 있어요',
  collecting: '리뷰와 작성자 정보를 수집하고 있어요',
  done: '수집이 완료되었습니다',
};

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Page() {
  const [placeInput, setPlaceInput] = useState('');
  const [maxReviews, setMaxReviews] = useState(DEFAULT_MAX_REVIEWS);
  const [selection, setSelection] = useState<ReviewFieldSelection>(initialReviewFields);
  const [result, setResult] = useState<ReviewApiResult | null>(null);
  const [progress, setProgress] = useState<ReviewProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exportError, setExportError] = useState('');

  const reviewDetails = useMemo(() => result?.reviewDetails ?? [], [result]);
  const selectedFields = useMemo(() => REVIEW_FIELDS.filter(({ key }) => selection[key]), [selection]);
  const outputText = useMemo(() => formatReviewExport(reviewDetails, selection), [reviewDetails, selection]);
  const availableCounts = useMemo(() => Object.fromEntries(
    REVIEW_FIELDS.map(({ key }) => [key, reviewDetails.filter((review) => {
      const value = review[key];
      return Array.isArray(value) ? value.length > 0 : Boolean(value);
    }).length]),
  ) as Record<keyof ReviewFieldSelection, number>, [reviewDetails]);

  const sheetData = useMemo(() => buildSelectedReviewSheet(reviewDetails, selection), [reviewDetails, selection]);
  const canExport = selectedFields.length > 0 && sheetData.rows.length > 0;
  const filenameStem = `naver-place-reviews-${(result?.placeId || 'naver-place').replace(/[^\w-]/g, '')}-${new Date().toISOString().slice(0, 10)}`;

  const handleExtract = async () => {
    if (isLoading || !placeInput.trim()) return;
    const normalizedMaxReviews = normalizeMaxReviews(maxReviews);
    setIsLoading(true);
    setErrorMessage('');
    setExportError('');
    setCopied(false);
    setResult(null);
    setProgress({ collectedReviewCount: 0, totalReviewCount: normalizedMaxReviews, loadedReviewItemCount: 0, phase: 'initializing' });

    try {
      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeInput: placeInput.trim(), maxReviews: normalizedMaxReviews }),
      });
      if (!response.ok || !response.body) {
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.message || `리뷰 수집 실패 (${response.status})`);
        }
        const text = await response.text().catch(() => '');
        throw new Error(text ? `리뷰 수집 실패 (${response.status}) ${text.slice(0, 500)}` : `리뷰 수집 실패 (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult: ReviewApiResult | null = null;

      const processLine = (line: string) => {
        if (!line.trim()) return;
        let event: ReviewStreamEvent;
        try { event = JSON.parse(line) as ReviewStreamEvent; }
        catch { throw new Error(`수집 응답을 분석하지 못했습니다: ${line.slice(0, 200)}`); }
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
        if (event.type === 'error') throw new Error(event.message || '리뷰 수집에 실패했습니다.');
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) processLine(line);
      }
      buffer += decoder.decode();
      if (buffer.trim()) processLine(buffer);
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
    setExportError('');
    try {
      await navigator.clipboard.writeText(outputText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setExportError('클립보드 복사에 실패했습니다. 브라우저의 복사 권한이나 HTTPS 환경을 확인해 주세요.');
    }
  };

  const handleDownloadTxt = () => {
    if (!canExport || !outputText) return;
    setExportError('');
    saveBlob(new Blob(['\uFEFF', outputText], { type: 'text/plain;charset=utf-8' }), `${filenameStem}.txt`);
  };

  const handleDownloadExcel = () => {
    if (!canExport) return;
    setExportError('');
    try {
      const bytes = generateReviewXlsx(sheetData);
      const fileBytes = new Uint8Array(bytes.byteLength);
      fileBytes.set(bytes);
      saveBlob(new Blob([fileBytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${filenameStem}.xlsx`);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Excel 파일을 생성하지 못했습니다.');
    }
  };

  const setAll = (checked: boolean) => {
    setSelection(Object.fromEntries(REVIEW_FIELDS.map(({ key }) => [key, checked])) as ReviewFieldSelection);
    setCopied(false);
    setExportError('');
  };

  // Initial state: only the ID input and primary CTA are shown in the center.
  // During collection, this central area is replaced by a spinner + progress.
  if (isLoading || !result) {
    const progressRatio = progress ? Math.min(100, Math.floor(progress.collectedReviewCount / Math.max(1, progress.totalReviewCount) * 100)) : 0;
    return (
      <main className="flex min-h-[100dvh] w-full items-center justify-center px-4 py-12">
        <div className="w-full max-w-xl space-y-7">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">네이버 플레이스 리뷰 추출기</h1>
            <p className="text-sm leading-6 text-muted-foreground">
              {isLoading ? '리뷰를 모으는 중입니다. 수집이 완료되면 결과가 나타납니다.' : '플레이스 ID를 입력하고 필요한 리뷰 정보를 한 번에 수집하세요.'}
            </p>
          </div>
          <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
            {isLoading && progress ? (
              <div className="space-y-6" role="status" aria-live="polite">
                <div className="flex flex-col items-center gap-3 py-2 text-center">
                  <LoaderCircle aria-hidden="true" className="size-9 animate-spin text-foreground" />
                  <h2 className="text-base font-semibold">{PHASE_TEXT[progress.phase] ?? '리뷰를 수집하고 있어요'}</h2>
                  <p className="text-xs text-muted-foreground">수집 대상 플레이스: {placeInput.trim()}</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-end justify-between gap-3 text-sm">
                    <span className="font-medium">{progress.collectedReviewCount.toLocaleString()}개 수집됨</span>
                    <span className="text-xs tabular-nums text-muted-foreground">요청 최대 {progress.totalReviewCount.toLocaleString()}개</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="요청한 최대 리뷰 수 대비 수집 현황" aria-valuemin={0} aria-valuemax={progress.totalReviewCount} aria-valuenow={progress.collectedReviewCount}>
                    <div className="h-full rounded-full bg-foreground transition-[width] duration-300" style={{ width: `${progressRatio}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">불러온 리뷰 카드 {progress.loadedReviewItemCount}개 · 실제 리뷰 수에 따라 목표보다 적게 완료될 수 있습니다.</p>
                </div>
              </div>
            ) : (
              <form onSubmit={(event) => { event.preventDefault(); void handleExtract(); }} className="space-y-4">
                <label htmlFor="place-id" className="block text-sm font-semibold">네이버 플레이스 ID 또는 리뷰 URL</label>
                <input id="place-id" value={placeInput} onChange={(event) => setPlaceInput(event.target.value)}
                  placeholder="플레이스 ID 또는 리뷰 URL을 입력하세요" autoFocus
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20" />
                <Button type="submit" className="h-11 w-full" disabled={!placeInput.trim()}>리뷰 수집하기</Button>
              </form>
            )}
          </section>
          {errorMessage && !isLoading && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700">{errorMessage}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[1480px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-5">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">네이버 플레이스 리뷰 추출기</h1>
          <p className="text-xs leading-5 text-muted-foreground">플레이스 {result.placeId} · {reviewDetails.length.toLocaleString()}개 리뷰 수집 완료</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            수집 개수
            <input aria-label="다음 수집 시 최대 리뷰 수" type="number" min={1} max={MAX_REVIEW_LIMIT} value={maxReviews}
              onChange={(event) => setMaxReviews(Number(event.target.value))}
              className="h-9 w-20 rounded-lg border bg-background px-2 text-sm text-foreground" />
          </label>
          <Button size="sm" variant="outline" onClick={() => { setResult(null); setProgress(null); setErrorMessage(''); setExportError(''); }}>
            <RotateCcw aria-hidden="true" className="mr-1.5 size-3.5" />다른 플레이스 수집
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 items-start gap-5 lg:grid-cols-[318px_minmax(0,1fr)]">
        <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5" aria-labelledby="field-heading">
          <div className="space-y-1">
            <h2 id="field-heading" className="text-base font-semibold">내보낼 정보 선택</h2>
            <p className="text-xs leading-5 text-muted-foreground">{selectedFields.length}개 선택 · 선택 즉시 미리보기에 반영</p>
          </div>
          <div className="mt-4 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setAll(true)} className="flex-1">전체 선택</Button>
            <Button size="sm" variant="outline" onClick={() => setAll(false)} className="flex-1">전체 해제</Button>
          </div>
          <div className="mt-4 max-h-[min(72vh,790px)] space-y-1.5 overflow-y-auto pr-1" role="group" aria-label="내보낼 정보">
            {REVIEW_FIELDS.map(({ key, label }) => (
              <label key={key} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2.5 text-sm transition hover:border-border hover:bg-muted/40 has-[:checked]:bg-muted/35">
                <input type="checkbox" checked={selection[key]} onChange={(event) => {
                  setSelection((previous) => ({ ...previous, [key]: event.target.checked }));
                  setCopied(false);
                  setExportError('');
                }} className="size-4 shrink-0 accent-foreground" />
                <span className="min-w-0 flex-1 break-keep">{label}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground" title="값을 찾은 리뷰 수">
                  {availableCounts[key]}/{reviewDetails.length}
                </span>
              </label>
            ))}
          </div>
          <p className="mt-4 border-t pt-3 text-xs leading-5 text-muted-foreground">네이버 화면에서 찾은 값만 출력합니다. 이미지 항목은 파일이 아닌 URL로 제공됩니다.</p>
        </section>

        <section className="min-w-0 space-y-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5" aria-labelledby="preview-heading">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 id="preview-heading" className="text-base font-semibold">미리보기</h2>
              <p className="text-xs text-muted-foreground">{sheetData.rows.length.toLocaleString()}개 리뷰 · 선택한 {selectedFields.length}개 항목</p>
            </div>
            <div className="ml-auto flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="outline" disabled={!canExport} onClick={() => { void handleCopy(); }}>
                {copied ? <Check aria-hidden="true" className="mr-1.5 size-3.5" /> : <Copy aria-hidden="true" className="mr-1.5 size-3.5" />}
                {copied ? '복사 완료' : '텍스트 복사'}
              </Button>
              <Button size="sm" variant="outline" disabled={!canExport} onClick={handleDownloadTxt}>
                <FileText aria-hidden="true" className="mr-1.5 size-3.5" />TXT 다운로드
              </Button>
              <Button size="sm" disabled={!canExport} onClick={handleDownloadExcel}>
                <FileSpreadsheet aria-hidden="true" className="mr-1.5 size-3.5" />Excel 다운로드
              </Button>
            </div>
          </div>
          {exportError && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">{exportError}</p>}
          {!canExport && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800" role="status">선택한 정보에 값이 없습니다. 왼쪽에서 다른 항목을 선택해 주세요.</p>}
          <Textarea value={outputText} readOnly aria-label="선택한 리뷰 정보 미리보기"
            placeholder="선택한 리뷰 정보가 여기에 표시됩니다."
            className="min-h-[55vh] w-full resize-y whitespace-pre-wrap bg-background font-mono text-sm leading-6 lg:min-h-[calc(100vh-235px)]" />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>TXT는 미리보기와 동일한 내용, Excel은 선택한 항목별 열로 저장됩니다.</span>
            <span>{result.loadedReviewItemCount.toLocaleString()}개 카드 확인</span>
          </div>
        </section>
      </div>
    </main>
  );
}
