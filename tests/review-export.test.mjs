import assert from 'node:assert/strict';
import test from 'node:test';
import { formatReviewExport, initialReviewFields, REVIEW_FIELDS } from '../lib/review-export.ts';

const review = {
  text: '친절했어요.\n좋습니다!',
  authorName: '테스트닉네임',
  profileImageUrl: 'https://example.com/photo.jpg',
  profileUrl: 'https://myplace.naver.com/example',
  writtenAt: '2026.10.29.',
  visitedAt: null,
  visitCount: '2번째 방문',
  reviewerReviewCount: null,
  rating: '5',
  keywords: ['친절해요', '분위기가 좋아요'],
  mediaUrls: ['https://example.com/1.jpg'],
  photoCount: '1',
  reviewUrl: null,
  reviewId: null,
  verification: null,
  ownerReply: null,
};

test('defaults to the same text-only format as before', () => {
  assert.equal(formatReviewExport([review], initialReviewFields()),
    '1.\n친절했어요.\n좋습니다!');
});

test('selected metadata appears with labels; missing values are omitted', () => {
  const fields = initialReviewFields();
  fields.authorName = true;
  fields.writtenAt = true;
  fields.visitedAt = true;
  fields.keywords = true;
  const output = formatReviewExport([review], fields);
  assert.match(output, /작성자 이름\(닉네임\): 테스트닉네임/);
  assert.match(output, /작성 날짜: 2026\.10\.29\./);
  assert.match(output, /리뷰 키워드: 친절해요, 분위기가 좋아요/);
  assert.doesNotMatch(output, /방문 날짜:/);
});

test('unchecking review text removes the review text', () => {
  const fields = initialReviewFields();
  fields.text = false;
  fields.profileUrl = true;
  const output = formatReviewExport([review], fields);
  assert.doesNotMatch(output, /친절했어요/);
  assert.match(output, /프로필 링크: https:\/\/myplace.naver.com\/example/);
});

test('all unselected, empty reviews, and all-missing values yield empty output', () => {
  const fields = Object.fromEntries(REVIEW_FIELDS.map(({ key }) => [key, false]));
  assert.equal(formatReviewExport([review], fields), '');
  assert.equal(formatReviewExport([], initialReviewFields()), '');
  fields.visitedAt = true;
  assert.equal(formatReviewExport([review], fields), '');
});

test('multi-review numbering skips reviews that have no chosen value', () => {
  const fields = initialReviewFields();
  fields.text = false;
  fields.rating = true;
  const output = formatReviewExport([{ ...review, rating: null }, review], fields);
  assert.equal(output, '2.\n별점: 5');
});
