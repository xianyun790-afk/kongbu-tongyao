import type {Ref} from 'react';
import './speech-draft.css';
type Props={controlsTarget?:HTMLElement|null;value:string;onChange:(text:string)=>void;maxLength:number;label:string;placeholder:string;id?:string;inputRef?:Ref<HTMLTextAreaElement>;suspended:boolean;context:string;onStart:()=>void;onActiveChange:(active:boolean)=>void};
/** The public Pages demo accepts text; it never requests microphone permission. */
export function SpeechDraftInput(props:Props){return <div className="speech-draft"><textarea ref={props.inputRef} id={props.id} aria-label={props.label} value={props.value} maxLength={props.maxLength} placeholder={props.placeholder.replace('，或点击语音输入…','…')} onChange={event=>props.onChange(event.target.value)}/></div>;}
