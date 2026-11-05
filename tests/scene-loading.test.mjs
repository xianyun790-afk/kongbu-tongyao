import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {gzipSync} from 'node:zlib';
import {fetchSceneBytes,sceneDecodeDeadline} from '../src/dining-loop/scene-loading.ts';

async function serverFor(t,handler){
 const server=createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>{server.closeAllConnections();server.close();});
 return `http://127.0.0.1:${server.address().port}/kongbu-tongyao/models/dining-loop/office-room.glb`;
}
test('a streamed model reports real transferred bytes and preserves its contents',async t=>{
 const url=await serverFor(t,(_req,res)=>{res.writeHead(200,{'content-length':'6'});res.write('abc');setTimeout(()=>res.end('def'),10);});
 const progress=[];const bytes=await fetchSceneBytes(url,{signal:new AbortController().signal,onProgress:p=>progress.push(p)});
 assert.equal(new TextDecoder().decode(bytes),'abcdef');
 assert.deepEqual(progress.at(-1),{phase:'download',loaded:6,total:6});
 assert.ok(progress.some(p=>p.loaded>0&&p.loaded<6));
});
test('unknown content length uses the authored model size',async t=>{
 const url=await serverFor(t,(_req,res)=>{res.writeHead(200);res.end('abc');});
 const progress=[];await fetchSceneBytes(url,{signal:new AbortController().signal,expectedBytes:3,onProgress:p=>progress.push(p)});
 assert.equal(progress.at(-1).total,3);assert.equal(progress.at(-1).loaded,3);
});
test('compressed hosting responses use the model byte count rather than the compressed Content-Length',async t=>{
 const source=Buffer.from('office model '.repeat(1000)),compressed=gzipSync(source);
 const url=await serverFor(t,(_req,res)=>{res.writeHead(200,{'content-encoding':'gzip','content-length':String(compressed.length)});res.end(compressed);});
 const progress=[];const bytes=await fetchSceneBytes(url,{signal:new AbortController().signal,expectedBytes:source.length,onProgress:p=>progress.push(p)});
 assert.deepEqual(Buffer.from(bytes),source);assert.equal(progress.at(-1).loaded,source.length);assert.equal(progress.at(-1).total,source.length);
});
test('a missing model fails with a retryable message',async t=>{
 const url=await serverFor(t,(_req,res)=>{res.writeHead(404);res.end();});
 await assert.rejects(fetchSceneBytes(url,{signal:new AbortController().signal}),/404/);
});
test('a stalled connection times out instead of leaving the route pending forever',async t=>{
 const url=await serverFor(t,(_req,res)=>{res.writeHead(200);res.write('a');});
 await assert.rejects(fetchSceneBytes(url,{signal:new AbortController().signal,idleTimeoutMs:45}),/连接超时/);
});
test('a slow transfer can continue beyond the idle deadline while bytes keep arriving',async t=>{
 const url=await serverFor(t,(_req,res)=>{
  res.writeHead(200);res.write('a');let count=1;
  const timer=setInterval(()=>{res.write('a');if(++count===7){clearInterval(timer);res.end();}},20);
  res.on('close',()=>clearInterval(timer));
 });
 const bytes=await fetchSceneBytes(url,{signal:new AbortController().signal,idleTimeoutMs:65});
 assert.equal(bytes.byteLength,7);
});
test('cancelling a model download rejects promptly and closes the request',async t=>{
 let closed;const ended=new Promise(resolve=>{closed=resolve;});
 const url=await serverFor(t,(_req,res)=>{res.writeHead(200);res.write('a');res.on('close',closed);});
 const controller=new AbortController();
 const result=fetchSceneBytes(url,{signal:controller.signal,onProgress:p=>{if(p.loaded)controller.abort();}});
 await assert.rejects(result,{name:'AbortError'});await ended;
});
test('a hung decoder times out and disposes its eventual result',async()=>{
 let resolve,disposed=false;const work=new Promise(done=>{resolve=done;});
 await assert.rejects(sceneDecodeDeadline(work,{signal:new AbortController().signal,timeoutMs:15,onLateValue:()=>{disposed=true;}}),/还原超时/);
 resolve({scene:'late'});await Promise.resolve();assert.equal(disposed,true);
});
test('cancellation during decoding does not attach a late scene',async()=>{
 let resolve,disposed=false;const controller=new AbortController(),work=new Promise(done=>{resolve=done;});
 const result=sceneDecodeDeadline(work,{signal:controller.signal,onLateValue:()=>{disposed=true;}});controller.abort();
 await assert.rejects(result,{name:'AbortError'});resolve({scene:'cancelled'});await Promise.resolve();assert.equal(disposed,true);
});
test('a completed decode survives subsequent cancellation and is not disposed',async()=>{
 const controller=new AbortController(),scene={name:'office'};let disposed=false;
 assert.equal(await sceneDecodeDeadline(Promise.resolve(scene),{signal:controller.signal,onLateValue:()=>{disposed=true;}}),scene);
 controller.abort();assert.equal(disposed,false);
});
