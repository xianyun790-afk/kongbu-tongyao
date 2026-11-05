export type SceneLoadProgress={phase:'download'|'decode'|'ready';loaded:number;total:number};
const aborted=()=>new DOMException('场景加载已取消。','AbortError');

/** Abort a stalled download, while allowing a slow connection that keeps making progress. */
export async function fetchSceneBytes(url:string,{signal,onProgress,expectedBytes=0,idleTimeoutMs=25000}:{signal:AbortSignal;onProgress?:(progress:SceneLoadProgress)=>void;expectedBytes?:number;idleTimeoutMs?:number}){
 const controller=new AbortController();let stalled=false,timer:ReturnType<typeof setTimeout>|undefined;
 const cancel=()=>controller.abort();
 const touch=()=>{clearTimeout(timer);timer=setTimeout(()=>{stalled=true;controller.abort();},idleTimeoutMs);};
 if(signal.aborted)throw aborted();
 signal.addEventListener('abort',cancel,{once:true});touch();
 try{
  const response=await fetch(url,{signal:controller.signal});
  if(!response.ok)throw new Error(`二楼资源下载失败（${response.status}），请重试。`);
  const total=Number(response.headers.get('content-length'))||expectedBytes;
  let loaded=0;onProgress?.({phase:'download',loaded,total});touch();
  if(!response.body){const bytes=await response.arrayBuffer();onProgress?.({phase:'download',loaded:bytes.byteLength,total:total||bytes.byteLength});return bytes;}
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];
  while(true){
   const {done,value}=await reader.read();if(done)break;
   chunks.push(value);loaded+=value.byteLength;touch();onProgress?.({phase:'download',loaded,total});
  }
  if(controller.signal.aborted)throw aborted();
  const bytes=new Uint8Array(loaded);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return bytes.buffer;
 }catch(error){
  if(signal.aborted)throw aborted();
  if(stalled)throw new Error('二楼资源连接超时。可以重试，或留在餐厅继续调查。');
  if(error instanceof TypeError)throw new Error('二楼资源暂未下载成功，请检查网络后重试。');
  throw error;
 }finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);}
}

/** Decoders cannot always be aborted; ignore and dispose a result that arrives after cancellation. */
export function sceneDecodeDeadline<T>(work:Promise<T>,{signal,timeoutMs=45000,onLateValue}:{signal:AbortSignal;timeoutMs?:number;onLateValue:(value:T)=>void}):Promise<T>{
 return new Promise((resolve,reject)=>{
  let settled=false,timer:ReturnType<typeof setTimeout>|undefined;
  const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);};
  const fail=(error:unknown)=>{if(settled)return;settled=true;cleanup();reject(error);};
  const cancel=()=>fail(aborted());
  // Attach handlers even when already aborted so a late decoder result cannot leak.
  work.then(value=>{if(settled){onLateValue(value);return;}settled=true;cleanup();resolve(value);},fail);
  if(signal.aborted){cancel();return;}
  signal.addEventListener('abort',cancel,{once:true});
  timer=setTimeout(()=>fail(new Error('二楼场景还原超时，请重试；餐厅调查进度已保留。')),timeoutMs);
 });
}
