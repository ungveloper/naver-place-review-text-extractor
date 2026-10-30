import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeMaxReviews, DEFAULT_MAX_REVIEWS, MAX_REVIEW_LIMIT } from '../lib/review-config.ts';
import { extractReviewDetails } from '../lib/review-details.ts';

// Mimics the real mobile Naver review card: the avatar image sits in a profile
// anchor before the separately linked nickname, while the review text is in
// the rvshowmore section. This directly exercises the page.evaluate callback.
const NAVER_DEFAULT_AVATAR = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==';

function reviewCard(imageSource, attributes = {}) {
  const avatar = {
    matches: (selector) => selector === 'img',
    getAttribute: (key) => key === 'src' ? imageSource : (attributes[key] ?? null),
    querySelector: () => null,
  };
  const profileLink = {
    matches: () => false,
    querySelector: (selector) => selector === 'img' ? avatar : null,
    getAttribute: (key) => key === 'href' ? '/my/example/review?v=2' : null,
    textContent: '',
  };
  const name = { innerText: '테스트닉네임', textContent: '테스트닉네임' };
  const body = { innerText: '정말 친절해요!', textContent: '정말 친절해요!' };
  return {
    textContent: '테스트닉네임 리뷰 12 정말 친절해요!',
    getAttribute: () => null,
    querySelector(selector) {
      if (selector === '.pui__vn15t2 a[data-pui-click-code="rvshowmore"]') return body;
      if (selector === 'a[href*="/my/"]') return profileLink;
      if (selector === 'a[data-pui-click-code="profile"] .pui__NMi-Dp') return name;
      if (selector === 'a[href*="/my/"] img') return avatar;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'a[href]') return [profileLink];
      if (selector.startsWith('[class*="photo"] img')) return [avatar];
      return [];
    },
  };
}

async function readReview(card) {
  const before = globalThis.document;
  globalThis.document = {
    baseURI: 'https://m.place.naver.com/place/37387542/review/visitor',
    querySelectorAll: (selector) => selector.includes('#_review_list') ? [card] : [],
  };
  try {
    const items = await extractReviewDetails({ evaluate: async (callback, limit) => callback(limit) }, 3);
    assert.equal(items.length, 1);
    return items[0];
  } finally {
    globalThis.document = before;
  }
}

test('default review limit is 300; user setting still allows 1–500', () => {
  assert.equal(DEFAULT_MAX_REVIEWS, 300);
  assert.equal(MAX_REVIEW_LIMIT, 500);
  assert.equal(normalizeMaxReviews(undefined), 300);
  assert.equal(normalizeMaxReviews(NaN), 300);
  assert.equal(normalizeMaxReviews(0), 300);
  assert.equal(normalizeMaxReviews(1), 1);
  assert.equal(normalizeMaxReviews(150), 150);
  assert.equal(normalizeMaxReviews(500), 500);
  assert.equal(normalizeMaxReviews(999), 500);
});

test('real HTTP profile image is returned without changes', async () => {
  const url = 'https://search.pstatic.net/common/?type=f48_48&src=https%3A%2F%2Fexample.com%2Fp.jpg';
  const result = await readReview(reviewCard(url));
  assert.equal(result.profileImageUrl, url);
  assert.equal(result.authorName, '테스트닉네임');
});

test('Naver default embedded avatar is exported as its actual data URI', async () => {
  const result = await readReview(reviewCard(NAVER_DEFAULT_AVATAR));
  assert.equal(result.profileImageUrl, NAVER_DEFAULT_AVATAR);
  assert.deepEqual(result.mediaUrls, [], 'avatar must not be counted as review photo');
});

test('explicit remote data-src takes priority over inline placeholder', async () => {
  const url = 'https://example.com/avatar.jpg';
  const result = await readReview(reviewCard(NAVER_DEFAULT_AVATAR, { 'data-src': url }));
  assert.equal(result.profileImageUrl, url);
});

test('non-image data URIs and missing avatars are not treated as profile images', async () => {
  const unsafe = await readReview(reviewCard('data:text/html;base64,PHA+SGk8L3A+'));
  assert.equal(unsafe.profileImageUrl, null);
  const absent = await readReview(reviewCard(null));
  assert.equal(absent.profileImageUrl, null);
});
