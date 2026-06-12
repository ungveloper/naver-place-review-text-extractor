import { chromium, type Browser, type Page } from 'playwright';

const NAVER_MOBILE_PLACE_ORIGIN = 'https://m.place.naver.com';

const NAVER_PLACE_CANDIDATE_TYPES = [
  'place',
  'hospital',
  'restaurant',
  'hairshop',
  'nailshop',
  'accommodation',
  'pharmacy',
] as const;

const DEFAULT_MAX_REVIEWS = 100;
const MAX_REVIEW_LIMIT = 100;
const MAX_NAVIGATION_RETRIES = 5;
const MAX_STAGNANT_SCROLLS = 4;

const MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

type NaverPlaceCandidateType = (typeof NAVER_PLACE_CANDIDATE_TYPES)[number];

export type ReviewCollectionProgress = {
  collectedReviewCount: number;
  totalReviewCount: number;
  loadedReviewItemCount: number;
  phase: 'initializing' | 'navigating' | 'collecting' | 'done';
};

export type ReviewCollectionOptions = {
  placeInput: string;
  maxReviews?: number;
  onProgress?: (progress: ReviewCollectionProgress) => void;
};

export type ReviewCollectionResult = {
  placeId: string;
  requestedUrl: string;
  finalUrl: string;
  maxReviews: number;
  reviews: string[];
  loadedReviewItemCount: number;
  navigationAttempts: number;
  reachedMax: boolean;
};

type NormalizedPlaceInput = {
  placeId: string;
  requestedUrl: string;
  candidateUrls: string[];
};

type ResolvedReviewPage = {
  requestedUrl: string;
  navigationAttempts: number;
};

export function normalizeMaxReviews(value?: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_REVIEWS;

  const normalized = Math.floor(Number(value));

  if (normalized < 1) return DEFAULT_MAX_REVIEWS;

  return Math.min(normalized, MAX_REVIEW_LIMIT);
}

export function normalizePlaceInput(placeInput: string): NormalizedPlaceInput {
  const trimmed = placeInput.trim();

  if (!trimmed) {
    throw new Error('네이버 플레이스 ID 또는 리뷰 URL을 입력해 주세요.');
  }

  if (/^\d+$/.test(trimmed)) {
    const candidateUrls = buildCandidateReviewUrls(trimmed);

    return {
      placeId: trimmed,
      requestedUrl: candidateUrls[0],
      candidateUrls,
    };
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(trimmed);
  } catch {
    throw new Error(
      '플레이스 ID는 숫자만, URL은 https://m.place.naver.com/... 형식으로 입력해 주세요.',
    );
  }

  const placeIdMatch = parsedUrl.pathname.match(/\/(\d+)(?:\/|$)/);

  if (!placeIdMatch?.[1]) {
    throw new Error('입력한 URL에서 네이버 플레이스 ID를 찾지 못했습니다.');
  }

  const placeId = placeIdMatch[1];
  const url = new URL(parsedUrl.toString());

  if (!url.pathname.includes('/review/visitor')) {
    const category = url.pathname.split('/').filter(Boolean)[0] || 'place';
    url.pathname = `/${category}/${placeId}/review/visitor`;
  }

  url.search = '';

  const requestedUrl = url.toString();

  return {
    placeId,
    requestedUrl,
    candidateUrls: buildCandidateReviewUrls(placeId, requestedUrl),
  };
}

function buildNaverPlaceReviewUrl(
  type: NaverPlaceCandidateType,
  placeId: string,
): string {
  return `${NAVER_MOBILE_PLACE_ORIGIN}/${type}/${placeId}/review/visitor`;
}

function buildCandidateReviewUrls(
  placeId: string,
  firstUrl?: string,
): string[] {
  const urls = [
    firstUrl,
    ...NAVER_PLACE_CANDIDATE_TYPES.map((type) =>
      buildNaverPlaceReviewUrl(type, placeId),
    ),
  ].filter((url): url is string => Boolean(url));

  return Array.from(new Set(urls));
}

export async function collectNaverPlaceReviews({
  placeInput,
  maxReviews,
  onProgress,
}: ReviewCollectionOptions): Promise<ReviewCollectionResult> {
  const normalizedInput = normalizePlaceInput(placeInput);
  const reviewLimit = normalizeMaxReviews(maxReviews);

  onProgress?.({
    collectedReviewCount: 0,
    totalReviewCount: reviewLimit,
    loadedReviewItemCount: 0,
    phase: 'initializing',
  });

  let browser: Browser | undefined;

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-sandbox',
      ],
    });

    const context = await browser.newContext({
      acceptDownloads: false,
      hasTouch: true,
      isMobile: true,
      javaScriptEnabled: true,
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
      userAgent: MOBILE_USER_AGENT,
      viewport: { width: 390, height: 844 },
      extraHTTPHeaders: {
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    const page = await context.newPage();
    page.setDefaultNavigationTimeout(45_000);
    page.setDefaultTimeout(15_000);

    onProgress?.({
      collectedReviewCount: 0,
      totalReviewCount: reviewLimit,
      loadedReviewItemCount: 0,
      phase: 'navigating',
    });

    const resolvedReviewPage = await resolveReviewPageUrl(
      page,
      normalizedInput.candidateUrls,
    );
    const reviews = await collectReviewsFromLoadedPage(
      page,
      reviewLimit,
      onProgress,
    );
    const loadedReviewItemCount = await getReviewItemCount(page);

    onProgress?.({
      collectedReviewCount: reviews.length,
      totalReviewCount: reviewLimit,
      loadedReviewItemCount,
      phase: 'done',
    });

    return {
      placeId: normalizedInput.placeId,
      requestedUrl: resolvedReviewPage.requestedUrl,
      finalUrl: page.url(),
      maxReviews: reviewLimit,
      reviews,
      loadedReviewItemCount,
      navigationAttempts: resolvedReviewPage.navigationAttempts,
      reachedMax: reviews.length >= reviewLimit,
    };
  } finally {
    await browser?.close();
  }
}

async function resolveReviewPageUrl(
  page: Page,
  candidateUrls: string[],
): Promise<ResolvedReviewPage> {
  let totalNavigationAttempts = 0;
  let lastError: unknown;

  for (const candidateUrl of candidateUrls) {
    let navigationAttempts = 0;

    try {
      navigationAttempts = await gotoReviewPageWithRetry(page, candidateUrl);
      totalNavigationAttempts += navigationAttempts;

      await waitForReviewSection(page);

      return {
        requestedUrl: candidateUrl,
        navigationAttempts: totalNavigationAttempts,
      };
    } catch (error) {
      lastError = error;

      if (navigationAttempts === 0) {
        totalNavigationAttempts += MAX_NAVIGATION_RETRIES;
      }
    }
  }

  throw new Error(
    `네이버 플레이스 리뷰 페이지를 찾지 못했습니다. place, restaurant, hospital 등 후보 URL을 모두 시도했지만 실패했습니다.${
      lastError instanceof Error ? ` (${lastError.message})` : ''
    }`,
  );
}

async function gotoReviewPageWithRetry(
  page: Page,
  url: string,
): Promise<number> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_NAVIGATION_RETRIES; attempt += 1) {
    try {
      if (attempt === 1) {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
      } else {
        await page.reload({ waitUntil: 'domcontentloaded' });
      }

      await waitForPageSettled(page);

      const bodyText = await getBodyText(page);

      if (!isNaverTemporaryLoadError(bodyText)) {
        return attempt;
      }

      lastError = new Error('네이버 플레이스가 임시 오류 화면을 반환했습니다.');
      await page.waitForTimeout(900 * attempt);
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(900 * attempt);
    }
  }

  throw new Error(
    `네이버 플레이스 리뷰 페이지를 불러오지 못했습니다. 새로고침을 ${MAX_NAVIGATION_RETRIES}회 시도했지만 실패했습니다.${
      lastError instanceof Error ? ` (${lastError.message})` : ''
    }`,
  );
}

async function collectReviewsFromLoadedPage(
  page: Page,
  maxReviews: number,
  onProgress?: ReviewCollectionOptions['onProgress'],
): Promise<string[]> {
  await waitForReviewSection(page);

  let reviews = await extractReviewTexts(page, maxReviews);
  await reportProgress(page, reviews, maxReviews, onProgress);

  let previousCount = reviews.length;
  let stagnantScrolls = 0;

  while (
    reviews.length < maxReviews &&
    stagnantScrolls < MAX_STAGNANT_SCROLLS
  ) {
    await expandVisibleTruncatedReviews(page);
    reviews = await extractReviewTexts(page, maxReviews);
    await reportProgress(page, reviews, maxReviews, onProgress);

    if (reviews.length >= maxReviews) break;

    const beforeItemCount = await getReviewItemCount(page);
    const clickedLoadMore = await clickLoadMoreReviews(page, beforeItemCount);

    if (!clickedLoadMore) {
      await scrollReviewPage(page);
    }

    await waitForPageSettled(page);
    await expandVisibleTruncatedReviews(page);

    reviews = await extractReviewTexts(page, maxReviews);
    await reportProgress(page, reviews, maxReviews, onProgress);

    const currentItemCount = await getReviewItemCount(page);

    if (reviews.length > previousCount || currentItemCount > beforeItemCount) {
      previousCount = reviews.length;
      stagnantScrolls = 0;
    } else {
      stagnantScrolls += 1;
    }
  }

  return reviews.slice(0, maxReviews);
}

async function reportProgress(
  page: Page,
  reviews: string[],
  maxReviews: number,
  onProgress?: ReviewCollectionOptions['onProgress'],
) {
  if (!onProgress) return;

  const loadedReviewItemCount = await getReviewItemCount(page);

  onProgress({
    collectedReviewCount: Math.min(reviews.length, maxReviews),
    totalReviewCount: maxReviews,
    loadedReviewItemCount,
    phase: 'collecting',
  });
}

async function waitForReviewSection(page: Page) {
  await page
    .locator('#_review_list, div.place_section_content')
    .first()
    .waitFor({ state: 'attached', timeout: 20_000 })
    .catch(async () => {
      const bodyText = await getBodyText(page);

      if (isNaverTemporaryLoadError(bodyText)) {
        throw new Error(
          '네이버 플레이스 오류 화면이 표시되어 리뷰 영역을 찾지 못했습니다.',
        );
      }

      throw new Error(
        '리뷰 목록 영역(#_review_list 또는 div.place_section_content)을 찾지 못했습니다.',
      );
    });
}

async function clickLoadMoreReviews(
  page: Page,
  beforeItemCount: number,
): Promise<boolean> {
  const candidates = [
    page.locator('div.NSTUp a.fvwqf').filter({ hasText: /펼쳐서\s*더보기/ }),
    page.getByRole('button', { name: /펼쳐서\s*더보기/ }),
    page.locator('a, button').filter({ hasText: /^\s*펼쳐서\s*더보기\s*$/ }),
  ];

  for (const locator of candidates) {
    const count = await locator.count().catch(() => 0);

    for (let index = 0; index < count; index += 1) {
      const target = locator.nth(index);
      const isVisible = await target.isVisible().catch(() => false);

      if (!isVisible) continue;

      await target.scrollIntoViewIfNeeded().catch(() => undefined);
      await target.click({ timeout: 7_000 }).catch(() => undefined);

      await page
        .waitForFunction(
          (previous) =>
            document.querySelectorAll(
              '#_review_list > li, ul[id="_review_list"] > li, div.place_section_content li.place_apply_pui',
            ).length > previous,
          beforeItemCount,
          { timeout: 8_000 },
        )
        .catch(() => undefined);

      return true;
    }
  }

  return false;
}

async function expandVisibleTruncatedReviews(page: Page) {
  const moreButtons = page
    .locator(
      '#_review_list a[data-pui-click-code="rvshowmore"], #_review_list a.pui__wFzIYl, div.place_section_content a[data-pui-click-code="rvshowmore"], div.place_section_content a.pui__wFzIYl',
    )
    .filter({ hasText: /^\s*더보기\s*$/ });

  const count = await moreButtons.count().catch(() => 0);
  const maxClicks = Math.min(count, 30);

  for (let index = 0; index < maxClicks; index += 1) {
    const button = moreButtons.nth(index);
    const isVisible = await button.isVisible().catch(() => false);

    if (!isVisible) continue;

    await button.scrollIntoViewIfNeeded().catch(() => undefined);
    await button.click({ timeout: 3_000 }).catch(() => undefined);
    await page.waitForTimeout(120);
  }
}

async function scrollReviewPage(page: Page) {
  await page.mouse.wheel(0, 2_800).catch(() => undefined);
  await page.evaluate(() => {
    window.scrollBy({
      top: Math.round(window.innerHeight * 1.8),
      behavior: 'instant',
    });
  });
  await page.waitForTimeout(800);
}

async function extractReviewTexts(
  page: Page,
  maxReviews: number,
): Promise<string[]> {
  return page.evaluate((limit) => {
    const reviewItems = Array.from(
      document.querySelectorAll(
        '#_review_list > li, ul[id="_review_list"] > li, div.place_section_content li.place_apply_pui',
      ),
    );

    const normalize = (value: string) =>
      value
        .replace(/\r/g, '')
        .split('\n')
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter((line) => line && line !== '더보기')
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/\s*더보기\s*$/g, '')
        .trim();

    const findReviewTextNode = (item: Element): HTMLElement | null => {
      const selectors = [
        '.pui__vn15t2 a[data-pui-click-code="rvshowmore"]',
        '.pui__vn15t2 a:not(.pui__wFzIYl)',
        '.pui__vn15t2',
        '[data-pui-click-code="rvshowmore"]',
      ];

      for (const selector of selectors) {
        const node = item.querySelector(selector);

        if (node instanceof HTMLElement) {
          const text = normalize(node.innerText || node.textContent || '');

          if (text && text !== '더보기') return node;
        }
      }

      return null;
    };

    const unique = new Map<string, string>();

    for (const item of reviewItems) {
      const reviewNode = findReviewTextNode(item);

      if (!reviewNode) continue;

      const reviewText = normalize(
        reviewNode.innerText || reviewNode.textContent || '',
      );
      const dedupeKey = reviewText.replace(/\s+/g, ' ').trim();

      if (reviewText && dedupeKey && !unique.has(dedupeKey)) {
        unique.set(dedupeKey, reviewText);
      }

      if (unique.size >= limit) break;
    }

    return Array.from(unique.values()).slice(0, limit);
  }, maxReviews);
}

async function getReviewItemCount(page: Page): Promise<number> {
  return page
    .locator(
      '#_review_list > li, ul[id="_review_list"] > li, div.place_section_content li.place_apply_pui',
    )
    .count()
    .catch(() => 0);
}

async function waitForPageSettled(page: Page) {
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await page
    .waitForLoadState('networkidle', { timeout: 10_000 })
    .catch(() => undefined);
  await page.waitForTimeout(400);
}

async function getBodyText(page: Page): Promise<string> {
  return page
    .locator('body')
    .innerText({ timeout: 5_000 })
    .catch(() => '');
}

function isNaverTemporaryLoadError(bodyText: string): boolean {
  return /오류로\s*데이터를\s*불러오지\s*못했습니다|일시적인\s*오류|다시\s*시도/i.test(
    bodyText,
  );
}
