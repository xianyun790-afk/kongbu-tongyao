import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const transpile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const pcm='data:text/javascript;base64,'+Buffer.from(transpile(await readFile(new URL('../src/lib/pcm-audio.ts',import.meta.url),'utf8'))).toString('base64');
const source=transpile(await readFile(new URL('../src/lib/local-speech.ts',import.meta.url),'utf8')).replace("'./pcm-audio'",JSON.stringify(pcm));
const {LocalSpeechSession}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};}
function setup(t,{transcript='我想核对广播的来源',pendingResult=false,pendingPermission=false}={}){
 const names=['fetch','navigator','AudioContext','AudioWorkletNode'],previous=names.map(n=>Object.getOwnPropertyDescriptor(globalThis,n));
 const track={stopped:false,stop(){this.stopped=true;}},stream={getTracks:()=>[track]},states=[],errors=[],final=[],requests=[],permission=deferred(),result=deferred();let worklet,context;
 class Node{constructor(){this.port={onmessage:null};}connect(node){return node;}disconnect(){}}
 class Context{constructor(){context=this;this.sampleRate=16000;this.audioWorklet={addModule:async()=>{}};this.destination={};}async resume(){}async close(){this.closed=true;}createGain(){const n=new Node();n.gain={value:1};return n;}createMediaStreamSource(){return new Node();}}
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>pendingPermission?permission.promise:stream}}});
 globalThis.AudioContext=Context;globalThis.AudioWorkletNode=class extends Node{constructor(){super();worklet=this;}};
 globalThis.fetch=async(url,options)=>{requests.push({url,options});if(url==='/api/voice/status')return {ok:true,json:async()=>({ready:true})};return pendingResult?result.promise:{ok:true,json:async()=>({text:transcript})};};
 const speech=new LocalSpeechSession({onState:s=>states.push(s),onLevel:()=>{},onFinal:s=>final.push(s),onError:s=>errors.push(s)});
 t.after(()=>{speech.stop();names.forEach((n,i)=>previous[i]?Object.defineProperty(globalThis,n,previous[i]):delete globalThis[n]);});
 return{speech,states,errors,final,requests,track,stream,permission,result,get context(){return context;},voice(){worklet.port.onmessage({data:new Float32Array(4096).fill(.04)});}};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('manual finish transcribes voiced PCM once and releases the microphone before the result',async t=>{
 const c=setup(t);await c.speech.start();c.voice();c.speech.finish();c.speech.finish();await tick();
 assert.deepEqual(c.final,['我想核对广播的来源']);assert.equal(c.track.stopped,true);assert.equal(c.context.closed,true);
 const posts=c.requests.filter(r=>r.url==='/api/transcribe');assert.equal(posts.length,1);assert.ok(posts[0].options.body.byteLength>44);assert.equal(c.states.at(-1),'idle');assert.deepEqual(c.errors,[]);
});
test('cancel during transcription discards a late result',async t=>{
 const c=setup(t,{pendingResult:true});await c.speech.start();c.voice();c.speech.finish();assert.equal(c.states.at(-1),'transcribing');
 c.speech.stop();c.result.resolve({ok:true,json:async()=>({text:'不应进入草稿'})});await tick();assert.deepEqual(c.final,[]);assert.equal(c.track.stopped,true);
 assert.equal(c.requests.at(-1).options.signal.aborted,true);
});
test('cancel before microphone permission resolves closes the late stream without submitting',async t=>{
 const c=setup(t,{pendingPermission:true});const starting=c.speech.start();await tick();c.speech.stop();c.permission.resolve(c.stream);await starting;
 assert.equal(c.track.stopped,true);assert.deepEqual(c.final,[]);assert.equal(c.requests.length,1);assert.equal(c.context,undefined);
});
test('finishing an empty recording reports an error and keeps speech out of the draft',async t=>{
 const c=setup(t);await c.speech.start();c.speech.finish();await tick();assert.match(c.errors[0],/没有听清/);assert.deepEqual(c.final,[]);assert.equal(c.track.stopped,true);assert.equal(c.requests.length,1);
});
