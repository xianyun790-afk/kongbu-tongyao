import {useEffect,useRef,useState,type Ref} from 'react';
import {Mic,Square,X} from 'lucide-react';
import {BrowserSpeechSession} from '@/lib/browser-speech';
import type {SpeechState} from '@/lib/local-speech';
import {STATIC_DEMO} from '@/dining-loop/demo-mode';
import './speech-draft.css';
type Props={controlsTarget?:HTMLElement|null;value:string;onChange:(text:string)=>void;maxLength:number;label:string;placeholder:string;id?:string;inputRef?:Ref<HTMLTextAreaElement>;suspended:boolean;context:string;onStart:()=>void;onActiveChange:(active:boolean)=>void};
/** Recognition fills a draft; only the player publishes it. Unconfigured builds never open a mic. */
export function SpeechDraftInput(props:Props){
 const [state,setState]=useState<SpeechState>('idle'),[status,setStatus]=useState(''),[error,setError]=useState('');
 const latest=useRef(props);latest.current=props;const session=useRef<BrowserSpeechSession|null>(null);
 useEffect(()=>{
  if(STATIC_DEMO)return;
  let mounted=true;
  const speech=new BrowserSpeechSession({
   onState:next=>{if(mounted){setState(next);latest.current.onActiveChange(next!=='idle');}},onLevel:()=>{},
   onFinal:text=>{if(!mounted||latest.current.suspended)return;const p=latest.current,combined=p.value.trim()?`${p.value.trimEnd()}\n${text}`:text;p.onChange(combined.slice(0,p.maxLength));setStatus(combined.length>p.maxLength?`已填入草稿，超过 ${p.maxLength} 字的部分已截断，请检查。`:'已转成草稿，可修改后确认提交。');},
   onError:message=>{if(mounted){setError(message);setStatus('');}},
  });session.current=speech;
  return()=>{mounted=false;speech.stop();session.current=null;latest.current.onActiveChange(false);};
 },[]);
 useEffect(()=>{session.current?.stop();setStatus('');setError('');},[props.context,props.suspended]);
 const active=state!=='idle';
 function toggle(){
  if(state==='listening'){session.current?.finish();return;}
  if(active){session.current?.stop();setStatus('已取消，原草稿保留。');return;}
  setError('');setStatus('');latest.current.onStart();void session.current?.start();
 }
 return <div className="speech-draft">
  <textarea ref={props.inputRef} id={props.id} aria-label={props.label} value={props.value} maxLength={props.maxLength} placeholder={STATIC_DEMO?props.placeholder.replace('，或点击语音输入…','…'):props.placeholder} onChange={event=>{if(active)session.current?.stop();setError('');setStatus('');props.onChange(event.target.value);}}/>
  {!STATIC_DEMO&&<div className="speech-draft-controls"><div className="speech-draft-tools"><button type="button" className="draft-mic" disabled={props.suspended} aria-pressed={active} onClick={toggle}>{state==='listening'?<Square size={14}/>:active?<X size={14}/>:<Mic size={16}/>}<span>{state==='listening'?'说完了，转成文字':active?'取消语音输入':'语音输入'}</span></button><span className="draft-recognizer">浏览器中文识别 · 不会自动提交</span></div><div className="speech-draft-status" role="status">{state==='starting'?'正在开启麦克风，请允许浏览器使用…':state==='listening'?'正在听，说完停顿或再点一下。':state==='transcribing'?'正在转成文字…':status}</div>{error&&<p className="speech-draft-error" role="alert">{error} 文字草稿已保留。</p>}</div>}
 </div>;
}
