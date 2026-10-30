import assert from 'node:assert/strict';
import test from 'node:test';
import { extractReviewDetails } from '../lib/review-details.ts';

// A minimal DOM double recreating the actual visitor-review header shape:
// two separate <a data-pui-click-code="profile"> links, the first for the
// avatar and the second containing .pui__NMi-Dp and .pui__RuLAax.
function makeCard(nickname, reviewCount, useFallback = false) {
  const name = { innerText: nickname, textContent: nickname };
  const count = { innerText: `리뷰 ${reviewCount} 사진 25`, textContent: `리뷰 ${reviewCount} 사진 25` };
  const avatar = { innerText: '', textContent: '', matches: () => false, querySelector: () => null, getAttribute: (key) => key === 'href' ? '/my/example/review?v=2' : null };
  const body = { innerText: '친절한 응대 감사합니다!', textContent: '친절한 응대 감사합니다!' };
  const card = {
    textContent: `${nickname} 리뷰 ${reviewCount} 사진 25 친절한 응대 감사합니다!`,
    getAttribute: () => null,
    querySelector(selector) {
      if (selector === '.pui__vn15t2 a[data-pui-click-code="rvshowmore"]') return body;
      if (selector === 'a[href*="/my/"]') return avatar;
      if (selector === 'a[data-pui-click-code="profile"] .pui__NMi-Dp' && !useFallback) return name;
      if (selector === 'a[data-pui-click-code="profile"] [class*="pui__NMi-D"]' && !useFallback) return name;
      if (selector === 'a[data-pui-click-code="profile"] .pui__uslU0d' && useFallback) return name;
      if (selector === 'a[data-pui-click-code="profile"] .pui__RuLAax') return count;
      if (selector === 'a[data-pui-click-code*="profile"]') return avatar;
      if (selector === '[data-pui-click-code*="profile"]') return avatar;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'a[href]') return [avatar];
      return [];
    },
  };
  return card;
}

async function extract(card) {
  const oldDocument = globalThis.document;
  globalThis.document = {
    baseURI: 'https://m.place.naver.com/place/37387542/review/visitor',
    querySelectorAll: (selector) => selector.includes('#_review_list') ? [card] : [],
  };
  try {
    return await extractReviewDetails({ evaluate: async (callback, limit) => callback(limit) }, 5);
  } finally {
    globalThis.document = oldDocument;
  }
}

test('recognizes nickname in actual Naver pui__NMi-Dp header', async () => {
  const details = await extract(makeCard('현정1111', 34));
  assert.equal(details.length, 1);
  assert.equal(details[0].authorName, '현정1111');
  assert.equal(details[0].reviewerReviewCount, '리뷰 34');
  assert.equal(details[0].profileUrl, 'https://m.place.naver.com/my/example/review?v=2');
  assert.equal(details[0].text, '친절한 응대 감사합니다!');
});

test('reads fallback name wrapper without including reviewer counts', async () => {
  const details = await extract(makeCard('Maltete', 23, true));
  assert.equal(details[0].authorName, 'Maltete');
  assert.equal(details[0].reviewerReviewCount, '리뷰 23');
  assert.doesNotMatch(details[0].authorName, /리뷰|사진|팔로워/);
});
