import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import test from 'node:test';
import { generateReviewXlsx } from '../lib/review-xlsx.ts';
import { buildSelectedReviewSheet, initialReviewFields, REVIEW_FIELDS } from '../lib/review-export.ts';

const review = {
  text: '친절해요!\n다음에도 방문할게요 <3',
  authorName: '현정1111',
  profileImageUrl: null,
  profileUrl: 'https://m.place.naver.com/my/example/review?v=2',
  writtenAt: '10.29.', visitedAt: null, visitCount: null,
  reviewerReviewCount: '리뷰 34', rating: null, keywords: [], mediaUrls: [],
  photoCount: null, reviewUrl: null, reviewId: null, verification: null, ownerReply: null,
};

test('default selection yields only number and review text columns', () => {
  const sheet = buildSelectedReviewSheet([review], initialReviewFields());
  assert.deepEqual(sheet.headers, ['번호', '리뷰 내용']);
  assert.deepEqual(sheet.rows, [['1', review.text]]);
});

test('selected Excel fields, order, missing cells, and original review numbering match selection', () => {
  const fields = initialReviewFields();
  fields.text = false;
  fields.authorName = true;
  fields.profileUrl = true;
  fields.writtenAt = true;
  const sheet = buildSelectedReviewSheet([{ ...review, authorName: null, profileUrl: null, writtenAt: null }, review], fields);
  assert.deepEqual(sheet.headers, ['번호', '작성자 이름(닉네임)', '프로필 링크', '작성 날짜']);
  assert.deepEqual(sheet.rows, [['2', '현정1111', 'https://m.place.naver.com/my/example/review?v=2', '10.29.']]);
});

test('all unselected fields produce no data and Excel writer refuses it', () => {
  const fields = Object.fromEntries(REVIEW_FIELDS.map(({ key }) => [key, false]));
  const sheet = buildSelectedReviewSheet([review], fields);
  assert.deepEqual(sheet.rows, []);
  assert.throws(() => generateReviewXlsx(sheet), /선택/);
});

test('XLSX is a ZIP with worksheet XML, UTF8, literal formula strings, and styles', () => {
  const data = { headers: ['번호', '작성자 이름(닉네임)', '리뷰 내용'], rows: [['1', '현정1111', '=HYPERLINK("https://invalid","x")\n안녕하세요 & <모두>']] };
  const bytes = generateReviewXlsx(data);
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  const decoded = new TextDecoder().decode(bytes);
  assert.match(decoded, /xl\/worksheets\/sheet1\.xml/);
  assert.match(decoded, /현정1111/);
  assert.match(decoded, /&lt;모두&gt;/);
  assert.match(decoded, /t="inlineStr"/);
  assert.doesNotMatch(decoded, /<f>/);
  writeFileSync('/tmp/naver-place-review-xlsx-smoke.xlsx', bytes);
});
