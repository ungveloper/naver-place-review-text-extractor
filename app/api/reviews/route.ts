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
            : 'An unknown error occurred while collecting reviews.';

        send({
          type: 'error',
          message: `Review collection failed: ${message}`,
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
