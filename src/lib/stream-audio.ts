/** Keep fractional samples across frames so 44.1/48 kHz capture does not lose syllables. */
export class Pcm16Encoder {
 private weight=0;private sum=0;
 constructor(private inputRate:number,private outputRate=16000){if(inputRate<outputRate)throw new Error('麦克风采样率过低。');}
 encode(samples:Float32Array):Uint8Array {
  const ratio=this.inputRate/this.outputRate,values:number[]=[];
  for(const sample of samples){
   let remaining=1;
   while(remaining>1e-8){
    const part=Math.min(remaining,ratio-this.weight);this.sum+=sample*part;this.weight+=part;remaining-=part;
    if(this.weight>=ratio-1e-8){
     const value=Math.max(-1,Math.min(1,this.sum/ratio));
     values.push(value<0?Math.round(value*32768):Math.round(value*32767));this.weight=0;this.sum=0;
    }
   }
  }
  const bytes=new Uint8Array(values.length*2),view=new DataView(bytes.buffer);
  values.forEach((value,i)=>view.setInt16(i*2,value,true));return bytes;
 }
}
export function pcmBase64(bytes:Uint8Array){let text='';for(const byte of bytes)text+=String.fromCharCode(byte);return btoa(text);}
export interface StreamAudio {
 open():Promise<void>;push(base64:string):number;drain():Promise<void>;clear():void;setMuted(muted:boolean):void;close():void;
}
/** NIA WS1 returns PCM16 mono at 16 kHz. Wait for playback, not server generation, to finish. */
export class PcmStreamPlayer implements StreamAudio {
 private context:AudioContext|null=null;private gain:GainNode|null=null;private nextTime=0;
 private sources=new Set<AudioBufferSourceNode>();private waiting=new Set<()=>void>();private muted=false;
 async open(){
  if(!this.context){this.context=new AudioContext();this.gain=this.context.createGain();this.gain.gain.value=this.muted?0:1;this.gain.connect(this.context.destination);}
  const context=this.context;await context.resume();
  if(this.context!==context)throw new Error('语音播放已取消。');
  if(context.state!=='running')throw new Error('浏览器尚未允许播放声音，请再点击一次提问。');
 }
 push(base64:string){
  const context=this.context;if(!context||!this.gain)return 0;
  const raw=atob(base64);if(!raw.length||raw.length%2)throw new Error('主持人返回了不完整的音频。');
  const buffer=context.createBuffer(1,raw.length/2,16000),samples=buffer.getChannelData(0);
  for(let i=0;i<samples.length;i++){const value=raw.charCodeAt(i*2)|(raw.charCodeAt(i*2+1)<<8);samples[i]=(value&0x8000?value-65536:value)/32768;}
  const source=context.createBufferSource();source.buffer=buffer;source.connect(this.gain);this.sources.add(source);
  source.onended=()=>{source.disconnect();this.sources.delete(source);this.resolveDrain();};
  const start=Math.max(context.currentTime+.035,this.nextTime);source.start(start);this.nextTime=start+buffer.duration;return raw.length;
 }
 private resolveDrain(){if(!this.sources.size){for(const resolve of this.waiting)resolve();this.waiting.clear();}}
 drain(){return this.sources.size?new Promise<void>(resolve=>this.waiting.add(resolve)):Promise.resolve();}
 clear(){for(const source of this.sources){source.onended=null;try{source.stop();}catch{}source.disconnect();}this.sources.clear();this.nextTime=0;this.resolveDrain();}
 setMuted(muted:boolean){this.muted=muted;if(this.gain)this.gain.gain.value=muted?0:1;}
 close(){this.clear();const context=this.context;this.context=null;this.gain=null;if(context)void context.close().catch(()=>{});}
}
export interface StreamMicrophone {start(onPcm:(bytes:Uint8Array)=>void,onLevel:(level:number)=>void):Promise<void>;close():void;}
export class PcmMicrophone implements StreamMicrophone {
 private generation=0;private stream:MediaStream|null=null;private context:AudioContext|null=null;private node:AudioWorkletNode|null=null;
 async start(onPcm:(bytes:Uint8Array)=>void,onLevel:(level:number)=>void){
  this.close();const token=this.generation;
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('麦克风需要在本机地址或 HTTPS 页面使用。');
  const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
  if(token!==this.generation){stream.getTracks().forEach(track=>track.stop());return;}this.stream=stream;
  const context=new AudioContext();this.context=context;await context.resume();if(token!==this.generation)return;
  await context.audioWorklet.addModule('/worklets/pcm-capture.js');if(token!==this.generation)return;
  const node=new AudioWorkletNode(context,'pcm-capture',{processorOptions:{frameSize:1024}});this.node=node;
  const encoder=new Pcm16Encoder(context.sampleRate),silent=context.createGain();silent.gain.value=0;
  node.port.onmessage=event=>{
   if(token!==this.generation)return;const samples=event.data as Float32Array;let power=0;for(const sample of samples)power+=sample*sample;
   onLevel(Math.min(1,Math.sqrt(power/samples.length)*12));const bytes=encoder.encode(samples);if(bytes.length)onPcm(bytes);
  };
  context.createMediaStreamSource(stream).connect(node).connect(silent).connect(context.destination);
 }
 close(){
  this.generation++;if(this.node){this.node.port.onmessage=null;this.node.disconnect();this.node=null;}
  this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;
  const context=this.context;this.context=null;if(context)void context.close().catch(()=>{});
 }
}
