import type { Page } from 'playwright-core';

/** Only data visibly present in a Naver Place visitor-review card is collected. */
export type ReviewDetails = {
  text: string;
  authorName: string | null;
  profileImageUrl: string | null;
  profileUrl: string | null;
  writtenAt: string | null;
  visitedAt: string | null;
  visitCount: string | null;
  reviewerReviewCount: string | null;
  rating: string | null;
  keywords: string[];
  mediaUrls: string[];
  photoCount: string | null;
  reviewUrl: string | null;
  reviewId: string | null;
  verification: string | null;
  ownerReply: string | null;
};

/**
 * Keep all DOM reads in one page.evaluate pass. Naver changes hashed class names
 * periodically, so use known selectors with narrowly scoped semantic fallbacks.
 */
export async function extractReviewDetails(
  page: Page,
  maxReviews: number,
): Promise<ReviewDetails[]> {
  return page.evaluate((limit): ReviewDetails[] => {
    const cards = Array.from(
      document.querySelectorAll(
        '#_review_list > li, ul[id="_review_list"] > li, div.place_section_content li.place_apply_pui',
      ),
    );
    const clean = (value?: string | null) =>
      (value ?? '').replace(/\s+/g, ' ').trim();
    const cleanBody = (value?: string | null) =>
      (value ?? '')
        .replace(/\r/g, '')
        .split('\n')
        .map((line) => clean(line))
        .filter((line) => line && line !== '더보기')
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/\s*더보기\s*$/g, '')
        .trim();
    const first = (root: Element, selectors: string[]): Element | null => {
      for (const selector of selectors) {
        const found = root.querySelector(selector);
        if (found) return found;
      }
      return null;
    };
    const textOf = (node: Element | null) =>
      clean((node as HTMLElement | null)?.innerText || node?.textContent);
    const urlOf = (raw?: string | null): string | null => {
      if (!raw) return null;
      try {
        const url = new URL(raw.trim(), document.baseURI);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
      } catch {
        return null;
      }
    };
    const imgOf = (root: Element | null): string | null => {
      const img = root?.matches('img')
        ? (root as HTMLImageElement)
        : root?.querySelector('img');
      if (!img) return null;
      const raw = img.getAttribute('data-src') || img.getAttribute('data-lazy-src') ||
        img.getAttribute('src') || img.getAttribute('data-original') ||
        img.getAttribute('srcset')?.split(',')[0]?.trim().split(/\s+/)[0];
      return urlOf(raw);
    };
    const findReviewBody = (card: Element): string => {
      const selectors = [
        '.pui__vn15t2 a[data-pui-click-code="rvshowmore"]',
        '.pui__vn15t2 a:not(.pui__wFzIYl)',
        '.pui__vn15t2',
        '[data-pui-click-code="rvshowmore"]',
      ];
      for (const selector of selectors) {
        const node = card.querySelector(selector);
        const body = cleanBody(
          (node as HTMLElement | null)?.innerText || node?.textContent,
        );
        if (body && body !== '더보기') return body;
      }
      return '';
    };
    const datePattern = /(?:\d{4}[.\-/]\s*\d{1,2}[.\-/]\s*\d{1,2}\.?)|(?:\d{1,2}[.]\s*\d{1,2}[.])|(?:\d+\s*(?:일|주|개월|달|년|시간|분)\s*전)|(?:오늘|어제)/;
    const findDate = (root: Element, selectors: string[]): string | null => {
      for (const selector of selectors) {
        for (const node of Array.from(root.querySelectorAll(selector))) {
          const raw = textOf(node);
          const match = raw.match(datePattern);
          if (match) return clean(match[0]);
          const time = node.getAttribute('datetime') || node.getAttribute('title');
          if (time && datePattern.test(time)) return clean(time);
        }
      }
      return null;
    };
    const unique = new Map<string, ReviewDetails>();
    for (const card of cards) {
      const text = findReviewBody(card);
      // Preserve the existing text-review-only scope; don't fabricate an empty body.
      if (!text) continue;

      const profileLink = first(card, [
        'a[href*="/my/"]',
        'a[href*="myplace.naver.com"]',
        'a[href*="/profile/"]',
        'a[href*="/reviewer/"]',
        'a[data-pui-click-code*="profile"]',
        '.pui__NMi-D a',
      ]);
      const nameElement = first(card, [
        '.pui__NMi-D',
        '.pui__J0lZf',
        '[class*="nickname"]',
        '[class*="Nickname"]',
        '[data-pui-click-code*="profile"]',
      ]);
      const authorName = textOf(nameElement) || textOf(profileLink) || null;
      const avatarElement = first(card, [
        '[class*="profileImage"]',
        '[class*="ProfileImage"]',
        '[class*="profile_img"]',
        '[class*="profile"] img',
        'a[href*="/my/"] img',
        'a[href*="/profile/"] img',
      ]);
      const profileImageUrl = imgOf(avatarElement) || imgOf(profileLink);
      const profileUrl = urlOf(profileLink?.getAttribute('href'));

      const dateNodes = Array.from(
        card.querySelectorAll('.pui__gfuUIT, .pui__QKE5Pr time, time[datetime], [class*="reviewDate"], [class*="writeDate"]'),
      );
      const writtenAt = findDate(card, [
        'time[datetime]',
        '[class*="reviewDate"]',
        '[class*="writeDate"]',
        '.pui__gfuUIT',
        '[class*="date"]',
      ]) || null;
      const visitedAt = findDate(card, [
        '[class*="visitDate"]',
        '[class*="visit_date"]',
        '[class*="visitedAt"]',
      ]) || dateNodes.map((node) => textOf(node))
        .map((value) => value.match(/방문(?:일)?\s*[:：]?\s*(.+)/)?.[1] || '')
        .map((value) => value.match(datePattern)?.[0] || '')
        .find(Boolean) || null;

      const cardText = clean(card.textContent);
      const visitCount = cardText.match(/(?:\d+\s*번째\s*방문|방문\s*\d+\s*회)/)?.[0] || null;
      const authorBlock = first(card, [
        '[class*="profile"]', '[class*="Profile"]', '.pui__NMi-D',
      ]);
      const reviewerReviewCount = textOf(authorBlock).match(/(?:리뷰|후기)\s*\d+\s*(?:개|건)?/)?.[0] || null;

      const ratingText = Array.from(card.querySelectorAll('[aria-label*="별점"], [aria-label*="평점"], [title*="별점"], [class*="rating"], [class*="Rating"]'))
        .map((node) => node.getAttribute('aria-label') || node.getAttribute('title') || textOf(node))
        .find((value) => /(?:별점|평점|★)\s*[:：]?\s*[1-5](?:\.\d+)?/.test(value)) || '';
      const rating = ratingText.match(/(?:별점|평점|★)\s*[:：]?\s*([1-5](?:\.\d+)?)/)?.[1] || null;

      const keywords = Array.from(new Set(Array.from(card.querySelectorAll(
        '[class*="keyword"], [class*="Keyword"], [data-pui-click-code*="keyword"], .pui__j2AvbB',
      )).map(textOf).filter((value) => value.length > 1 && value.length <= 90 &&
        !/^(?:더보기|접기|키워드 리뷰)$/.test(value)))).slice(0, 30);

      const mediaNodes = Array.from(card.querySelectorAll(
        '[class*="photo"] img, [class*="Photo"] img, [class*="image"] img, [class*="Image"] img, a[data-pui-click-code*="photo"] img',
      ));
      const mediaUrls = Array.from(new Set(mediaNodes.map((node) => imgOf(node))
        .filter((value): value is string => Boolean(value && value !== profileImageUrl)))).slice(0, 40);
      const photoCount = cardText.match(/(?:사진|포토|이미지)\s*(\d+)\s*(?:장|개)?/)?.[1] ||
        (mediaUrls.length > 0 ? String(mediaUrls.length) : null);

      const reviewLink = Array.from(card.querySelectorAll('a[href]')).find((node) => {
        const href = node.getAttribute('href') || '';
        return /(?:reviewId=|reviewDetail|\/reviews\/\w{5,})/i.test(href);
      });
      const reviewUrl = urlOf(reviewLink?.getAttribute('href'));
      const reviewId = card.getAttribute('data-review-id') ||
        card.getAttribute('data-id') ||
        (reviewUrl ? new URL(reviewUrl).searchParams.get('reviewId') : null);
      const verification = cardText.match(/(?:영수증|예약|결제|방문)\s*(?:인증|확인)|(?:영수증|예약)\s*리뷰/)?.[0] || null;
      const replyNode = first(card, [
        '[class*="ownerReply"]', '[class*="OwnerReply"]',
        '[class*="businessReply"]', '[class*="sellerReply"]',
        '[data-pui-click-code*="reply"]',
      ]);
      const replyText = textOf(replyNode);
      const ownerReply = replyText && replyText.length < 2000 &&
        /(?:사장님|업체|답글)/.test(replyText) ? replyText : null;

      const detail: ReviewDetails = {
        text,
        authorName,
        profileImageUrl,
        profileUrl,
        writtenAt,
        visitedAt,
        visitCount,
        reviewerReviewCount,
        rating,
        keywords,
        mediaUrls,
        photoCount,
        reviewUrl,
        reviewId,
        verification,
        ownerReply,
      };
      // Identical text by DIFFERENT reviewers is not a duplicate.
      const identity = reviewId || [text.replace(/\s+/g, ' '), authorName || '', writtenAt || '', visitedAt || ''].join('\u001f');
      if (!unique.has(identity)) unique.set(identity, detail);
      if (unique.size >= limit) break;
    }
    return Array.from(unique.values());
  }, maxReviews);
}
