import {useEffect,useRef,useState} from 'react';
import {Mic,Square,X} from 'lucide-react';
import {LocalSpeechSession,type SpeechState} from '@/lib/local-speech';

type Props={suspended:boolean;onStart:()=>void;onCancel:()=>void;onAsk:(text:string)=>void;onActiveChange:(active:boolean)=>void;onStatus:(text:string)=>void};

/** One click records; the completed transcript goes straight to the host. */
export function VoiceBubble(props:Props){
 const [state,setState]=useState<SpeechState>('idle');
 const latest=useRef(props);latest.current=props;
 const session=useRef<LocalSpeechSession|null>(null);
 useEffect(()=>{
  let mounted=true;
  const speech=new LocalSpeechSession({
   onState:next=>{if(!mounted)return;setState(next);latest.current.onActiveChange(next!=='idle');latest.current.onStatus(next==='starting'?'正在开启麦克风…':next==='listening'?'正在听，说完停顿即可。也可以再点一下结束。':next==='transcribing'?'正在识别你说的话…':'');},
   onLevel:()=>{},
   onFinal:text=>{if(mounted&&!latest.current.suspended)latest.current.onAsk(text);},
   onError:message=>{if(mounted&&!latest.current.suspended)latest.current.onStatus(message);},
  });session.current=speech;
  return()=>{mounted=false;speech.stop();session.current=null;latest.current.onActiveChange(false);};
 },[]);
 useEffect(()=>{if(props.suspended)session.current?.stop();},[props.suspended]);
 function toggle(){
  if(props.suspended)return;
  if(state==='listening'){session.current?.finish();return;}
  if(state!=='idle'){cancel();return;}
  latest.current.onStart();void session.current?.start();
 }
 function cancel(){session.current?.stop();latest.current.onCancel();}
 const label=state==='listening'?'说完了，发送给主持人':state==='starting'||state==='transcribing'?'取消语音对话':'与主持人语音对话';
 return <div className="voice-bubble" data-active={state!=='idle'} onClick={event=>event.stopPropagation()} onKeyDown={event=>{if(event.key==='Escape'&&state!=='idle'){event.preventDefault();event.stopPropagation();cancel();}}}>
  <button type="button" className="voice-bubble-trigger" aria-label={label} title={label} aria-pressed={state!=='idle'} disabled={props.suspended} onClick={toggle}>{state==='listening'?<Square size={18}/>:state!=='idle'?<X size={20}/>:<Mic size={21}/>}</button>
 </div>;
}
