'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const ui=require('../../src/renderer/native-auth-presentation');
test('authentication failure is readable Korean with original Apple text retained',()=>{
 const q={kind:2,unsupported:0,title:'Check the account information you entered and try again.',message:'',fields:[]};
 const v=ui.view(q);assert.equal(v.title,'Apple 계정 인증 실패');assert.equal(v.message,'입력한 Apple 계정 정보를 확인한 뒤 다시 시도하세요.');assert.equal(v.original,q.title);assert.equal(v.showOriginal,true);assert.match(v.note,/암호 오류라고 단정할 수는 없습니다/);
 assert.equal(ui.button(q,{id:'1',role:3,label:'Cancel'}),'로그인 취소');
 assert.equal(ui.button(q,{id:'2',role:4,label:'Retry'}),'다시 입력');
 assert.equal(ui.field({type:7,label:'Email'}),'Apple 계정');
 assert.equal(ui.field({type:2,label:'Password'}),'암호');
});
test('unknown Apple instructions are never guessed, hidden or used as action IDs',()=>{
 const q={kind:3,unsupported:0,title:'Unrecognized account notice',message:'<b>PRIVATE_NOTICE</b>',fields:[]};
 const v=ui.view(q);assert.match(v.message,/Unrecognized account notice/);assert.match(v.message,/<b>PRIVATE_NOTICE<\/b>/);assert.equal(v.showOriginal,false);assert.equal(v.title,'Apple 계정 인증');
 const b={id:'18446744073709551615',role:4,label:'Retry'};ui.button(q,b);assert.equal(b.id,'18446744073709551615');assert.equal(b.label,'Retry');
 assert.equal(ui.view({...q,kind:6,unsupported:2}).unsupported,true);
});
