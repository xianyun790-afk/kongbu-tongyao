import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=ts.transpileModule(await readFile(new URL('../src/lib/browser-speech.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {BrowserSpeechSession}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function fixture(t,{supported=true,secure=true}={}){
 const original=Object.getOwnPropertyDescriptor(globalThis,'window'),states=[],errors=[],final=[];let latest;
 class Recognition{
  constructor(){latest=this;this.aborted=false;this.stopped=false;}
  start(){this.onstart?.();}stop(){this.stopped=true;}abort(){this.aborted=true;}
  result(text){this.onresult?.({resultIndex:0,results:[{isFinal:true,0:{transcript:text}}]});}
 }
 Object.defineProperty(globalThis,'window',{configurable:true,value:{isSecureContext:secure,...(supported?{SpeechRecognition:Recognition}:{})}});
 const speech=new BrowserSpeechSession({onState:s=>states.push(s),onLevel:()=>{},onFinal:s=>final.push(s),onError:s=>errors.push(s)});
 t.after(()=>{speech.stop();if(original)Object.defineProperty(globalThis,'window',original);else delete globalThis.window;});
 return{speech,states,errors,final,recognition:()=>latest};
}
test('browser dictation yields Chinese text and releases its recognition session',async t=>{
 const f=fixture(t);await f.speech.start();assert.equal(f.states.at(-1),'listening');assert.equal(f.recognition().lang,'zh-CN');
 f.recognition().result('我想核对广播');f.speech.finish();assert.equal(f.states.at(-1),'transcribing');f.recognition().onend();
 assert.deepEqual(f.final,['我想核对广播']);assert.equal(f.states.at(-1),'idle');assert.equal(f.recognition().aborted,true);
});
test('cancelled browser recognition cannot submit late text to a new turn',async t=>{
 const f=fixture(t);await f.speech.start();const stale=f.recognition(),lateResult=stale.onresult,lateEnd=stale.onend;f.speech.stop();await f.speech.start();
 lateResult({resultIndex:0,results:[{isFinal:true,0:{transcript:'过期问题'}}]});lateEnd();assert.deepEqual(f.final,[]);assert.equal(f.states.at(-1),'listening');
});
test('unsupported browsers keep typed input available and never claim to listen',async t=>{
 const f=fixture(t,{supported:false});await f.speech.start();assert.match(f.errors[0],/不支持语音转文字/);assert.equal(f.states.includes('listening'),false);assert.deepEqual(f.final,[]);
});
test('permission and network failures end recognition without publishing text',async t=>{
 const f=fixture(t);await f.speech.start();f.recognition().onerror({error:'not-allowed'});assert.match(f.errors.at(-1),/权限/);assert.equal(f.states.at(-1),'idle');
 await f.speech.start();f.recognition().onerror({error:'network'});assert.match(f.errors.at(-1),/网络/);assert.deepEqual(f.final,[]);
});
test('an empty result reports retryable failure',async t=>{
 const f=fixture(t);await f.speech.start();f.recognition().onend();assert.match(f.errors[0],/没有识别到/);assert.deepEqual(f.final,[]);
});
