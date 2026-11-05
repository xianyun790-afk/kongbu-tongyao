import test from 'node:test';
import assert from 'node:assert/strict';
import {getDiningVoiceConfig,normalizeDiningWave,synthesizeDiningSpeech} from '../scripts/dining-voice.mjs';

function wave(samples,{rate=16000,channels=1,bits=16,encoding=1,metadata=true}={}){
 const pcm=Buffer.alloc(samples.length*bits/8);
 samples.forEach((value,i)=>{if(bits===16)pcm.writeInt16LE(value,i*2);else if(encoding===3)pcm.writeFloatLE(value,i*4);else pcm[i]=value;});
 const chunk=(id,data)=>{const header=Buffer.alloc(8);header.write(id);header.writeUInt32LE(data.length,4);return Buffer.concat([header,data,...(data.length%2?[Buffer.alloc(1)]:[])]);};
 const format=Buffer.alloc(16);format.writeUInt16LE(encoding);format.writeUInt16LE(channels,2);format.writeUInt32LE(rate,4);format.writeUInt32LE(rate*channels*bits/8,8);format.writeUInt16LE(channels*bits/8,12);format.writeUInt16LE(bits,14);
 const body=Buffer.concat([Buffer.from('WAVE'),chunk('fmt ',format),...(metadata?[chunk('LIST',Buffer.from('odd'))]:[]),chunk('data',pcm),...(metadata?[chunk('AIGC',Buffer.from('source metadata'))]:[])]);
 const header=Buffer.alloc(8);header.write('RIFF');header.writeUInt32LE(body.length,4);return Buffer.concat([header,body]);
}
const config=()=>getDiningVoiceConfig({});
const reply=(bytes,extra={})=>new Response(JSON.stringify({ok:true,audio:{format:'wav',base64:bytes.toString('base64')},...extra}),{headers:{'content-type':'application/json'}});
const abortingFetch=(_url,{signal})=>new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});

test('host voice defaults and server environment remain configurable',()=>{
 const c=config();assert.equal(c.provider,'minimax');assert.equal(c.model,'speech-2.8-hd');assert.equal(c.voice,'Chinese (Mandarin)_Radio_Host');assert.equal(c.enabled,true);assert.equal(c.options.format,'wav');assert.equal(c.options.sampleRate,16000);
 const changed=getDiningVoiceConfig({DINING_TTS_ENABLED:'false',DINING_TTS_BASE_URL:'https://tts.example/relay/',DINING_TTS_VOICE:'alternate',DINING_TTS_SPEED:'99',DINING_TTS_TIMEOUT_MS:'1'});
 assert.equal(changed.enabled,false);assert.equal(changed.baseUrl,'https://tts.example/relay');assert.equal(changed.voice,'alternate');assert.equal(changed.options.speed,2);assert.equal(changed.timeoutMs,1000);
 assert.throws(()=>getDiningVoiceConfig({DINING_TTS_BASE_URL:'https://user:password@example.test'}),{code:'CONFIG'});
});

test('realistic WAV metadata is removed and 16 kHz PCM reaches player unchanged',async()=>{
 const samples=Array.from({length:4000},(_,i)=>Math.round(Math.sin(i*.1)*10000));let body;
 const audio=await synthesizeDiningSpeech('  先比较两段录音。  ',{config:config(),fetchImpl:async(url,request)=>{assert.equal(url,'http://127.0.0.1:3210/api/tts');body=JSON.parse(request.body);return reply(wave(samples));}});
 assert.equal(body.text,'先比较两段录音。');assert.equal(body.voice,'Chinese (Mandarin)_Radio_Host');assert.equal(body.options.outputFormat,'hex');
 const pcm=Buffer.from(audio.base64,'base64');assert.equal(pcm.length,8000);assert.equal(pcm.readInt16LE(200),samples[100]);assert.equal(audio.durationMs,250);assert.equal(audio.sampleRate,16000);assert.equal(audio.channels,1);assert.equal(audio.format,'pcm_s16le');assert.deepEqual(Buffer.concat(audio.chunks.map(value=>Buffer.from(value,'base64'))),pcm);assert.equal(audio.chunks.length,2);
});

test('stereo channels are averaged before playback',()=>{
 const {pcm}=normalizeDiningWave(wave([16000,0,-12000,4000],{channels:2}));
 assert.deepEqual([pcm.readInt16LE(0),pcm.readInt16LE(2)],[8000,-4000]);
});

test('different sample rates produce 16 kHz duration and preserve constant signal',()=>{
 for(const rate of [8000,24000,44100,48000]){
  const {pcm,source}=normalizeDiningWave(wave(Array(rate/10).fill(7000),{rate}));
  assert.equal(pcm.length,3200);assert.equal(source.sampleRate,rate);
  for(let i=0;i<pcm.length;i+=2)assert.ok(Math.abs(pcm.readInt16LE(i)-7000)<=1);
 }
});

test('downsampling filters frequencies beyond target Nyquist limit',()=>{
 const {pcm}=normalizeDiningWave(wave(Array.from({length:4800},(_,i)=>Math.round(Math.sin(2*Math.PI*12000*i/48000)*16000)),{rate:48000}));
 let power=0;for(let i=200;i<pcm.length-200;i+=2)power+=pcm.readInt16LE(i)**2;
 assert.ok(Math.sqrt(power/((pcm.length-400)/2))<100,'12 kHz should not alias into 16 kHz speech');
});

test('invalid, truncated and unsupported audio never becomes PCM',async()=>{
 assert.throws(()=>normalizeDiningWave(Buffer.from('not a wave')),{code:'AUDIO_FORMAT'});
 const truncated=wave([0,1]).subarray(0,-1);assert.throws(()=>normalizeDiningWave(truncated),{code:'AUDIO_FORMAT'});
 const invalidRate=wave([0,1]);invalidRate.writeUInt32LE(12345,28);assert.throws(()=>normalizeDiningWave(invalidRate),{code:'AUDIO_FORMAT'});
 const invalidFloat=wave([NaN],{encoding:3,bits:32});assert.throws(()=>normalizeDiningWave(invalidFloat),{code:'AUDIO_FORMAT'});
 await assert.rejects(synthesizeDiningSpeech('测试',{config:config(),fetchImpl:async()=>new Response(JSON.stringify({ok:true,audio:{format:'mp3',base64:'SUQz'}}))}),{code:'AUDIO_FORMAT'});
 await assert.rejects(synthesizeDiningSpeech('测试',{config:config(),fetchImpl:async()=>new Response(JSON.stringify({ok:true,audio:{format:'wav',base64:'!!!!'}}))}),{code:'AUDIO_FORMAT'});
});

test('text, audio duration and response size are bounded',async()=>{
 let called=false;const fetchImpl=async()=>{called=true;return reply(wave([0]));};
 await assert.rejects(synthesizeDiningSpeech('x'.repeat(1201),{config:config(),fetchImpl}),{code:'TEXT_LIMIT'});assert.equal(called,false);
 assert.throws(()=>normalizeDiningWave(wave(Array(1600).fill(0)),{maxDurationSeconds:.01}),{code:'AUDIO_LIMIT'});
 await assert.rejects(synthesizeDiningSpeech('测试',{config:config(),fetchImpl:async()=>new Response('{}',{headers:{'content-length':'999999999'}})}),{code:'AUDIO_LIMIT'});
 await assert.rejects(synthesizeDiningSpeech('测试',{config:{...config(),maxAudioBytes:3},fetchImpl:async()=>reply(wave([0,1]))}),{code:'AUDIO_LIMIT'});
});

test('disabled speech and upstream failures provide safe text fallback errors',async()=>{
 await assert.rejects(synthesizeDiningSpeech('测试',{config:{...config(),enabled:false}}),{code:'DISABLED'});
 for(const fetchImpl of [async()=>new Response('secret error',{status:500}),async()=>reply(wave([0]),{ok:false}),async()=>{throw new Error('private credentials');},async()=>new Response('broken JSON')]){
  await assert.rejects(synthesizeDiningSpeech('测试',{config:config(),fetchImpl}),error=>{assert.match(error.code,/^(UPSTREAM|NETWORK|RESPONSE)$/);assert.doesNotMatch(error.message,/private|secret|credentials/);return true;});
 }
});

test('cancelling before or during synthesis discards the turn',async()=>{
 const before=new AbortController();before.abort();let called=false;
 await assert.rejects(synthesizeDiningSpeech('测试',{config:config(),signal:before.signal,fetchImpl:()=>{called=true;}}),{name:'AbortError'});assert.equal(called,false);
 const during=new AbortController();const pending=synthesizeDiningSpeech('测试',{config:config(),signal:during.signal,fetchImpl:abortingFetch});during.abort();await assert.rejects(pending,{name:'AbortError'});
});

test('timeout aborts upstream without returning stale audio',async()=>{
 const started=Date.now();await assert.rejects(synthesizeDiningSpeech('测试',{config:{...config(),timeoutMs:15},fetchImpl:abortingFetch}),{code:'TIMEOUT'});assert.ok(Date.now()-started<500);
});
