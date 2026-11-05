import type {SpeechState} from './local-speech';
type Callbacks={onState:(state:SpeechState)=>void;onLevel:(level:number)=>void;onFinal:(text:string)=>void;onError:(message:string)=>void};
type Result={isFinal:boolean;[index:number]:{transcript:string}};
type Recognition=EventTarget&{
 lang:string;continuous:boolean;interimResults:boolean;maxAlternatives:number;
 onstart:(()=>void)|null;onresult:((event:{resultIndex:number;results:ArrayLike<Result>})=>void)|null;
 onerror:((event:{error:string})=>void)|null;onend:(()=>void)|null;
 start:()=>void;stop:()=>void;abort:()=>void;
};
type RecognitionConstructor=new()=>Recognition;
type SpeechWindow=Window&{SpeechRecognition?:RecognitionConstructor;webkitSpeechRecognition?:RecognitionConstructor};

/** Browser recognition is opt-in and may use the browser vendor's online speech service. */
export class BrowserSpeechSession{
 private generation=0;private recognition:Recognition|null=null;
 private timer:ReturnType<typeof setTimeout>|null=null;private ending=false;
 constructor(private callbacks:Callbacks){}
 private clearTimer(){if(this.timer)clearTimeout(this.timer);this.timer=null;}
 stop(){
  this.generation++;this.clearTimer();const recognition=this.recognition;this.recognition=null;this.ending=false;
  if(recognition){recognition.onstart=null;recognition.onresult=null;recognition.onerror=null;recognition.onend=null;try{recognition.abort();}catch{}}
  this.callbacks.onLevel(0);this.callbacks.onState('idle');
 }
 finish(){
  if(!this.recognition||this.ending)return;this.ending=true;this.clearTimer();this.callbacks.onState('transcribing');
  try{this.recognition.stop();if(this.recognition)this.timer=setTimeout(()=>{this.stop();this.callbacks.onError('语音识别未及时完成，请重试或直接输入文字。');},8000);}catch{this.stop();this.callbacks.onError('语音识别已结束，请重试或直接输入文字。');}
 }
 async start(){
  if(this.recognition)return;
  this.callbacks.onState('starting');
  const host=window as SpeechWindow,Constructor=host.SpeechRecognition??host.webkitSpeechRecognition;
  if(!host.isSecureContext){this.stop();this.callbacks.onError('语音输入需要 HTTPS 页面，请使用安全链接打开。');return;}
  if(!Constructor){this.stop();this.callbacks.onError('当前浏览器不支持语音转文字，请使用 Chrome、Edge 或直接输入文字。');return;}
  const recognition=new Constructor(),token=++this.generation;this.recognition=recognition;this.ending=false;
  recognition.lang='zh-CN';recognition.continuous=false;recognition.interimResults=false;recognition.maxAlternatives=1;
  const current=()=>this.recognition===recognition&&token===this.generation;let final='';
  recognition.onstart=()=>{if(current()){this.clearTimer();this.callbacks.onState('listening');this.timer=setTimeout(()=>this.finish(),20000);}};
  recognition.onresult=event=>{if(!current())return;for(let i=event.resultIndex;i<event.results.length;i++){const result=event.results[i];if(result.isFinal)final+=result[0]?.transcript??'';}};
  recognition.onerror=event=>{
   if(!current())return;
   const message=event.error==='not-allowed'||event.error==='service-not-allowed'?'麦克风或浏览器语音服务权限未开启，请允许后重试。':event.error==='no-speech'?'没有听清你的问题，请靠近麦克风再试一次。':event.error==='audio-capture'?'没有可用的麦克风，请检查设备或直接输入文字。':event.error==='network'?'浏览器语音识别网络不可用，请重试或直接输入文字。':'语音识别暂不可用，请重试或直接输入文字。';
   this.stop();this.callbacks.onError(message);
  };
  recognition.onend=()=>{if(!current())return;const text=final.trim().slice(0,1200);this.stop();if(text)this.callbacks.onFinal(text);else this.callbacks.onError('没有识别到清晰的中文，请再说一次，也可以直接输入。');};
  this.timer=setTimeout(()=>{if(current()){this.stop();this.callbacks.onError('开启语音输入超时，请检查麦克风权限后重试。');}},12000);
  try{recognition.start();}catch{if(current()){this.stop();this.callbacks.onError('无法开启浏览器语音识别，请重试或直接输入文字。');}}
 }
}
