// Modified 2026-11-08 for the Korean/security patch; see docs/PATCH-ATTRIBUTION.ko.md.
'use strict';
(() => {
  const api = window.nativeStartup;
  const error = document.getElementById('startup-error');
  let received = false;
  function render(value) {
    const failed = value?.phase === 'failed';
    document.body.dataset.phase = failed ? 'failed' : 'loading';
    error.hidden = !failed;
  }
  api.onState(value => { received = true; render(value); });
  api.getState().then(value => { if (!received) render(value); }).catch(() => { if (!received) render({ phase: 'failed' }); });
  for (const [id, action] of [['startup-enter', 'enter'], ['startup-quit', 'quit']]) {
    const button = document.getElementById(id);
    button.onclick = async () => {
      button.disabled = true;
      try { await api[action](); }
      catch { document.getElementById('startup-message').textContent = '작업을 완료할 수 없습니다. 다시 시도하세요.'; }
      finally { button.disabled = false; }
    };
  }
})();
