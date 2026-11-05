/** Check every text stream, including later tool replies, before releasing its PCM. */
export class ConversationOutputGate{
 constructor({check,onAccept,onReject}){this.check=check;this.onAccept=onAccept;this.onReject=onReject;this.blockedIndices=new Set();this.reset();}
 reset({newTurn=false}={}){if(newTurn)this.blockedIndices.clear();this.events=[];this.text='';this.streamText='';this.textIndex=null;this.bytes=0;this.accepted=false;this.rejected=false;this.approved=new Set();this.indices=new Set();}
 reject(problems){this.rejected=true;for(const index of this.indices)this.blockedIndices.add(index);this.events=[];this.onReject(problems);}
 release(){const held=[];for(const event of this.events){if(event.index===undefined||this.approved.has(event.index))this.onAccept(event);else held.push(event);}this.events=held;}
 push(message){
  if(this.rejected)return;
  if(message.index!==undefined&&this.blockedIndices.has(message.index)){
   if(message.type!=='ResponseStartTextStream')return;
   this.blockedIndices.delete(message.index);
  }
  if(message.index!==undefined)this.indices.add(message.index);
  this.bytes+=JSON.stringify(message).length;
  if(this.bytes>2*1024*1024){this.reject(['回复缓冲超限，请缩短回答。']);return;}
  if(message.type==='ResponseStartTextStream'){
   this.approved.delete(message.index);this.textIndex=message.index;this.streamText='';this.events.push(message);return;
  }
  if(message.type==='ResponseTextSegment'){
   if(message.index!==this.textIndex)return;
   this.streamText+=message.text||'';this.events.push(message);return;
  }
  if(message.type==='ResponseEndTextStream'){
   if(message.index!==this.textIndex)return;
   if(typeof message.text==='string'&&message.text.startsWith(this.streamText))this.streamText=message.text;
   this.text+=this.streamText;this.textIndex=null;
   const problems=this.check(this.text,false);
   if(problems.length){this.reject(problems);return;}
   this.accepted=true;this.approved.add(message.index);this.events.push(message);this.release();return;
  }
  if(message.type==='AgentEndPlay'){
   const problems=!this.accepted||this.textIndex!==null?['未收到完整回复文字，请重新回答。']:this.check(this.text,true);
   if(problems.length){this.reject(problems);return;}
   const events=this.events;this.events=[];for(const event of events)this.onAccept(event);this.onAccept(message);return;
  }
  if(this.approved.has(message.index)||message.index===undefined&&this.accepted)this.onAccept(message);
  else this.events.push(message);
 }
}
