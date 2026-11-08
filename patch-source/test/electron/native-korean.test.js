'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const renderer = fs.readFileSync(path.join(root, 'src/renderer/native-renderer.js'), 'utf8');
const login = fs.readFileSync(path.join(root, 'src/renderer/native-login.js'), 'utf8');

test('native renderer leaves Chinese only in the Apple-supplied personal-mix title matcher', () => {
  const matcher = '专属推荐歌单|專屬推薦歌單|为你打造的歌单|為你打造的播放列表';
  const sourceWithoutMatcher = renderer.replace(matcher, '');
  assert.doesNotMatch(sourceWithoutMatcher, /[\p{Script=Han}]/u);
  assert.match(renderer, /new Intl\.DateTimeFormat\('ko-KR'/);
});

test('native login error messages contain no Chinese UI copy', () => {
  assert.doesNotMatch(login, /[\p{Script=Han}]/u);
  assert.match(login, /Music 사용자 세션이 거부되었습니다/);
});
