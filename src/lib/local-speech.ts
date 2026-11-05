import {encodeSpeechWav} from './pcm-audio';
export type SpeechState='idle'|'starting'|'listening'|'transcribing';
type Callbacks={onState:(state:SpeechState)=>void;onLevel:(level:number)=>void;onFinal:(text:string)=>void;onError:(message:string)=>void};
export class LocalSpeechSession {
 private generation=0;private active=false;private controller:AbortController|null=null;
 private finishCapture:(()=>void)|null=null;
 private stream:MediaStream|null=null;private context:AudioContext|null=null;private node:AudioWorkletNode|null=null;private timer:ReturnType<typeof setInterval>|null=null;
 constructor(private callbacks:Callbacks){}
 private releaseMicrophone(){
  this.finishCapture=null;
  if(this.timer)clearInterval(this.timer);this.timer=null;
  if(this.node){this.node.port.onmessage=null;this.node.disconnect();this.node=null;}
  this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;
  if(this.context){void this.context.close().catch(()=>{});this.context=null;}this.callbacks.onLevel(0);
 }
 stop(){this.generation++;this.active=false;this.controller?.abort();this.controller=null;this.releaseMicrophone();this.callbacks.onState('idle');}
 /** Complete the current recording; stop() continues to cancel without submitting. */
 finish(){this.finishCapture?.();}
 async start(){
  if(this.active)return;this.active=true;const token=++this.generation,controller=new AbortController();this.controller=controller;
  const current=()=>this.active&&token===this.generation;
  this.callbacks.onState('starting');
  try{
   const status=await fetch('/api/voice/status',{signal:controller.signal});
   if(!status.ok||!(await status.json()).ready)throw new Error('本地中文识别服务尚未就绪，请稍后重试。');
   if(!current())return;
   if(!navigator.mediaDevices?.getUserMedia)throw new Error('当前页面无法访问麦克风，请使用本地预览或 HTTPS 打开。');
   const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
   if(!current()){stream.getTracks().forEach(track=>track.stop());return;}this.stream=stream;
   const context=new AudioContext();this.context=context;await context.resume();await context.audioWorklet.addModule('/worklets/pcm-capture.js');
   if(!current())return;
   const node=new AudioWorkletNode(context,'pcm-capture'),silent=context.createGain();silent.gain.value=0;this.node=node;
   context.createMediaStreamSource(stream).connect(node).connect(silent).connect(context.destination);
   const chunks:Float32Array[]=[];let total=0,voiced=0,lastVoice=0,ending=false;const began=performance.now();
   const finish=async()=>{
    if(ending||!current())return;ending=true;const rate=context.sampleRate;this.releaseMicrophone();
    if(voiced<.18)throw new Error('没有听清你的问题，请靠近麦克风再说一次。');
    this.callbacks.onState('transcribing');
    const pcm=new Float32Array(total);let offset=0;for(const chunk of chunks){pcm.set(chunk,offset);offset+=chunk.length;}
    const response=await fetch('/api/transcribe',{method:'POST',headers:{'Content-Type':'audio/wav'},body:encodeSpeechWav(pcm,rate),signal:controller.signal});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'本地语音识别失败，请重试。');
    if(!current())return;const text=typeof data.text==='string'?data.text.trim():'';
    if(!text)throw new Error('没有识别到清晰的中文，请再说一次，也可以直接输入。');
    this.stop();this.callbacks.onFinal(text);
   };
   const fail=(error:unknown)=>{if(!current())return;this.stop();this.callbacks.onError(error instanceof Error?error.message:'语音识别失败，请重试。');};
   this.finishCapture=()=>{void finish().catch(fail);};
   node.port.onmessage=event=>{
    if(!current()||ending)return;const chunk=event.data as Float32Array;chunks.push(chunk);total+=chunk.length;
    let energy=0;for(const sample of chunk)energy+=sample*sample;const rms=Math.sqrt(energy/chunk.length);this.callbacks.onLevel(Math.min(1,rms*12));
    if(rms>.012){voiced+=chunk.length/context.sampleRate;lastVoice=performance.now();}
   };
   this.timer=setInterval(()=>{
    const now=performance.now();if((voiced>=.18&&now-lastVoice>1100)||now-began>20000)void finish().catch(fail);
    else if(!voiced&&now-began>8000){this.stop();this.callbacks.onError('暂时没有听到声音，请检查麦克风后重试。');}
   },120);
   this.callbacks.onState('listening');
  }catch(error){
   if(!current())return;this.stop();
   this.callbacks.onError(error instanceof DOMException&&error.name==='NotAllowedError'?'麦克风权限未开启，请在浏览器中允许后重试。':error instanceof TypeError?'无法连接本地识别服务，请确认本地服务正在运行。':error instanceof Error?error.message:'无法开启麦克风。');
  }
 }
}
