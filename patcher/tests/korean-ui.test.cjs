'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const overlay = require('../korean-ui.js');

test('translates exact Chinese, English, FLAC and MP3 labels without changing whitespace', () => {
  assert.equal(overlay.translate('下载任务'), '다운로드 작업');
  assert.equal(overlay.translate('  FLAC 无损（由 ALAC 转换，不重采样）  '), '  FLAC 무손실 (ALAC에서 변환, 리샘플링 없음)  ');
  assert.equal(overlay.translate('MP3 (320 kbps, converted from ALAC)'), 'MP3 (320 kbps, ALAC에서 변환)');
  assert.equal(overlay.translate('Export diagnostics'), '진단 내보내기');
});

test('translates bounded status and error patterns but does not guess unknown strings', () => {
  assert.equal(overlay.translate('正在加入下载队列…'), '다운로드 대기열에 추가하는 중…');
  assert.equal(overlay.translate('请在 15 秒内完成'), '15초 안에 완료하세요');
  assert.equal(overlay.translate('下载任务队列初始化失败。请导出诊断。'), '다운로드 작업 대기열 초기화에 실패했습니다. 진단을 내보내세요.');
  assert.equal(overlay.translate('正在获取 Music 会话…'), 'Music 세션을 가져오는 중…');
  assert.equal(overlay.translate('暂无内容。'), '콘텐츠가 없습니다.');
  assert.equal(overlay.translate('手机号会补上所选国家区号，默认中国大陆 +86；已带 + 区号的号码直接使用。'), '전화번호에는 선택한 국가 번호가 추가됩니다. 기본값은 중국 본토 +86이며 + 국가 번호가 있는 번호는 그대로 사용합니다.');
  assert.equal(overlay.translate('My Song - 下载任务'), 'My Song - 下载任务');
  assert.equal(overlay.translate(''), '');
});

function fakeElement({ tagName = 'DIV', excluded = false, allowedRoot = true, optionParent = false } = {}) {
  return {
    tagName,
    closest(selector) {
      if (selector.includes('#catalog-content') && selector.includes('.catalog-card')) return excluded ? {} : null;
      if (selector.includes('#region')) return optionParent ? {} : null;
      if (selector.includes('#app-header')) return allowedRoot ? {} : null;
      return null;
    },
    matches(selector) { return selector === 'option' && String(tagName).toLowerCase() === 'option'; }
  };
}

test('only permits declared UI chrome/status roots and approved select options', () => {
  assert.equal(overlay.isAllowedElement(fakeElement()), true);
  assert.equal(overlay.isAllowedElement(fakeElement({ excluded: true })), false);
  assert.equal(overlay.isAllowedElement(fakeElement({ tagName: 'INPUT' })), false);
  assert.equal(overlay.isAllowedElement(fakeElement({ tagName: 'TEXTAREA' })), false);
  assert.equal(overlay.isAllowedElement(fakeElement({ tagName: 'OPTION', optionParent: true })), true);
  assert.equal(overlay.isAllowedElement(fakeElement({ tagName: 'OPTION', optionParent: false })), false);
  assert.equal(overlay.isAllowedAttributeElement(fakeElement({ tagName: 'INPUT' })), true);
});

test('does not mutate text node under excluded music metadata', () => {
  const parent = fakeElement({ excluded: true });
  const node = { nodeType: 3, nodeValue: '下载任务', parentElement: parent };
  assert.equal(overlay.translateTextNode(node), false);
  assert.equal(node.nodeValue, '下载任务');
});

test('excludes Apple original authentication text and actual download paths', () => {
  for (const selector of ['#interaction-original-text', '#download-directory']) {
    const element = {
      tagName: 'P',
      matches() { return false; },
      closest(query) {
        if (query.includes(selector)) return {};
        if (query.includes('#app-header')) return {};
        return null;
      }
    };
    assert.equal(overlay.isAllowedElement(element), false, selector);
  }
});

test('translates generated toolbar page titles while resource title elements remain separate', () => {
  function pageTitle(viewId) {
    return {
      id: 'page-title', tagName: 'H1', matches() { return false; }, closest() { return null; },
      ownerDocument: { getElementById(id) { return id === viewId ? { hidden: false } : { hidden: true }; } }
    };
  }
  assert.equal(overlay.isAllowedElement(pageTitle('settings-view')), true);
  assert.equal(overlay.isAllowedElement(pageTitle('tasks-view')), true);
  assert.equal(overlay.isAllowedElement(pageTitle('browse-view')), true);
  const metadataTitle = pageTitle('browse-view');
  metadataTitle.id = '';
  assert.equal(overlay.isAllowedElement(metadataTitle), false);
});

test('only translates the final known status in a combined job-item row', () => {
  assert.equal(overlay.translateJobItem('完成 · 曲名 · 不可用'), '完成 · 曲名 · 사용할 수 없음');
  assert.equal(overlay.translateJobItem('主页 · 完成'), '主页 · 완료');
  assert.equal(overlay.translateJobItem('My song · 임의 상태'), 'My song · 임의 상태');
  assert.equal(overlay.translateJobItem('My song · 완료'), 'My song · 완료');
  assert.equal(overlay.translateJobItem('完成'), '完成');
});

test('translates transfer phases and metrics without guessing unknown pieces', () => {
  assert.equal(overlay.translateTransfer('正在下载 · 预估 25% · 4 KiB/s · 本次已接收 1 KiB'), '다운로드하는 중 · 예상 25% · 4 KiB/s · 이번에 받은 데이터 1 KiB');
  assert.equal(overlay.translateTransfer('new-stage · 12 KiB'), 'new-stage · 12 KiB');
  assert.equal(overlay.translate('constructor'), 'constructor');
  assert.equal(overlay.translateTransfer('正在下载 · 已处理 1 / 4 首 · 4 项活动任务'), '다운로드하는 중 · 1 / 4곡 처리함 · 활성 작업 4개');
  assert.equal(overlay.translate('预估进度 25.5%，已处理 1 首，共 4 首'), '예상 진행률 25.5%, 4곡 중 1곡 처리함');
});

test('active monitor title is media content; empty and stale monitor titles are system labels', () => {
  function monitor(active, detail) {
    return {id:'monitor-title',tagName:'STRONG',matches(){return false;},closest(){return null;},
      ownerDocument:{getElementById(id){return id==='sidebar-job-count'?{hidden:!active}:{textContent:detail};}}};
  }
  assert.equal(overlay.isAllowedElement(monitor(true,'正在下载 · 正在解析曲目')),false);
  assert.equal(overlay.isAllowedElement(monitor(false,'当前没有活动下载')),true);
  assert.equal(overlay.isAllowedElement(monitor(true,'连接中断，正在重试…')),true);
});

test('translates an input accessibility hint without touching its user value', () => {
  const attributes = new Map([['placeholder', '搜索'], ['aria-label', '搜索 Apple Music']]);
  const input = {
    ...fakeElement({ tagName: 'INPUT' }),
    value: 'user entered Apple Music URL',
    childNodes: [],
    hasAttribute(name) { return attributes.has(name); },
    getAttribute(name) { return attributes.get(name); },
    setAttribute(name, value) { attributes.set(name, value); }
  };
  assert.equal(overlay.translateElement(input), 2);
  assert.equal(attributes.get('placeholder'), '검색');
  assert.equal(attributes.get('aria-label'), 'Apple Music 검색');
  assert.equal(input.value, 'user entered Apple Music URL');
});
