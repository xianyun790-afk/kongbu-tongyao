import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {createDiningPublicServer} from '../scripts/dining-public-server.mjs';

const TOKEN='fixture-demo-invite-32-characters-long';
const ORIGIN='https://xianyun790-afk.github.io';
const turn={type:'PostMultimodalGenerate',text:'这两份材料有什么不同？'};
async function fixture(t,overrides={}){
 const forwarded=[],attached=[],clients=[];
 const voice={config:{provider:'fixture-tts',model:'fixture-model',voice:'fixture-voice',baseUrl:'http://10.0.0.8:3210'},synthesize:async()=>{throw Error('Not called by relay');}};
 const attach=(session,deps)=>{
  attached.push({session,deps});session.send(JSON.stringify({type:'TransportReady'}));
  session.on('message',raw=>{const value=JSON.parse(raw.toString());forwarded.push(value);session.send(JSON.stringify({type:'FixtureAccepted',original:value.type}));});
 };
 const server=createDiningPublicServer({env:{},demoToken:TOKEN,credentials:()=>({ak:'server-only-ak',sk:'server-only-sk'}),voice,attach,...overrides});
 assert.equal(server.listening,false);server.listen(0,'127.0.0.1');await once(server,'listening');
 const base=`http://127.0.0.1:${server.address().port}`,wsBase=base.replace('http:','ws:');
 t.after(async()=>{
  const pending=clients.filter(client=>client.readyState!==WebSocket.CLOSED).map(client=>{const closed=once(client,'close').catch(()=>{});client.terminate();return closed;});
  await Promise.all(pending);await new Promise(resolve=>server.close(resolve));
 });
 function socket(path='/api/nia/dining-session?token='+encodeURIComponent(TOKEN),origin=ORIGIN,headers={}){
  const client=new WebSocket(wsBase+path,{origin,headers});client.on('error',()=>{});clients.push(client);return client;
 }
 async function connect(options={}){
  const client=socket(options.path,options.origin??ORIGIN,options.headers),received=[];
  client.on('message',raw=>received.push(JSON.parse(raw.toString())));
  const ready=once(client,'message');await once(client,'open');await ready;return {client,received};
 }
 async function reject(path,origin=ORIGIN,headers={}){
  const client=socket(path,origin,headers);
  const status=await new Promise((resolve,reject)=>{
   client.once('unexpected-response',(_req,res)=>{const code=res.statusCode;res.resume();client.terminate();resolve(code);});
   client.once('open',()=>reject(Error('Unexpected accepted connection')));
  });
  return status;
 }
 async function send(client,message){const response=once(client,'message');client.send(JSON.stringify(message));return JSON.parse((await response)[0].toString());}
 async function close(client){if(client.readyState===WebSocket.CLOSED)return;const closed=once(client,'close');client.close();await closed;}
 return {server,base,voice,forwarded,attached,connect,reject,send,close};
}

test('public relay is inert on import and refuses a missing or short invite secret',()=>{
 for(const token of ['',undefined,'short'])assert.throws(()=>createDiningPublicServer({env:{},demoToken:token}),/DINING_DEMO_TOKEN/);
 assert.throws(()=>createDiningPublicServer({env:{},demoToken:TOKEN,allowedOrigins:['*']}),/origin/);
 assert.throws(()=>createDiningPublicServer({env:{},demoToken:TOKEN,allowedOrigins:['https://allowed.example/path']}),/exact/);
});

test('HTTP surface exposes only health and status, with exact-origin CORS and narrow preflight',async t=>{
 const f=await fixture(t);
 const status=await fetch(f.base+'/api/nia/status',{headers:{Origin:ORIGIN}});
 assert.equal(status.status,200);assert.equal(status.headers.get('access-control-allow-origin'),ORIGIN);assert.equal(status.headers.get('cache-control'),'no-store');assert.equal(status.headers.get('vary'),'Origin');
 const body=await status.text(),info=JSON.parse(body);
 assert.equal(info.configured,true);assert.equal(info.dining_loop,true);assert.equal(info.auth_required,true);assert.equal(info.voice_id,'fixture-voice');
 for(const secret of [TOKEN,'server-only-ak','server-only-sk','10.0.0.8','3210'])assert.ok(!body.includes(secret));
 const health=await fetch(f.base+'/health');assert.deepEqual(await health.json(),{ok:true,service:'dining-public-dm'});
 const blocked=await fetch(f.base+'/api/nia/status',{headers:{Origin:'https://evil.example'}});assert.equal(blocked.status,403);assert.equal(blocked.headers.get('access-control-allow-origin'),null);
 for(const route of ['/api/tts','/api/nia/session','/api/voice/tts','/'])assert.equal((await fetch(f.base+route)).status,404);
 assert.equal((await fetch(f.base+'/api/nia/status',{method:'POST'})).status,405);
 const options=await fetch(f.base+'/api/nia/status',{method:'OPTIONS',headers:{Origin:ORIGIN,'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'content-type'}});
 assert.equal(options.status,204);assert.equal(options.headers.get('access-control-allow-methods'),'GET, OPTIONS');
 assert.equal((await fetch(f.base+'/api/nia/status',{method:'OPTIONS',headers:{Origin:ORIGIN,'Access-Control-Request-Method':'POST'}})).status,403);
 assert.equal((await fetch(f.base+'/api/nia/status',{method:'OPTIONS',headers:{Origin:ORIGIN,'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'Authorization'}})).status,403);
});

test('WS authenticates invite and origin before attachment, rejects generic or TTS paths',async t=>{
 const f=await fixture(t);
 assert.equal(await f.reject('/api/nia/session?token='+TOKEN),404);
 assert.equal(await f.reject('/api/tts?token='+TOKEN),404);
 assert.equal(await f.reject('/api/nia/dining-session'),401);
 assert.equal(await f.reject('/api/nia/dining-session?token=wrong'),401);
 assert.equal(await f.reject('/api/nia/dining-session?token='+TOKEN+'&token='+TOKEN),401);
 assert.equal(await f.reject('/api/nia/dining-session?token='+TOKEN,'https://evil.example'),403);
 assert.equal(f.attached.length,0);
 const {client}=await f.connect();assert.equal(f.attached.length,1);assert.equal(f.attached[0].deps.voice,f.voice);
 assert.equal((await f.send(client,turn)).type,'FixtureAccepted');assert.deepEqual(f.forwarded,[turn]);
});

test('unconfigured credentials fail closed without starting a model connection',async t=>{
 const f=await fixture(t,{credentials:()=>({ak:'',sk:''})});
 assert.equal((await(await fetch(f.base+'/api/nia/status')).json()).configured,false);
 assert.equal(await f.reject('/api/nia/dining-session?token='+TOKEN),503);assert.equal(f.attached.length,0);
});

test('generic speech, binary audio and invalid generation are rejected before reaching the session',async t=>{
 const f=await fixture(t,{limits:{clients:8,clientsPerIp:8}});
 for(const message of [{type:'PostSayIt',text:'arbitrary text'},{type:'InputBuffer',audio_segment:'AAAA'},{type:'PostMultimodalGenerate',text:' '},{type:'PostMultimodalGenerate',text:'字'.repeat(1201)},{type:'SetSystemPrompt',system_prompt:'other story'}]){
  const {client}=await f.connect(),closed=once(client,'close');const error=await f.send(client,message);assert.equal(error.type,'LocalError');await closed;
 }
 const {client}=await f.connect(),reply=once(client,'message'),closed=once(client,'close');client.send(Buffer.from([1,2,3]));assert.equal(JSON.parse((await reply)[0].toString()).type,'LocalError');await closed;
 assert.deepEqual(f.forwarded,[]);
});

test('setup cannot be repeated to create unmetered sessions and message flooding is bounded',async t=>{
 const f=await fixture(t,{limits:{messagesPerMinute:3}}),{client}=await f.connect();
 assert.equal((await f.send(client,{type:'CreateSession'})).type,'FixtureAccepted');
 const closed=once(client,'close');assert.equal((await f.send(client,{type:'CreateSession'})).type,'LocalError');await closed;
 assert.deepEqual(f.forwarded,[{type:'CreateSession'}]);
 const second=await f.connect();
 for(let i=0;i<3;i++)assert.equal((await f.send(second.client,{type:'Pong'})).type,'FixtureAccepted');
 const ended=once(second.client,'close');assert.equal((await f.send(second.client,{type:'Pong'})).type,'LocalError');await ended;
});

test('per-IP and global concurrent client caps release their slots on disconnect',async t=>{
 const f=await fixture(t,{trustProxy:true,limits:{clients:2,clientsPerIp:1}});
 const one=await f.connect({headers:{'X-Forwarded-For':'203.0.113.1'}});
 assert.equal(await f.reject('/api/nia/dining-session?token='+TOKEN,ORIGIN,{'X-Forwarded-For':'203.0.113.1'}),429);
 const two=await f.connect({headers:{'X-Forwarded-For':'203.0.113.2'}});
 assert.equal(await f.reject('/api/nia/dining-session?token='+TOKEN,ORIGIN,{'X-Forwarded-For':'203.0.113.3'}),429);
 await f.close(one.client);const replacement=await f.connect({headers:{'X-Forwarded-For':'203.0.113.1'}});assert.ok(replacement.client.readyState===WebSocket.OPEN);await f.close(two.client);
});

test('global minute and day turn budgets survive client reconnects and reset only at the appropriate window',async t=>{
 let clock=100;const f=await fixture(t,{now:()=>clock,limits:{turnsPerMinute:1,turnsPerDay:2,ipConnectionsPerMinute:30}});
 const one=await f.connect();assert.equal((await f.send(one.client,turn)).type,'FixtureAccepted');await f.close(one.client);
 const two=await f.connect(),closed=once(two.client,'close');assert.equal((await f.send(two.client,{type:'SpeakOpening'})).type,'LocalError');await closed;
 clock+=60000;const three=await f.connect();assert.equal((await f.send(three.client,{type:'SpeakOpening'})).type,'FixtureAccepted');await f.close(three.client);
 clock+=60000;const four=await f.connect(),ended=once(four.client,'close');assert.equal((await f.send(four.client,turn)).type,'LocalError');await ended;
 clock=86400100;const nextDay=await f.connect();assert.equal((await f.send(nextDay.client,turn)).type,'FixtureAccepted');assert.equal(f.forwarded.filter(m=>['PostMultimodalGenerate','SpeakOpening'].includes(m.type)).length,3);
});

test('IP budgets cannot be bypassed by supplying a fake first forwarded hop',async t=>{
 const f=await fixture(t,{trustProxy:true,limits:{ipTurnsPerMinute:1}});
 const first=await f.connect({headers:{'X-Forwarded-For':'198.51.100.9, 203.0.113.1'}});assert.equal((await f.send(first.client,turn)).type,'FixtureAccepted');await f.close(first.client);
 const second=await f.connect({headers:{'X-Forwarded-For':'198.51.100.10, 203.0.113.1'}}),closed=once(second.client,'close');assert.equal((await f.send(second.client,turn)).type,'LocalError');await closed;
});

test('per-client budget is enforced even when global and IP budgets remain available',async t=>{
 const f=await fixture(t,{limits:{clientTurnsPerMinute:1}}),{client}=await f.connect();
 assert.equal((await f.send(client,turn)).type,'FixtureAccepted');const ended=once(client,'close');assert.equal((await f.send(client,turn)).type,'LocalError');await ended;assert.equal(f.forwarded.length,1);
});

test('handshake rate caps and bounded IP tracking avoid unbounded reconnect state',async t=>{
 const f=await fixture(t,{trustProxy:true,limits:{ipConnectionsPerMinute:1,connectionsPerMinute:2,maxTrackedIps:2}});
 const one=await f.connect({headers:{'X-Forwarded-For':'203.0.113.1'}});await f.close(one.client);
 assert.equal(await f.reject('/api/nia/dining-session?token='+TOKEN,ORIGIN,{'X-Forwarded-For':'203.0.113.1'}),429);
 const two=await f.connect({headers:{'X-Forwarded-For':'203.0.113.2'}});await f.close(two.client);
 assert.equal(await f.reject('/api/nia/dining-session?token='+TOKEN,ORIGIN,{'X-Forwarded-For':'203.0.113.3'}),429);
 assert.equal(f.attached.length,2);
});

test('forwarded IP headers are ignored unless trusted-proxy mode is explicitly enabled',async t=>{
 const f=await fixture(t,{limits:{clientsPerIp:1}}),first=await f.connect({headers:{'X-Forwarded-For':'203.0.113.1'}});
 assert.equal(await f.reject('/api/nia/dining-session?token='+TOKEN,ORIGIN,{'X-Forwarded-For':'203.0.113.2'}),429);await f.close(first.client);
});

test('session duration and idle timeouts close the connection, and Pong does not reset idle',async t=>{
 const idle=await fixture(t,{limits:{idleMs:60,durationMs:1000}}),one=await idle.connect(),firstClosed=once(one.client,'close');
 const ping=setInterval(()=>{if(one.client.readyState===WebSocket.OPEN)one.client.send(JSON.stringify({type:'Pong'}));},15);
 await firstClosed;clearInterval(ping);assert.ok(one.received.some(m=>m.type==='LocalError'&&/空闲/.test(m.message)));
 const duration=await fixture(t,{limits:{idleMs:1000,durationMs:60}}),two=await duration.connect();await once(two.client,'close');assert.ok(two.received.some(m=>m.type==='LocalError'&&/时限/.test(m.message)));
});
