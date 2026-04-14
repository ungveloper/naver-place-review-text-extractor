'use client';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useMemo, useState } from 'react';

function extractReviewTexts(html: string): string[] {
  if (!html.trim()) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const reviewItems = Array.from(doc.querySelectorAll('#_review_list > li'));

  const reviews = reviewItems
    .map((li) => {
      const reviewNode =
        li.querySelector('.pui__vn15t2 a[data-pui-click-code="rvshowmore"]') ||
        li.querySelector('.pui__vn15t2 a') ||
        li.querySelector('.pui__vn15t2');

      if (!reviewNode) return '';

      return (reviewNode.textContent || '').replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean);

  return reviews;
}

export default function Page() {
  const [html, setHtml] = useState('');
  const [reviews, setReviews] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const previewCount = useMemo(() => reviews.length, [reviews]);

  const copyText = useMemo(() => {
    return reviews.map((review) => `- ${review}`).join('\n');
  }, [reviews]);

  const handleExtract = () => {
    try {
      const parsed = extractReviewTexts(html);
      setReviews(parsed);
      setCopied(false);
    } catch (error) {
      console.error(error);
      setReviews([]);
      setCopied(false);
      alert('HTML 파싱 중 오류가 발생했습니다.');
    }
  };

  const handleCopy = async () => {
    if (!copyText) return;

    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error(error);
      alert('복사 중 오류가 발생했습니다.');
    }
  };

  return (
    <main className="mx-auto px-6 py-10 max-w-2xl w-full min-h-screen flex flex-col gap-6">
      <div className="space-y-2">
        <h1 className="font-bold text-2xl">네이버 리뷰 HTML 파서</h1>
        <p className="text-muted-foreground text-sm">
          `#_review_list` 안의 각 `li`에서 리뷰 내용만 추출합니다.
        </p>
      </div>

      <Textarea
        value={html}
        onChange={(e) => setHtml(e.target.value)}
        placeholder='여기에 "<ul id="_review_list"> ... </ul>" HTML을 붙여넣으세요.'
        className="h-52"
      />

      <div className="flex gap-2">
        <Button onClick={handleExtract} className="w-fit">
          리뷰 추출하기
        </Button>

        <Button
          onClick={handleCopy}
          variant="outline"
          className="w-fit"
          disabled={reviews.length === 0}
        >
          {copied ? '복사 완료!' : '복사하기'}
        </Button>
      </div>

      <section className="p-3 h-52 space-y-3 rounded-2xl border border-gray-100 bg-gray-50 overflow-y-scroll">
        <h2 className="font-semibold text-lg">
          추출 결과 {previewCount > 0 ? `(${previewCount}개)` : ''}
        </h2>

        {reviews.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            아직 추출된 리뷰가 없습니다.
          </p>
        ) : (
          <ul className="pl-5 space-y-2 list-disc">
            {reviews.map((review, index) => (
              <li key={`${index}-${review.slice(0, 20)}`} className="leading-7">
                {review}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
