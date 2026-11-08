// Modified 2026-11-08 for the Korean/security patch; see docs/PATCH-ATTRIBUTION.ko.md.
'use strict';
// Display-only translations. Never use labels/text to choose SDK actions.
((root,factory)=>{if(typeof module==='object'&&module.exports)module.exports=factory();else root.nativeAuthPresentation=factory();})(globalThis,()=>{
 const normalized=s=>String(s||'').trim().replace(/\s+/g,' ').toLowerCase();
 const translations=new Map([
  ['check the account information you entered and try again.','입력한 Apple 계정 정보를 확인한 뒤 다시 시도하세요.'],
  ['check the account information you entered and try again','입력한 Apple 계정 정보를 확인한 뒤 다시 시도하세요.'],
  ['sign in','Apple 계정 로그인'],['sign in to apple music','Apple Music 로그인'],
  ['use existing apple id','기존 Apple 계정 사용'],['use existing apple account','기존 Apple 계정 사용'],
  ['use existing account','기존 계정 사용'],['create new apple id','새 Apple 계정 생성'],
  ['create new apple account','새 Apple 계정 생성'],['verification code','인증 코드'],
 ]);
 const translate=s=>translations.get(normalized(s))||s||'';
 function button(q,b){
  if(b.role===3)return '로그인 취소';
  if(b.role===4)return '다시 입력';
  if(b.role===2)return q.kind===5?'확인':'계속';
  return translate(b.label)||'계속';
 }
 function field(f){return ({2:'암호',3:'Apple 계정',5:'인증 코드',7:'Apple 계정'})[f.type]||translate(f.label)||'입력';}
 function view(q){
  const unsupported=q.kind===6||q.unsupported!==0||q.fields.some(f=>f.type===6);
  const title=unsupported?'이 인증 단계는 아직 지원되지 않습니다':({1:'로그인 방식 선택',2:'Apple 계정 인증 실패',3:'Apple 계정 인증',4:'계정 정보 확인',5:'기기 인증 코드 입력'})[q.kind]||'Apple 계정 인증';
  const source=[q.title,q.message].filter(Boolean),message=source.map(translate).filter((v,i,a)=>v&&a.indexOf(v)===i).join('\n');
  const note=unsupported?'이 단계는 네이티브 창에서 완료할 수 없습니다. 링크를 자동으로 열거나 다른 작업을 실행하지 않습니다.':q.kind===2?'Apple에서 이번 인증을 거부했습니다. 이 안내만으로 암호 오류라고 단정할 수는 없습니다.':q.kind===5?'신뢰할 수 있는 기기에서 이번 로그인을 승인하고 받은 6자리 코드를 입력하세요.':q.textTruncated?'안내가 너무 길어 일부만 표시합니다.':'';
  return {title,message,note,unsupported,original:source.join('\n'),showOriginal:source.some(s=>translate(s)!==s)};
 }
 return Object.freeze({view,button,field});
});
