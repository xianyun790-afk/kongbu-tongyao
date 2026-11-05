import {PcmStreamPlayer,type StreamAudio} from '@/lib/stream-audio';

export type DiningDmState='idle'|'connecting'|'thinking'|'speaking'|'error';
export type DiningDmSource='ai'|'opening'|'local-guidance';
export type DiningDmContext={known:('A01'|'A02'|'A03')[];sharedListening?:boolean;history:{who:string;text:string}[]};
type Message=Record<string,unknown>&{type:string};
type Callbacks={onState:(state:DiningDmState)=>void;onReply:(text:string,complete:boolean,source:DiningDmSource)=>void;onError:(message:string)=>void;onAudioReceived?:(bytes:number)=>void};
type Pending={types:string[];resolve:(message:Message)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>};
const cancelled=()=>new DOMException('AI DM回应已取消。','AbortError');

/** A separate public-R1 session. Dictation is handled by SpeechDraftInput. */
export class DiningDmSession {
 private socket:WebSocket|null=null;private audio:StreamAudio;
 private context:DiningDmContext={known:[],sharedListening:false,history:[]};
 private generation=0;private operation=0;private ready=false;private connecting:Promise<void>|null=null;
 private pending=new Map<string,Pending>();private statusController:AbortController|null=null;
 private replyTimer:ReturnType<typeof setTimeout>|null=null;
 private idleTimer:ReturnType<typeof setTimeout>|null=null;
 private active:{resolve:()=>void;reject:(error:Error)=>void}|null=null;
 private responseIndex:unknown=null;private audioIndex:unknown=null;private transcript='';private source:DiningDmSource='ai';private bytes=0;private started=false;
 constructor(private callbacks:Callbacks,dependencies?:{audio?:StreamAudio}){this.audio=dependencies?.audio??new PcmStreamPlayer();}
 setContext(context:DiningDmContext){
  const changed=JSON.stringify(this.context.known)!==JSON.stringify(context.known)||Boolean(this.context.sharedListening)!==Boolean(context.sharedListening);
  this.context={known:[...context.known],sharedListening:context.sharedListening===true,history:context.history.map(m=>({...m})).slice(-12)};
  if(changed){this.interrupt();if(this.ready)this.sendContext(true);}
 }
 setMuted(muted:boolean){this.audio.setMuted(muted);}
 /** Keep the entry click's audio permission while the visual transition plays. */
 prepareAudio(){return this.audio.open();}
 private state(state:DiningDmState){this.callbacks.onState(state);}
 private send(m:Record<string,unknown>){if(this.socket?.readyState!==WebSocket.OPEN)throw new Error('AI DM尚未连接，请重试。');this.socket.send(JSON.stringify(m));}
 private sendContext(update=false){this.send({type:'GameContext',experience:'dining-loop',...this.context,update});}
 private wait(types:string[],id='event:'+types[0]):Promise<Message>{return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('AI DM连接超时，请重试。'));},15000);
  this.pending.set(id,{types,resolve,reject,timer});
 });}
 private request(type:string,types:string[]){const request_id=crypto.randomUUID(),p=this.wait(types,request_id);this.send({type,request_id});return p;}
 private clearDeadline(){if(this.replyTimer)clearTimeout(this.replyTimer);this.replyTimer=null;}
 private clearIdle(){if(this.idleTimer)clearTimeout(this.idleTimer);this.idleTimer=null;}
 private idle(){this.clearIdle();if(this.ready&&!this.active)this.idleTimer=setTimeout(()=>this.stop(),30000);}
 private progress(){if(!this.active)return;this.clearDeadline();this.replyTimer=setTimeout(()=>this.fail('AI DM暂时没有完整回应，请重试；调查进度仍保留。'),30000);}
 private resetReply(){this.clearDeadline();this.responseIndex=null;this.audioIndex=null;this.transcript='';this.source='ai';this.started=false;this.bytes=0;}
 private cancelTurn(){const active=this.active;this.active=null;this.resetReply();this.audio.clear();active?.reject(cancelled());}
 private fail(message:string){this.stop();this.state('error');this.callbacks.onError(message);}
 private receive(m:Message){
  for(const [id,p] of this.pending){if(p.types.includes(m.type)&&(id.startsWith('event:')||m.respond_to===id)){
   clearTimeout(p.timer);this.pending.delete(id);
   if(m.type==='ConfigRejected'||m.success===false)p.reject(new Error('AI DM模型或音色配置被拒绝，请检查服务权限。'));else p.resolve(m);
  }}
  if(m.type==='LocalError'){this.fail(typeof m.message==='string'?m.message:'AI DM连接失败。');return;}
  if(m.type==='Report'&&(m.level==='error'||Number(m.code)>=400)){
   this.fail(Number(m.code)===12001?'AI DM实时额度不足（12001），可继续本地调查。':'AI DM服务拒绝了请求，请重试或继续本地调查。');return;
  }
  if(m.type==='ResponseBlocked'){this.fail('这次AI回复未能生成，请换一种问法。');return;}
  if(m.type==='CloseConnection'){this.fail('AI DM会话已结束，请重新连接。');return;}
  if(!this.active)return;
  switch(m.type){
   case 'ResponseStartTextStream':this.progress();this.started=true;this.transcript='';this.responseIndex=m.index;this.source=m.source==='opening'?'opening':m.source==='local-guidance'?'local-guidance':'ai';break;
   case 'ResponseTextSegment':if(m.index===this.responseIndex&&typeof m.text==='string'){this.progress();this.transcript+=m.text;this.callbacks.onReply(this.transcript,false,this.source);}break;
   case 'ResponseEndTextStream':if(m.index===this.responseIndex){this.progress();if(typeof m.text==='string'&&m.text)this.transcript=m.text.startsWith(this.transcript)?m.text:this.transcript.endsWith(m.text)?this.transcript:this.transcript+m.text;this.callbacks.onReply(this.transcript,m.complete!==false,this.source);this.responseIndex=null;}break;
   case 'ResponseStartAudioStream':case 'ResponseStartAudioSegment':this.progress();this.started=true;this.audioIndex=m.index;break;
   case 'ResponseAudioSegment':if(m.index===this.audioIndex&&typeof m.audio_segment==='string'){this.progress();this.bytes+=this.audio.push(m.audio_segment);this.callbacks.onAudioReceived?.(this.bytes);this.state('speaking');}break;
   case 'AgentStartPlay':this.progress();this.started=true;this.state('speaking');break;
   case 'AgentEndPlay':{
    if(!this.started)return;const generation=this.generation,operation=this.operation,active=this.active;
    this.clearDeadline();void this.audio.drain().then(()=>{if(generation!==this.generation||operation!==this.operation||this.active!==active)return;this.active=null;this.resetReply();this.state('idle');this.idle();active?.resolve();});break;
   }
   case 'ClearAgentAudio':this.audio.clear();break;
  }
 }
 private async connect(){
  if(this.ready)return;if(this.connecting)return this.connecting;
  const generation=this.generation,current=()=>generation===this.generation;this.state('connecting');
  const work=(async()=>{
   const controller=new AbortController();this.statusController=controller;const deadline=setTimeout(()=>controller.abort(),5000);
   let response:Response;try{response=await fetch('/api/nia/status',{signal:controller.signal});}finally{clearTimeout(deadline);}
   let status:{configured?:boolean;dining_loop?:boolean};try{status=await response.json();}catch{throw new Error('AI DM本地服务未启动，请检查4179服务；调查仍可继续。');}
   if(!current())throw cancelled();if(!response.ok||!status.configured)throw new Error('实时AI DM未配置，调查仍可继续。');
   if(!status.dining_loop)throw new Error('AI DM服务版本尚未更新，请重新启动本地服务。');
   const ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/nia/dining-session`);this.socket=ws;
   ws.addEventListener('message',event=>{if(!current())return;let m:Message;try{m=JSON.parse(event.data);}catch{this.fail('AI DM消息无法读取，请重新连接。');return;}if(m&&typeof m.type==='string'){try{this.receive(m);}catch{this.fail('AI DM回复处理失败，请重新连接。');}}});
   ws.addEventListener('error',()=>{if(current())this.fail('无法连接AI DM服务，请重试；调查进度仍保留。');});
   ws.addEventListener('close',()=>{if(current())this.fail('实时AI DM已断开，请重新连接。');});
   await this.wait(['TransportReady']);if(!current())throw cancelled();this.sendContext();
   await this.request('CreateSession',['CreateSessionResult']);if(!current())throw cancelled();
   await this.request('ConfigPipeline',['ConfigUpdated','ConfigRejected']);if(!current())throw cancelled();
   this.send({type:'ConfigASR',enable:false});const accepting=this.wait(['AudioAccepting']);this.send({type:'StartServing'});await accepting;
   if(!current())throw cancelled();this.ready=true;
  })();this.connecting=work;
  try{await work;}finally{if(this.connecting===work)this.connecting=null;}
 }
 private async run(type:'PostMultimodalGenerate'|'SpeakOpening',text:string,options?:{signal?:AbortSignal}){
  const operation=++this.operation;this.clearIdle();this.cancelTurn();if(this.ready)this.send({type:'InterruptAgent'});
  const signal=options?.signal;
  const abort=()=>{if(operation===this.operation)this.interrupt();};signal?.addEventListener('abort',abort,{once:true});
  try{
   if(signal?.aborted)throw cancelled();await this.audio.open();if(operation!==this.operation)throw cancelled();
   await this.connect();if(operation!==this.operation)throw cancelled();this.sendContext(true);
   const completed=new Promise<void>((resolve,reject)=>{this.active={resolve,reject};});this.state('thinking');this.progress();
   this.send({type,...(type==='PostMultimodalGenerate'?{text}:{}),request_id:crypto.randomUUID()});await completed;
  }catch(error){
   if(operation===this.operation&&!(error instanceof DOMException&&error.name==='AbortError')){
    const message=error instanceof Error?error.message:'AI DM连接失败，请重试。';this.fail(message);
   }
   throw error;
  }finally{signal?.removeEventListener('abort',abort);if(!this.active)this.idle();}
 }
 sendText(text:string,options?:{signal?:AbortSignal}){text=text.trim().slice(0,1200);return text?this.run('PostMultimodalGenerate',text,options):Promise.resolve();}
 speakOpening(options?:{signal?:AbortSignal}){return this.run('SpeakOpening','',options);}
 interrupt(){this.operation++;this.cancelTurn();if(this.socket?.readyState===WebSocket.OPEN)this.send({type:'InterruptAgent'});this.state('idle');this.idle();}
 stop(){
  this.generation++;this.operation++;this.ready=false;this.connecting=null;this.clearIdle();this.statusController?.abort();this.statusController=null;
  this.cancelTurn();this.audio.close();this.socket?.close();this.socket=null;
  for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(cancelled());}this.pending.clear();this.state('idle');
 }
}
