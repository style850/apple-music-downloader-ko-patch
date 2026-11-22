'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const overlay = require('../korean-ui.js');

test('translates the missing catalog labels and detail controls from the reported screens', () => {
  assert.equal(overlay.translate('主页'), '홈');
  assert.equal(overlay.translate('新发现'), '새로운 발견');
  assert.equal(overlay.translate('我的歌单'), '내 플레이리스트');
  assert.equal(overlay.translate('编辑精选'), '에디터 추천');
  assert.equal(overlay.translate('▶ 播放'), '▶ 재생');
  assert.equal(overlay.translate('下载全部'), '전체 다운로드');
  assert.equal(overlay.translate('目录暂不可用，请检查登录与网络后重试。'), '카탈로그를 사용할 수 없습니다. 로그인과 네트워크를 확인한 뒤 다시 시도하세요.');
});

test('translates whole job summaries with arbitrary numeric counts but only known statuses', () => {
  assert.equal(
    overlay.translate('完成 · 成功 1 · 失败 0 · 跳过 0 · 不可用 0'),
    '완료 · 성공 1 · 실패 0 · 건너뜀 0 · 사용할 수 없음 0'
  );
  assert.equal(
    overlay.translate('已取消 · 成功 0 · 失败 0 · 跳过 3 · 不可用 7'),
    '취소됨 · 성공 0 · 실패 0 · 건너뜀 3 · 사용할 수 없음 7'
  );
  assert.equal(
    overlay.translate('Unreleased song · 成功 1 · 失败 0 · 跳过 0 · 不可用 0'),
    'Unreleased song · 成功 1 · 失败 0 · 跳过 0 · 不可用 0'
  );
});

test('translates job controls, unavailable status, generic failure and operation feedback', () => {
  assert.equal(overlay.translate('不可用'), '사용할 수 없음');
  assert.equal(overlay.translate('取消'), '취소');
  assert.equal(overlay.translate('重试失败项'), '실패 항목 다시 시도');
  assert.equal(overlay.translate('仅删除任务'), '작업만 삭제');
  assert.equal(overlay.translate('删除任务与文件'), '작업 및 파일 삭제');
  assert.equal(overlay.translate('未获得明确失败原因，请导出诊断以便排查。'), '명확한 실패 이유를 확인하지 못했습니다. 진단을 내보내어 확인하세요.');
  assert.equal(overlay.translate('此任务正在删除，请等待完成后刷新列表。'), '이 작업을 삭제 중입니다. 완료될 때까지 기다린 후 목록을 새로 고치세요.');
});

test('preserves unknown song strings while translating bounded generated error text', () => {
  assert.equal(overlay.translate('My Song · 未知状态'), 'My Song · 未知状态');
  assert.equal(overlay.translate('失败原因：network response unavailable'), '실패 이유: network response unavailable');
  assert.equal(overlay.translate('媒体传输超时。请检查网络或本机服务后重试。'), '미디어 전송 시간이 초과되었습니다. 네트워크 또는 로컬 서비스를 확인한 뒤 다시 시도하세요.');
});
