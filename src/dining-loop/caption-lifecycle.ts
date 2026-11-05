import type {DiningDmState} from './dm-service';
import type {LogLine} from './save';

type CaptionState={visible:boolean;recording:boolean;state:DiningDmState;status:string;error:string;reply?:LogLine;heard:boolean};

/** Only terminal captions expire. Actual audio playback stays visible until drain. */
export function captionDelay({visible,recording,state,status,error,reply,heard}:CaptionState):number|null{
 if(!visible||recording||state==='connecting'||state==='thinking'||state==='speaking')return null;
 if(status)return 3500;
 if(reply?.text)return heard?1200:Math.min(16000,Math.max(5000,1200+Array.from(reply.text).length*70));
 return error?3500:reply&&!reply.complete?null:0;
}

/** Each new interaction invalidates earlier expiry callbacks, including queued ones. */
export class CaptionExpiry{
 private timer:ReturnType<typeof setTimeout>|null=null;
 private generation=0;
 schedule(delay:number|null,onExpire:()=>void){
  this.clear();if(delay===null)return;const generation=this.generation;
  this.timer=setTimeout(()=>{if(generation!==this.generation)return;this.timer=null;onExpire();},delay);
 }
 clear(){this.generation++;if(this.timer!==null)clearTimeout(this.timer);this.timer=null;}
}
