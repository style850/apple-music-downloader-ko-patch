// Modified 2026-11-08 for the Korean/security patch; see docs/PATCH-ATTRIBUTION.ko.md.
'use strict';
// Account formatting is UI-only. Never change passwords or infer a country
// from a bare, ambiguous number; '+' and '00' explicitly mark international.
((root,factory)=>{if(typeof module==='object'&&module.exports)module.exports=factory();else root.nativeAccountInput=factory();})(globalThis,()=>{
 const regions=[
  ['중국 본토','+86',11],['홍콩','+852',8],['마카오','+853',8],['대만','+886',9],
  ['싱가포르','+65',8],['미국 / 캐나다','+1',10],['영국','+44',10],['오스트레일리아','+61',9],
  ['일본','+81',10],['대한민국','+82',10],['인도','+91',10],['독일','+49',0],['프랑스','+33',9],
 ];
 const invalid=()=>{throw Error('native_phone_invalid');};
 function international(value){if(!/^\+[1-9][0-9]{5,14}$/.test(value))return invalid();return value;}
 function normalize(raw,dial='+86'){
  const value=String(raw??'').trim();
  if(!value||value.includes('@'))return value;
  const compact=value.replace(/[\s().-]/g,'');
  if(!/^[+0-9]+$/.test(compact)){if(value.startsWith('+'))return invalid();return value;}
  if(!/^\+?[0-9]+$/.test(compact))return invalid();
  if(compact.startsWith('+'))return international(compact);
  if(compact.startsWith('00'))return international('+'+compact.slice(2));
  if(!/^\+[1-9][0-9]{0,2}$/.test(dial))return invalid();
  const region=regions.find(r=>r[1]===dial),prefix=dial.slice(1);
  // Also accept an unambiguous selected-country prefix without '+' (e.g.
  // 86 + an eleven-digit China mainland number). Do not guess other prefixes.
  if(region?.[2]&&compact.startsWith(prefix)&&compact.length===prefix.length+region[2])return international('+'+compact);
  return international(dial+compact);
 }
 let serial=0;
 function attach(input,{dial='+86',onDialChange=()=>{}}={}){
  const document=input.ownerDocument,id='account-phone-'+(++serial);
  const controls=document.createElement('div');controls.className='account-phone-options';
  const label=document.createElement('label'),caption=document.createElement('span'),select=document.createElement('select');
  caption.textContent='국가/지역 번호';select.setAttribute('aria-label','국가/지역 번호');
  for(const [name,code]of regions){const option=document.createElement('option');option.value=code;option.textContent=name+' '+code;select.append(option);}
  const other=document.createElement('option');other.value='other';other.textContent='기타 국가/지역';select.append(other);
  label.append(caption,select);controls.append(label);
  const customLabel=document.createElement('label'),custom=document.createElement('input'),customCaption=document.createElement('span');
  customCaption.textContent='국가 번호';custom.type='text';custom.inputMode='tel';custom.maxLength=4;custom.placeholder='+49';custom.autocomplete='off';custom.setAttribute('aria-label','기타 국가 번호');customLabel.append(customCaption,custom);controls.append(customLabel);
  const hint=document.createElement('p');hint.id=id;hint.className='account-phone-hint';hint.setAttribute('aria-live','polite');
  const previousDescription=input.getAttribute('aria-describedby');input.setAttribute('aria-describedby',[previousDescription,id].filter(Boolean).join(' '));
  const anchor=input.closest('label')||input;anchor.after(controls,hint);
  const code=()=>select.value==='other'?custom.value.trim():select.value;
  function setDial(value){if(regions.some(r=>r[1]===value))select.value=value;else{select.value='other';custom.value=value;}refresh();}
  function refresh(){
   const raw=input.value.trim(),email=raw.includes('@'),explicit=!email&&/^(\+|00)/.test(raw);
   controls.hidden=email;select.disabled=explicit;custom.disabled=explicit;customLabel.hidden=select.value!=='other';
   if(email){hint.textContent='이메일 주소는 그대로 사용하며 국가 번호가 필요하지 않습니다.';return;}
   try{
    const formatted=normalize(raw,code());
    hint.textContent=explicit?'번호에 국제 국가 번호가 이미 있어 다시 추가하지 않습니다.':raw&&formatted!==raw?formatted+'(으)로 로그인합니다.':'전화번호에는 선택한 국가 번호가 추가됩니다. 기본값은 중국 본토 +86이며 + 국가 번호가 있는 번호는 그대로 사용합니다.';
   }catch{hint.textContent='전화번호와 국가 번호를 확인하세요. 전체 번호는 +86138… 형식으로 입력하며 국가 번호는 한 번만 입력합니다.';}
  }
  const change=()=>{refresh();onDialChange(code());};
  input.addEventListener('input',refresh);select.addEventListener('change',change);custom.addEventListener('input',change);
  setDial(dial);
  return {read:()=>normalize(input.value,code()),dial:code,setDial,refresh,dispose(){
   input.removeEventListener('input',refresh);select.removeEventListener('change',change);custom.removeEventListener('input',change);
   if(previousDescription===null)input.removeAttribute('aria-describedby');else input.setAttribute('aria-describedby',previousDescription);
   controls.remove();hint.remove();
  }};
 }
 return Object.freeze({normalize,attach});
});
