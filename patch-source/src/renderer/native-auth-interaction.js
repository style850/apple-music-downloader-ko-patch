// Modified 2026-11-08 for the Korean/security patch; see docs/PATCH-ATTRIBUTION.ko.md.
'use strict';
(() => {
 const $=id=>document.getElementById(id);
 const presentation=window.nativeAuthPresentation;
 const accountInputs=new Map();
 let current=null,busy=false,polling=false,expiresAt=0,disposed=false,lastAnswered='';
 const key=q=>q?[q.scope,q.attemptId,q.requestId].join(':'):'';
 function clear(){
  for(const controller of accountInputs.values())controller.dispose();accountInputs.clear();
  for(const input of $('interaction-fields').querySelectorAll('input'))input.value='';
  for(const name of ['fields','buttons'])$('interaction-'+name).replaceChildren();
  for(const name of ['title','message','note','error','expiry','original-text'])$('interaction-'+name).textContent='';
  $('interaction-original').hidden=true;$('interaction-original').open=false;
  document.body.classList.remove('has-auth-interaction');
  $('auth-interaction').hidden=true;$('login-form').hidden=false;current=null;
 }
 async function respond(button,disposition=1){
  const q=current;if(!q||busy)return;
  if(Date.now()>=expiresAt){$('interaction-error').textContent='이 안내가 만료되었습니다. 다시 로그인하세요.';return;}
  const values=[];
  if(disposition===1&&button.role!==3)for(const f of q.fields){
   const input=$('interaction-fields').querySelector('[data-field-id="'+f.id+'"]'),raw=input?.value||'';
   let value=raw;
   try{if(accountInputs.has(f.id))value=accountInputs.get(f.id).read();}
   catch{$('interaction-error').textContent='전화번호와 국가 번호를 확인하세요. + 국가 번호가 있는 번호에는 다시 추가하지 않습니다.';input?.focus();return;}
   const size=new TextEncoder().encode(value).length;
   if((f.required&&!value)||size<f.minBytes||size>f.maxBytes||(f.digitsOnly&&!/^[0-9]*$/.test(value))){$('interaction-error').textContent='입력란 요구사항에 맞게 작성하세요.';input?.focus();return;}
   values.push({fieldId:f.id,value});
  }
  busy=true;for(const b of $('interaction-buttons').querySelectorAll('button'))b.disabled=true;
  try{
   await window.nativeDesktop.answerInteraction({protocolVersion:1,scope:q.scope,attemptId:q.attemptId,requestId:q.requestId,disposition,...(disposition===1?{buttonId:button.id}:{}),values});
   // A retry must keep the explicitly corrected account, never restore the
   // stale initial account. Passwords/codes are not retained or re-submitted.
   if(q.kind===4&&disposition===1&&button.role!==3){const f=q.fields.find(f=>[3,7].includes(f.type));const v=values.find(v=>v.fieldId===f?.id);if(v){$('login-email').value=v.value;window.nativeLoginAccount?.refresh();}}
   lastAnswered=key(q);if(key(current)===key(q)){clear();$('login-status').textContent='인증을 계속하는 중…';}
  }catch{$('interaction-error').textContent='이 안내는 만료되었거나 이미 처리되었을 수 있습니다. 최신 안내를 기다리거나 다시 로그인하세요.';}
  finally{for(const v of values)v.value='';busy=false;for(const b of $('interaction-buttons').querySelectorAll('button'))b.disabled=b.dataset.unavailable==='true';}
 }
 function show(q){
  if(!q||key(q)===lastAnswered){if(current)clear();return;}
  expiresAt=Date.now()+q.expiresAfterMs;
  if(key(current)===key(q))return;
  clear();current=q;document.body.classList.add('has-auth-interaction');$('auth-interaction').hidden=false;$('login-form').hidden=true;$('two-factor-help').hidden=true;
  const view=presentation.view(q),unsupported=view.unsupported;
  $('interaction-title').textContent=view.title;$('interaction-message').textContent=view.message;$('interaction-note').textContent=view.note;
  $('interaction-original').hidden=!view.showOriginal;$('interaction-original-text').textContent=view.original;
  if(!unsupported){
   for(const f of q.fields){
    const label=document.createElement('label'),caption=document.createElement('span'),input=document.createElement('input');
    caption.textContent=presentation.field(f);input.dataset.fieldId=f.id;input.type=f.type===2?'password':'text';input.autocomplete=f.type===5?'one-time-code':'off';
    if(f.digitsOnly||f.type===5)input.inputMode='numeric';input.maxLength=f.maxBytes;input.required=f.required;
    if(f.type===7||f.type===3)input.value=$('login-email').value.trim();
    label.append(caption,input);$('interaction-fields').append(label);
    if([3,7].includes(f.type))accountInputs.set(f.id,window.nativeAccountInput.attach(input,{dial:window.nativeLoginAccount?.dial()||'+86',onDialChange:value=>window.nativeLoginAccount?.setDial(value)}));
   }
   for(const b of q.buttons){
    const el=document.createElement('button');el.type='button';el.textContent=presentation.button(q,b);el.disabled=!b.enabled||b.unsupported!==0;el.dataset.unavailable=String(el.disabled);
    if(b.role===2||b.role===4)el.className='primary';el.addEventListener('click',()=>respond(b));$('interaction-buttons').append(el);
   }
  }
  if(unsupported||!q.buttons.some(b=>b.role===3&&b.enabled&&b.unsupported===0)){const cancel=document.createElement('button');cancel.type='button';cancel.textContent=unsupported?'안내 닫기':'로그인 취소';cancel.addEventListener('click',()=>respond(null,unsupported?3:2));$('interaction-buttons').append(cancel);}
  $('interaction-fields').querySelector('input')?.focus();
 }
 async function poll(){
  if(polling||disposed)return;polling=true;
  try{const q=await window.nativeDesktop.getInteraction();if(!disposed)show(q);}
  catch{if(current)$('interaction-error').textContent='인증 안내를 읽을 수 없습니다. 잠시 후 다시 시도하거나 다시 로그인하세요.';}
  finally{polling=false;}
 }
 $('interaction-form').addEventListener('submit',event=>{event.preventDefault();const b=current?.buttons.find(b=>b.enabled&&b.unsupported===0&&[2,4].includes(b.role));if(b)void respond(b);});
 const timer=setInterval(()=>{void poll();if(current)$('interaction-expiry').textContent=Math.max(0,Math.ceil((expiresAt-Date.now())/1000))+'초 안에 완료하세요';},500);
 window.addEventListener('beforeunload',()=>{disposed=true;clearInterval(timer);clear();});
 void poll();
})();
