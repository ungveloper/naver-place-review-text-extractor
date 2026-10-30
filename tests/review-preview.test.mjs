import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPreviewSections, isSupportedAvatarSource, readablePreviewValue,
} from '../lib/review-preview.ts';

const review = {
  text: '벌써 3번째 방문이에용!!!\n대여랑 반납 편리해서 좋어용',
  authorName: '맹굴댕굴',
  profileImageUrl: 'https://search.pstatic.net/common/?src=image.jpg',
  profileUrl: 'https://m.place.naver.com/my/test/review?v=2',
  writtenAt: null,
  keywords: ['친절해요', '픽업이 편리해요'],
};

test('selected items appear as separate label and value with unchanged newlines', () => {
  const sections = getPreviewSections(review, [
    { key: 'text', label: '리뷰 내용' },
    { key: 'authorName', label: '작성자 이름(닉네임)' },
    { key: 'profileUrl', label: '프로필 링크' },
  ]);
  assert.deepEqual(sections.map(({ label, value }) => [label, value]), [
    ['리뷰 내용', '벌써 3번째 방문이에용!!!\n대여랑 반납 편리해서 좋어용'],
    ['작성자 이름(닉네임)', '맹굴댕굴'],
    ['프로필 링크', 'https://m.place.naver.com/my/test/review?v=2'],
  ]);
});

test('missing metadata is hidden and array metadata remains available to copy', () => {
  const sections = getPreviewSections(review, [
    { key: 'writtenAt', label: '작성 날짜' },
    { key: 'keywords', label: '리뷰 키워드' },
  ]);
  assert.deepEqual(sections, [{ key: 'keywords', label: '리뷰 키워드', value: '친절해요, 픽업이 편리해요' }]);
});

test('avatar URL validation supports Naver HTTPS and inline default image', () => {
  assert.equal(isSupportedAvatarSource('https://search.pstatic.net/common/?src=abc'), true);
  assert.equal(isSupportedAvatarSource('data:image/png;base64,aGVsbG8='), true);
  assert.equal(isSupportedAvatarSource('data:image/svg+xml;base64,PHN2Zz4='), false);
  assert.equal(isSupportedAvatarSource('javascript:alert(1)'), false);
  assert.equal(isSupportedAvatarSource(null), false);
});

test('long inline image data is shortened for display but not modified in selected source', () => {
  const original = 'data:image/png;base64,' + 'a'.repeat(500);
  const selected = getPreviewSections({ ...review, profileImageUrl: original }, [
    { key: 'profileImageUrl', label: '프로필 이미지 경로(URL)' },
  ]);
  assert.equal(selected[0].value, original);
  assert.match(readablePreviewValue(selected[0].value), /기본 프로필 이미지/);
  assert.ok(readablePreviewValue(selected[0].value).length < original.length);
  assert.equal(readablePreviewValue('https://a.example/test.jpg'), 'https://a.example/test.jpg');
});
