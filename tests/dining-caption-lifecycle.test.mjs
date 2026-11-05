import test,{afterEach,mock} from 'node:test';
import assert from 'node:assert/strict';
import {captionDelay,CaptionExpiry} from '../src/dining-loop/caption-lifecycle.ts';

afterEach(()=>mock.timers.reset());

const reply=(text='先核对广播和原磁带。')=>({id:'reply-1',who:'dm',text,complete:true,source:'ai'});
const snapshot=(overrides={})=>({visible:true,recording:false,state:'idle',status:'',error:'',reply:reply(),heard:false,...overrides});

test('recording, connection, generation and actual playback never expire the caption',()=>{
 for(const state of ['connecting','thinking','speaking']){
  assert.equal(captionDelay(snapshot({state,heard:true,status:'上一条提示',error:'上次连接失败'})),null,state);
 }
 assert.equal(captionDelay(snapshot({recording:true,status:'正在识别你说的话…'})),null);
 assert.equal(captionDelay(snapshot({visible:false})),null);
});

test('an audible reply stays through playback, then disappears 1200ms after audio becomes idle',()=>{
 mock.timers.enable({apis:['setTimeout']});
 const expiry=new CaptionExpiry();let visible=true;
 expiry.schedule(captionDelay(snapshot({state:'speaking',heard:true})),()=>{visible=false;});
 mock.timers.tick(60000);assert.equal(visible,true,'the sound is still playing');
 expiry.schedule(captionDelay(snapshot({state:'idle',heard:true})),()=>{visible=false;});
 mock.timers.tick(1199);assert.equal(visible,true,'retain a short pause after playback');
 mock.timers.tick(1);assert.equal(visible,false);
});

test('unplayed or muted text allows 5–16 seconds for reading, with more time for longer replies',()=>{
 const short=captionDelay(snapshot({reply:reply('查一下广播。'),heard:false}));
 const medium=captionDelay(snapshot({reply:reply('请核对两份声音中的呼吸和椅脚摩擦。'.repeat(6)),heard:false}));
 const long=captionDelay(snapshot({reply:reply('线索'.repeat(300)),heard:false}));
 assert.equal(short,5000);assert.ok(medium>short&&medium<16000);assert.equal(long,16000);
 mock.timers.enable({apis:['setTimeout']});
 let hidden=0;const expiry=new CaptionExpiry();
 expiry.schedule(short,()=>hidden++);mock.timers.tick(4999);assert.equal(hidden,0);
 mock.timers.tick(1);assert.equal(hidden,1);
 expiry.schedule(long,()=>hidden++);mock.timers.tick(15999);assert.equal(hidden,1);
 mock.timers.tick(1);assert.equal(hidden,2);
});

test('unheard-voice and service failure messages leave after 3500ms',()=>{
 mock.timers.enable({apis:['setTimeout']});
 for(const terminal of [
  {status:'没有听清你的问题，请靠近麦克风再说一次。'},
  {reply:undefined,error:'AI DM实时额度不足（12001），可继续本地调查。'},
 ]){
  let visible=true;const expiry=new CaptionExpiry(),delay=captionDelay(snapshot(terminal));
  assert.equal(delay,3500);expiry.schedule(delay,()=>{visible=false;});
  mock.timers.tick(3499);assert.equal(visible,true);mock.timers.tick(1);assert.equal(visible,false);
 }
});

test('the empty reply created before a request does not dismiss a newly started conversation',()=>{
 const waiting={...reply(''),complete:false};
 assert.equal(captionDelay(snapshot({reply:waiting,heard:false})),null);
 mock.timers.enable({apis:['setTimeout']});
 let hidden=false;const expiry=new CaptionExpiry();
 expiry.schedule(captionDelay(snapshot({reply:waiting})),()=>{hidden=true;});
 mock.timers.tick(60000);assert.equal(hidden,false);
});

test('cancelling clears the pending exit and does not fire it later',()=>{
 mock.timers.enable({apis:['setTimeout']});
 let exits=0;const expiry=new CaptionExpiry();
 expiry.schedule(3500,()=>exits++);mock.timers.tick(3000);expiry.clear();
 mock.timers.tick(30000);assert.equal(exits,0);
 expiry.clear();expiry.clear();assert.equal(exits,0,'cleanup is safe to repeat');
});

test('a new recording invalidates the previous error exit and cannot be closed by its old deadline',()=>{
 mock.timers.enable({apis:['setTimeout']});
 let visible=true;const expiry=new CaptionExpiry();
 expiry.schedule(captionDelay(snapshot({status:'没有听到声音。'})),()=>{visible=false;});
 mock.timers.tick(3400);
 expiry.schedule(captionDelay(snapshot({recording:true,status:'正在听…'})),()=>{visible=false;});
 mock.timers.tick(10000);assert.equal(visible,true,'the previous error cannot close the recording');
 expiry.schedule(captionDelay(snapshot({heard:true})),()=>{visible=false;});
 mock.timers.tick(1200);assert.equal(visible,false,'the new turn still gets its own exit');
});

test('a later reply owns its own reading deadline instead of inheriting an earlier caption timer',()=>{
 mock.timers.enable({apis:['setTimeout']});
 const events=[],expiry=new CaptionExpiry();
 expiry.schedule(5000,()=>events.push('old'));mock.timers.tick(4500);
 expiry.schedule(16000,()=>events.push('new'));
 mock.timers.tick(500);assert.deepEqual(events,[]);
 mock.timers.tick(15499);assert.deepEqual(events,[]);
 mock.timers.tick(1);assert.deepEqual(events,['new']);
 mock.timers.tick(30000);assert.deepEqual(events,['new'],'expiry happens once');
});

test('a cancelled timeout callback is harmless even if the browser already queued it',t=>{
 const originalSetTimeout=globalThis.setTimeout,originalClearTimeout=globalThis.clearTimeout;
 const queued=[],events=[],expiry=new CaptionExpiry();
 // A no-op clear simulates a timeout task that has already reached the event queue.
 globalThis.setTimeout=callback=>{queued.push(callback);return queued.length;};
 globalThis.clearTimeout=()=>{};
 t.after(()=>{expiry.clear();globalThis.setTimeout=originalSetTimeout;globalThis.clearTimeout=originalClearTimeout;});
 expiry.schedule(3500,()=>events.push('old'));
 const stale=queued[0];expiry.clear();stale();assert.deepEqual(events,[]);
 expiry.schedule(5000,()=>events.push('new'));
 stale();assert.deepEqual(events,[],'an old queued task cannot close the new interaction');
 queued[1]();assert.deepEqual(events,['new'],'the current task still expires normally');
});
