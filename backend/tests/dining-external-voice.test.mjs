import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {attachDiningSession} from '../scripts/dining-session.mjs';
class Socket extends EventEmitter{
 readyState=1;bufferedAmount=0;sent=[];
 send(raw){this.sent.push(JSON.parse(raw));}
 close(){if(this.readyState!==1)return;this.readyState=3;this.emit('close');}
 message(m){this.emit('message',Buffer.from(JSON.stringify(m)),false);}
}
const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function fixture(synthesize=async()=>({chunks:['AQACAA==']})){
 const client=new Socket(),upstream=new Socket(),calls=[];
 const voice={config:{provider:'minimax',model:'speech-2.8-hd',voice:'Chinese (Mandarin)_Radio_Host'},synthesize:(text,options)=>{calls.push({text,...options});return synthesize(text,options);}};
 attachDiningSession(client,{credentials:()=>({ak:'fixture',sk:'fixture'}),upstreamFactory:()=>upstream,voice});upstream.emit('open');
 return {client,upstream,calls,close:()=>client.close()};
}
function answer(f,text='你好，可以慢慢看看这间房间。',index='r1',withFinalText=true){
 f.upstream.message({type:'ResponseStartTextStream',index});f.upstream.message({type:'ResponseTextSegment',index,text});f.upstream.message({type:'ResponseEndTextStream',index,...(withFinalText?{text}:{})});
 f.upstream.message({type:'ResponseStartAudioStream',index});f.upstream.message({type:'ResponseAudioSegment',index,audio_segment:'NIA_MUST_NOT_PLAY'});f.upstream.message({type:'AgentEndPlay'});
}
test('external synthesis speaks only completed approved text and replaces all NIA audio',async()=>{
 const f=fixture();try{
 f.client.message({type:'ConfigPipeline',request_id:'cfg'});assert.equal(f.upstream.sent.at(-1).custom_config.tts.enabled,false);
 f.client.message({type:'PostMultimodalGenerate',request_id:'turn1',text:'你好'});answer(f);await settle();
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].text,'你好，可以慢慢看看这间房间。');
 const pcm=f.client.sent.filter(m=>m.type==='ResponseAudioSegment');assert.deepEqual(pcm.map(m=>m.audio_segment),['AQACAA==']);assert.equal(pcm[0].turn_id,'turn1');assert.equal(f.client.sent.at(-1).type,'AgentEndPlay');
 }finally{f.close();}
});
test('opening uses authored script and external TTS without NIA PostSayIt',async()=>{
 const f=fixture();try{f.client.message({type:'SpeakOpening',request_id:'opening',text:'do not use'});await settle();assert.equal(f.calls.length,1);assert.ok(f.calls[0].text.length>20);assert.equal(f.upstream.sent.some(m=>m.type==='PostSayIt'),false);assert.equal(f.client.sent.find(m=>m.source==='opening').turn_id,'opening');}finally{f.close();}
});
test('an interrupted synthesis aborts, never leaks into the next turn, and late old stream indices stay retired',async()=>{
 let finish;const f=fixture(()=>new Promise(resolve=>finish=resolve));try{
 f.client.message({type:'PostMultimodalGenerate',request_id:'old',text:'你好'});answer(f);await settle();
 f.client.message({type:'InterruptAgent'});assert.equal(f.calls[0].signal.aborted,true);
 f.client.message({type:'PostMultimodalGenerate',request_id:'new',text:'还有呢'});const n=f.client.sent.length;
 finish({chunks:['AQACAA==']});answer(f,'过期回答','r1');await settle();assert.equal(f.client.sent.length,n);
 }finally{f.close();}
});
test('failed speech keeps approved text and finishes with a nonfatal warning',async()=>{
 const f=fixture(async()=>{throw Error('upstream credential must never be exposed');});try{f.client.message({type:'PostMultimodalGenerate',request_id:'t',text:'你好'});answer(f);await settle();assert.ok(f.client.sent.some(m=>m.type==='ResponseEndTextStream'));assert.ok(f.client.sent.some(m=>m.type==='TtsWarning'));assert.equal(f.client.sent.at(-1).type,'AgentEndPlay');assert.ok(!JSON.stringify(f.client.sent).includes('credential'));}finally{f.close();}
});
test('provider end events without repeated full text synthesize the accepted segments',async()=>{
 const f=fixture();try{f.client.message({type:'PostMultimodalGenerate',request_id:'t',text:'你好'});answer(f,'你好。','r',false);await settle();assert.equal(f.calls[0].text,'你好。');}finally{f.close();}
});
test('rejected unreleased answer is never synthesized, and configuration errors are visible before a turn',async()=>{
 const f=fixture();try{
 f.upstream.message({type:'Report',level:'error',code:12001});assert.equal(f.client.sent.at(-1).code,12001);
 f.client.message({type:'PostMultimodalGenerate',request_id:'t',text:'缺了谁？'});answer(f,'原磁带里保留了小满。');await settle();assert.equal(f.calls.length,0);assert.ok(!f.client.sent.some(m=>m.text?.includes('小满')));
 }finally{f.close();}
});
