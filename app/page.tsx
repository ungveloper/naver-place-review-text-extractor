'use client';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DEFAULT_MAX_REVIEWS,
  MAX_REVIEW_LIMIT,
  normalizeMaxReviews,
} from '@/lib/review-config';
import { useMemo, useState } from 'react';

type ReviewApiResult = {
  placeId: string;
  requestedUrl: string;
  finalUrl: string;
  maxReviews: number;
  reviews: string[];
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
  const [result, setResult] = useState<ReviewApiResult | null>(null);
  const [progress, setProgress] = useState<ReviewProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const reviews = useMemo(() => result?.reviews ?? [], [result]);

  const outputText = useMemo(
    () =>
      reviews.map((review, index) => `${index + 1}.\n${review}`).join('\n\n'),
    [reviews],
  );

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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          placeInput,
          maxReviews: normalizedMaxReviews,
        }),
      });

      if (!response.ok || !response.body) {
        const contentType = response.headers.get('content-type') ?? '';

        if (contentType.includes('application/json')) {
          const data = await response.json().catch(() => null);
          throw new Error(
            data?.message || `Failed to collect reviews. (${response.status})`,
          );
        }

        const text = await response.text().catch(() => '');
        throw new Error(
          text
            ? `Failed to collect reviews. (${response.status}) ${text.slice(0, 500)}`
            : `Failed to collect reviews. (${response.status})`,
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult: ReviewApiResult | null = null;

      while (true) {
        const { value, done } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;

          let event: ReviewStreamEvent;

          try {
            event = JSON.parse(line) as ReviewStreamEvent;
          } catch {
            throw new Error(
              `Failed to parse review collection response: ${line.slice(0, 300)}`,
            );
          }

          if (event.type === 'progress') {
            setProgress(event.progress);
          }

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
            throw new Error(event.message || 'Failed to collect reviews.');
          }
        }
      }

      if (!finalResult) {
        throw new Error('No review collection result was received.');
      }
    } catch (error) {
      console.error(error);
      setResult(null);
      setProgress(null);
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to collect reviews.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!outputText) return;

    try {
      await navigator.clipboard.writeText(outputText);
      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error(error);
      alert('An error occurred while copying.');
    }
  };

  const handleDownloadTxt = () => {
    if (!outputText) return;

    const blob = new Blob([outputText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const safePlaceId =
      (result?.placeId ??
        placeInput.replace(/[^\dA-Za-z가-힣_-]/g, '').slice(0, 32)) ||
      'naver-place';

    anchor.href = url;
    anchor.download = `naver-place-reviews-${safePlaceId}-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="mx-auto px-6 py-10 max-w-3xl w-full min-h-screen flex flex-col gap-6">
      <section className="space-y-4 rounded-2xl border border-gray-100 bg-gray-50 p-4">
        <label className="block space-y-2">
          <span className="font-medium text-sm">Naver Place ID</span>
          <input
            value={placeInput}
            onChange={(event) => setPlaceInput(event.target.value)}
            placeholder="Enter Naver Place ID."
            className="w-full rounded-2xl border border-transparent bg-white px-3 py-3 text-sm outline-none transition focus:border-ring focus:ring-3 focus:ring-ring/30"
          />
        </label>

        <label className="block w-40 space-y-2">
          <span className="font-medium text-sm">Max reviews length</span>
          <input
            type="number"
            min={1}
            max={MAX_REVIEW_LIMIT}
            value={maxReviews}
            onChange={(event) => setMaxReviews(Number(event.target.value))}
            className="w-full rounded-2xl border border-transparent bg-white px-3 py-3 text-sm outline-none transition focus:border-ring focus:ring-3 focus:ring-ring/30"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleExtract}
            className="w-fit min-w-32"
            disabled={isLoading}
            aria-label={isLoading ? 'Collecting reviews' : 'Collect reviews'}
          >
            {isLoading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              'Collect reviews'
            )}
          </Button>

          <Button
            onClick={handleCopy}
            variant="outline"
            className="w-fit"
            disabled={reviews.length === 0 || isLoading}
          >
            {copied ? 'Copied!' : 'Copy result'}
          </Button>

          <Button
            onClick={handleDownloadTxt}
            variant="outline"
            className="w-fit"
            disabled={reviews.length === 0 || isLoading}
          >
            Export as txt
          </Button>
        </div>

        {progress ? (
          <p className="text-muted-foreground text-sm leading-6">
            Collected {progress.collectedReviewCount} of{' '}
            {progress.totalReviewCount} reviews
            {isLoading ? ' · Loading' : ' · Complete'} · Loaded review items:{' '}
            {progress.loadedReviewItemCount}
          </p>
        ) : null}
      </section>

      {errorMessage ? (
        <p className="rounded-2xl border border-red-100 bg-red-50 p-3 text-sm leading-6 text-red-700">
          {errorMessage}
        </p>
      ) : null}

      <section className="space-y-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
        <div className="space-y-1">
          <h2 className="font-semibold text-lg">
            Result {reviews.length > 0 ? `(${reviews.length})` : ''}
          </h2>
          {result ? (
            <p className="text-muted-foreground text-xs leading-5">
              Request ID: {result.placeId} · Collected {reviews.length} of{' '}
              {result.maxReviews} reviews · Loaded review items:{' '}
              {result.loadedReviewItemCount} · Refresh attempts:{' '}
              {result.navigationAttempts} · Final URL: {result.finalUrl}
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              No reviews extracted yet.
            </p>
          )}
        </div>

        <Textarea
          value={outputText}
          readOnly
          placeholder="Collected review text will appear here."
          className="min-h-72 whitespace-pre-line bg-white"
        />
      </section>
    </main>
  );
}
