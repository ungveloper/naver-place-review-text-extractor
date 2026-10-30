import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const card = readFileSync(new URL('../components/reviews/review-preview-card.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');

test('card avatar is independent of profile image checkbox', () => {
  assert.doesNotMatch(card, /\bshowAvatar\b/);
  assert.doesNotMatch(page, /showAvatar=/);
  assert.match(card, /const avatarUrl = isSupportedAvatarSource\(review\.profileImageUrl\) && !avatarFailed/);
  assert.match(card, /<img src=\{avatarUrl\}/);
});

test('unavailable or failed image still falls back to the person icon', () => {
  assert.match(card, /onError=\{\(\) => setAvatarFailed\(true\)\}/);
  assert.match(card, /<UserRound aria-hidden="true"/);
});

test('profile image details remain optional and selection controls only exported sections', () => {
  assert.match(page, /getPreviewSections\(review, selectedFields\)/);
  assert.match(page, /showAuthor=\{selection\.authorName\}/);
  assert.match(card, /key === 'profileImageUrl'/);
});
