// Modified 2026-11-08 for the Korean/security patch; see docs/PATCH-ATTRIBUTION.ko.md.
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const motion = window.nativeMotion;
  const accountInput=window.nativeAccountInput.attach($('login-email'));
  window.nativeLoginAccount=accountInput;
  let state = 'checking'; let pending = false;
  const messages = { checking: '기존 세션을 복원하고 확인하는 중…', needs_login: 'Apple 계정으로 계속하기', authenticating: '로그인하는 중…', needs_2fa: '이번 로그인에 받은 6자리 코드를 입력하세요', authenticated: '로그인 완료', unverified: '기존 세션을 확인할 수 없습니다. 다시 시도하세요.', runtime_unavailable: '로컬 서비스를 사용할 수 없습니다. 다시 시도하세요.' };
  messages.needs_interaction='아래 Apple 계정 인증 안내를 완료하세요';
  const stageMessages={device_login:'Apple 계정을 확인하는 중…',device_code:'기기 인증 코드를 확인하는 중…',music_service_start:'Music 서비스를 시작하는 중…',music_tokens:'Music 세션을 가져오는 중…',music_storefront:'Music 세션을 확인하는 중…'};
  const errors = {
    native_login_failed:'로그인을 완료하지 못했습니다. 진단을 내보낸 뒤 다시 시도하세요.',native_auth_cancelled:'이번 로그인이 취소되었습니다.',native_auth_required:'먼저 로그인을 완료하세요.',native_session_unverified:'Music 세션을 확인할 수 없습니다. 다시 시도하세요.',native_auth_busy:'로그인을 처리하는 중입니다. 잠시 기다리세요.',native_auth_input_invalid:'로그인 정보 형식이 올바르지 않습니다.',
    native_login_process_start_failed:'네이티브 로그인 프로세스를 시작할 수 없습니다. 진단을 내보내세요.',
    native_login_process_exited:'네이티브 로그인 프로세스가 비정상 종료되었습니다. 진단을 내보내세요.',
    native_login_process_signalled:'네이티브 로그인 프로세스가 중단되었습니다. 진단을 내보내세요.',
    native_login_protocol_failed:'네이티브 로그인 프로세스 통신에 실패했습니다. 진단을 내보내세요.',
    native_login_process_timeout:'네이티브 로그인이 제한 시간 안에 완료되지 않았습니다. 진단을 내보내세요.',
    native_login_store_no_response:'네이티브 로그인이 계정 인증 응답을 받지 못했습니다. 진단을 내보내세요.',
    native_login_store_response_failed:'네이티브 계정 인증에 실패했습니다. 진단을 내보내세요. 암호 오류라고 단정할 수는 없습니다.',
    native_login_store_bridge_failed:'네이티브 계정 인증 구성 요소를 초기화하지 못했습니다. 진단을 내보내세요.',
    native_login_input_invalid:'네이티브 로그인 구성 요소가 이번 입력을 받지 않았습니다. 진단을 내보내세요.',
    native_phone_invalid:'전화번호와 국가 번호를 확인하세요. 기본값은 중국 본토 +86이며 국가 번호가 있는 번호에는 다시 입력하지 마세요.',
    native_login_interaction_timeout:'인증 안내가 만료되었습니다. 다시 로그인하세요.',
    native_login_interaction_unavailable:'인증 상호작용 채널을 사용할 수 없습니다. 다시 로그인하거나 진단을 내보내세요.',
    native_login_interaction_unsupported:'Apple에서 요구한 이 단계는 네이티브 창에서 아직 지원되지 않습니다. 안내를 확인하세요.',
    native_login_internal_error:'네이티브 인증 구성 요소에서 오류가 발생했습니다. 진단을 내보내세요.',
    native_login_token_cache_failed:'계정 인증은 완료되었지만 Music 세션 저장에 실패했습니다. 진단을 내보내세요.',
    native_music_developer_rejected:'카탈로그 권한이 거부되었습니다(401). 기기 인증 코드 오류가 아닙니다. 세션을 다시 확인하거나 진단을 내보내세요.',
    native_music_user_rejected:'Music 사용자 세션이 거부되었습니다(403). 기기 인증 코드 오류를 뜻하지 않습니다. 다시 로그인하거나 진단을 내보내세요.',
    native_music_rate_limited:'Music 요청이 너무 많습니다(429). 잠시 후 세션을 다시 확인하세요.',
    native_music_upstream_failed:'Music 서비스를 지금 사용할 수 없습니다. 잠시 후 다시 시도하세요.',
    native_music_http_failed:'Music 세션 확인 요청이 거부되었습니다. 진단을 내보내세요.',
    native_music_response_invalid:'Music 세션 응답 형식이 올바르지 않습니다. 진단을 내보내세요.',
    native_network_dns_failed:'Music 서비스 주소를 해석할 수 없습니다. 네트워크를 확인한 뒤 다시 시도하세요.',
    native_network_timeout:'Music 세션 확인 시간이 초과되었습니다. 잠시 후 다시 시도하세요.',
    native_tls_certificate_invalid:'Music 연결 인증서 확인에 실패했습니다. 진단을 내보내세요.',
    native_network_connection_failed:'Music 서비스에 연결할 수 없습니다. 네트워크를 확인한 뒤 다시 시도하세요.',
  };
  function failure(error) {
    const message = String(error?.message || '');
    if (message.includes('native_runtime_isolated')) return '현재 리소스 패키지는 오프라인 확인 전용이므로 로그인할 수 없습니다. 네트워크가 활성화된 네이티브 리소스 패키지를 사용하세요.';
    for (const code of Object.keys(errors)) if (message.includes(code)) return errors[code];
    return '로그인을 완료하지 못했습니다. 상태를 확인한 뒤 다시 시도하세요.';
  }
  function controls() {
    $('login-recheck').disabled = pending || ['authenticating','needs_interaction','needs_2fa','checking'].includes(state);
    const codeReady = state === 'needs_2fa';
    $('login-submit').hidden = state !== 'needs_login' && !codeReady;
    $('login-submit').disabled = pending;
    $('login-submit').textContent = codeReady ? '확인' : '로그인';
  }
  function render(value) {
    const previous = state;
    // A stale retired challenge is not a device-code challenge.
    if(value?.factor!=null)value={state:'needs_login',code:'native_login_failed',diagnostics:value.diagnostics};
    state = messages[value?.state] ? value.state : 'runtime_unavailable';
    $('login-status').textContent = ['authenticating','checking'].includes(state)?stageMessages[value?.stage]||messages[state]:messages[state];
    const lastFailure=['needs_login','unverified'].includes(state)?value?.diagnostics?.lastFailure:undefined;
    const currentCode=value?.code;
    // Show the actual boundary failure rather than its generic provider wrapper.
    // An older failure must not replace an error from another stage.
    const leafIsCurrent=lastFailure&&lastFailure.stage===value?.stage&&['native_gsa_provider_unavailable','native_login_failed','native_session_unverified','native_auth_required'].includes(currentCode);
    const errorCode=leafIsCurrent?lastFailure.code:currentCode||lastFailure?.code;
    $('login-error').textContent = errors[errorCode] || '';
    motion?.feedback($('login-error'),$('login-error').textContent);
    const codeReady = state === 'needs_2fa';
    $('account-fields').hidden = state !== 'needs_login'; $('code-field').hidden = !codeReady;
    $('login-email').required = $('login-password').required = state === 'needs_login'; $('login-code').required = codeReady;
    $('two-factor-help').hidden = !codeReady;
    if (!codeReady) $('two-factor-help').open = false;
    if (codeReady && previous !== 'needs_2fa') $('login-code').focus();
    if(previous!==state)motion?.enter(codeReady?$('code-field'):$('account-fields'),'panel');
    controls();
  }
  window.nativeDesktop.onSession(render);
  window.nativeDesktop.getState().then(render).catch(() => render({ state: 'runtime_unavailable' }));
  $('login-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (pending || (state !== 'needs_login' && state !== 'needs_2fa')) return;
    pending = true; $('login-error').textContent = ''; motion?.feedback($('login-error'),''); controls();
    try {
      let next;
      if (state === 'needs_login') {const account=accountInput.read();$('login-email').value=account;accountInput.refresh();next = await window.nativeDesktop.login({ appleEmail: account, applePassword: $('login-password').value });}
      else next = await window.nativeDesktop.submitCode($('login-code').value);
      render(next);
    } catch (error) { $('login-error').textContent = failure(error);motion?.feedback($('login-error'),$('login-error').textContent); }
    finally { $('login-password').value = ''; $('login-code').value = ''; pending = false; controls(); }
  });
  $('login-recheck').addEventListener('click', async () => { if (pending) return; $('login-error').textContent = ''; motion?.feedback($('login-error'),''); try { render(await window.nativeDesktop.recheck()); } catch { render({ state: 'runtime_unavailable' }); } });
  $('login-cancel').addEventListener('click', () => window.nativeDesktop.cancelLogin().catch(() => {}));
  motion?.enter(document.querySelector('.login-content'),'panel');
})();
