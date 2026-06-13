import { collectNaverPlaceReviews } from '@/lib/naver-place-reviews';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type ReviewRequestBody = {
  placeInput?: unknown;
  maxReviews?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ReviewRequestBody;
  const placeInput = typeof body.placeInput === 'string' ? body.placeInput : '';
  const maxReviews = Number(body.maxReviews);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      try {
        const result = await collectNaverPlaceReviews({
          placeInput,
          maxReviews,
          onProgress: (progress) => {
            send({ type: 'progress', progress });
          },
        });

        send({ type: 'done', result });
        controller.close();
      } catch (error) {
        console.error('[reviews api error]', error);

        const message =
          error instanceof Error
            ? error.message
            : '리뷰를 수집하는 중 알 수 없는 오류가 발생했습니다.';

        send({
          type: 'error',
          message: `리뷰 수집 실패: ${message}`,
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-cache, no-transform',
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'X-Accel-Buffering': 'no',
    },
  });
}
