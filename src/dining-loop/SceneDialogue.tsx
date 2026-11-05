import {useRef,useEffect} from 'react';
import {AudioLines} from 'lucide-react';
import type {LogLine} from './save';
import type {DiningDmState} from './dm-service';
import './scene-dialogue.css';

type Props={log:LogLine[];state:DiningDmState;error:string;localMode:boolean;status:string};

/** A small scene caption. All input belongs to the separate voice bubble. */
export function SceneDialogue({log,state,error,localMode,status}:Props){
 const caption=useRef<HTMLDivElement>(null);
 const reply=[...log].reverse().find(line=>line.who==='dm'&&(line.text||!line.complete));
 const question=[...log].reverse().find(line=>line.who==='you');
 const active=state==='connecting'||state==='thinking'||state==='speaking';
 const waiting=state==='connecting'?'正在接通主持人…':state==='thinking'?'主持人正在整理这条线索…':'点击语音气泡，和主持人聊聊。';
 const pending=error?'实时主持暂不可用，可继续调查或在对话记录中查看详情。':waiting;
 const text=status||reply?.text||`${question?`你：${question.text}\n`:''}${pending}`;
 const prefix=status?'':reply?.source==='local-guidance'?'〔本地主持提示 · 预设文本〕':error&&reply?.text?'〔语音暂不可用〕':'';
 useEffect(()=>{if(caption.current)caption.current.scrollTop=active?caption.current.scrollHeight:0;},[reply?.id,text,active]);
 return <section className="scene-dialogue" aria-label="主持人回复" data-active={state==='speaking'&&!localMode}>
  <span className="scene-dialogue-voice" aria-hidden="true"><AudioLines size={22}/></span>
  <div ref={caption} className="scene-dialogue-caption" tabIndex={0} aria-label="主持人输出文字" aria-live={status||reply?.complete||error?'polite':'off'} aria-busy={active&&!reply?.complete}><p>{prefix}{text}</p></div>
 </section>;
}
