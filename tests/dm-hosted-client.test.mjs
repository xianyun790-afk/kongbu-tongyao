import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {normalizeDmApiBase,dmEndpoints} from '../src/dining-loop/dm-endpoint.ts';
const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/dining-loop/dm-service.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env.VITE_DM_API_BASE':'""','import.meta.env.BASE_URL':'"/kongbu-tongyao/"'}});
const {DiningDmSession}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const original={fetch:globalThis.fetch,WebSocket:globalThis.WebSocket};let sessions=[];
afterEach(()=>{sessions.forEach(s=>s.stop());sessions=[];Object.assign(globalThis,original);});
function fixture({configured=true,apiBase='https://dm.example.test',authRequired=false,inviteToken=''}={}){
 const sent=[],replies=[],states=[],errors=[],warnings=[],urls=[];
 const audio={packets:[],async open(){},push(v){this.packets.push(v);return 4;},async drain(){},clear(){this.packets=[];},setMuted(){},close(){}};
 class Socket extends EventTarget{
  static OPEN=1;readyState=1;
  constructor(url){super();urls.push(url);Socket.last=this;queueMicrotask(()=>this.emit({type:'TransportReady'}));}
  emit(m){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(m)}));}
  send(raw){const m=JSON.parse(raw);sent.push(m);const responses={CreateSession:{type:'CreateSessionResult',success:true},ConfigPipeline:{type:'ConfigUpdated'},StartServing:{type:'AudioAccepting'}};if(responses[m.type])queueMicrotask(()=>this.emit({...responses[m.type],respond_to:m.request_id}));}
  close(){this.readyState=3;this.dispatchEvent(new Event('close'));}
 }
 globalThis.WebSocket=Socket;globalThis.fetch=async(url,options)=>{urls.push(url);assert.equal(options.credentials,'omit');return{ok:true,json:async()=>({configured,dining_loop:true,auth_required:authRequired})};};
 const session=new DiningDmSession({onState:s=>states.push(s),onReply:(text,complete,source)=>replies.push({text,complete,source}),onError:e=>errors.push(e),onWarning:e=>warnings.push(e)},{audio,apiBase,inviteToken});sessions.push(session);
 return{session,sent,replies,states,errors,warnings,urls,audio,socket:()=>Socket.last,turn:()=>sent.findLast(m=>m.type==='PostMultimodalGenerate')?.request_id};
}
async function settle(){for(let n=0;n<30;n++)await Promise.resolve();}
function reply(f,text,turn=f.turn()){
 f.socket().emit({type:'ResponseStartTextStream',index:'reply',turn_id:turn});f.socket().emit({type:'ResponseTextSegment',index:'reply',text,turn_id:turn});f.socket().emit({type:'ResponseEndTextStream',index:'reply',text,complete:true,turn_id:turn});f.socket().emit({type:'AgentEndPlay',turn_id:turn});
}
test('host configuration rejects mixed-content or credential-bearing URLs',()=>{
 for(const bad of [undefined,'','http://10.0.0.8:3210','https://user:secret@dm.test','https://dm.test?q=secret','https://dm.test/#x','not a URL'])assert.equal(normalizeDmApiBase(bad),'');
 assert.equal(normalizeDmApiBase(' https://dm.test/relay/ '),'https://dm.test/relay');assert.deepEqual(dmEndpoints('https://dm.test/relay'),{status:'https://dm.test/relay/api/nia/status',session:'wss://dm.test/relay/api/nia/dining-session'});
});
test('unconfigured hosted builds never request an API or invent a reply',async()=>{
 const f=fixture({apiBase:''});await assert.rejects(f.session.sendText('你好'),/尚未配置 HTTPS/);assert.deepEqual(f.urls,[]);assert.deepEqual(f.replies,[]);assert.equal(f.states.at(-1),'error');
});
test('configured hosted client checks readiness and uses HTTPS plus WSS',async()=>{
 const f=fixture();const asking=f.session.sendText('你好');await settle();assert.deepEqual(f.urls,['https://dm.example.test/api/nia/status','wss://dm.example.test/api/nia/dining-session']);reply(f,'你好，先随意看看这个房间。');await asking;assert.equal(f.replies.at(-1).source,'ai');assert.equal(f.states.at(-1),'idle');
});
test('server not ready gives an actionable failure with no false AI text',async()=>{
 const f=fixture({configured:false});await assert.rejects(f.session.sendText('你好'),/未配置/);assert.equal(f.urls.length,1);assert.deepEqual(f.replies,[]);assert.equal(f.errors.length,1);
});
test('an invitation-only relay explains a missing connection code without opening WSS',async()=>{
 const f=fixture({authRequired:true});await assert.rejects(f.session.sendText('你好'),/邀请链接中的连接码/);assert.equal(f.urls.length,1);assert.deepEqual(f.replies,[]);
});
test('missing invite remains actionable even while the relay awaits its model configuration',async()=>{
 const f=fixture({authRequired:true,configured:false});await assert.rejects(f.session.sendText('你好'),/邀请链接中的连接码/);assert.equal(f.urls.length,1);
});
test('invite token is encoded only in WSS and never sent to metadata status',async()=>{
 const token='fixture+invite/=',f=fixture({authRequired:true,inviteToken:token}),asking=f.session.sendText('你好');await settle();
 assert.equal(f.urls[0],'https://dm.example.test/api/nia/status');assert.equal(f.urls[1],'wss://dm.example.test/api/nia/dining-session?token=fixture%2Binvite%2F%3D');assert.equal(JSON.stringify(f.sent).includes(token),false);reply(f,'你好。');await asking;
});
test('unreachable hosted API ends connecting state with a useful retry message',async()=>{
 const f=fixture();globalThis.fetch=async()=>{throw new TypeError('Failed to fetch');};
 await assert.rejects(f.session.sendText('你好'),/无法连接实时 AI DM 服务/);assert.equal(f.states.at(-1),'error');assert.equal(f.errors.length,1);assert.deepEqual(f.replies,[]);
});
test('late tagged streams cannot replace a newer question',async()=>{
 const f=fixture();const old=f.session.sendText('第一个问题');await settle();const oldTurn=f.turn();f.session.interrupt();await assert.rejects(old,{name:'AbortError'});
 const asking=f.session.sendText('新的问题');await settle();reply(f,'取消后过期的回答',oldTurn);assert.deepEqual(f.replies,[]);reply(f,'针对新问题的回答');await asking;assert.equal(f.replies.at(-1).text,'针对新问题的回答');
});
test('stale tagged errors and warnings cannot interrupt a new request',async()=>{
 const f=fixture(),old=f.session.sendText('旧问题');await settle();const oldTurn=f.turn();f.session.interrupt();await assert.rejects(old,{name:'AbortError'});
 const asking=f.session.sendText('新问题');await settle();
 for(const message of [{type:'LocalError',message:'过期错误'},{type:'Report',level:'error',code:12001},{type:'TtsWarning',message:'过期提示'}])f.socket().emit({...message,turn_id:oldTurn});
 assert.deepEqual(f.errors,[]);assert.deepEqual(f.warnings,[]);reply(f,'新回答');await asking;assert.equal(f.replies.at(-1).text,'新回答');
});
test('a synthesis warning preserves text completion and permits another question',async()=>{
 const f=fixture();const asking=f.session.sendText('核对什么');await settle();f.socket().emit({type:'TtsWarning',message:'语音暂不可用，请阅读回复。',turn_id:f.turn()});reply(f,'先核对已公开的广播与磁带。');await asking;
 assert.equal(f.warnings.length,1);assert.deepEqual(f.errors,[]);assert.equal(f.replies.at(-1).complete,true);assert.equal(f.states.at(-1),'idle');
});

test('interrupting replaces transport so untagged late stream starts cannot become the next answer',async()=>{
 const f=fixture();const first=f.session.sendText('第一问');await settle();const old=f.socket();
 f.session.interrupt();await assert.rejects(first,{name:'AbortError'});
 const second=f.session.sendText('下一问');await settle();assert.notEqual(f.socket(),old);
 old.emit({type:'ResponseStartTextStream',index:'unknown-old'});old.emit({type:'ResponseTextSegment',index:'unknown-old',text:'过期话语'});old.emit({type:'ResponseEndTextStream',index:'unknown-old',text:'过期话语'});old.emit({type:'Report',code:12001,level:'error'});
 assert.equal(f.replies.length,0);assert.equal(f.errors.length,0);reply(f,'接住你这一问。');await second;
});
