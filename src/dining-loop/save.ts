import {evaluateDeduction,type EvidenceId} from './story';
export type LogLine={id:string;who:'you'|'dm';text:string;source?:'ai'|'opening'|'local-guidance';complete:boolean};
export type LoopSave={version:1;started:boolean;found:EvidenceId[];sharedListening:boolean;stoolTurned:boolean;answer:string;citations:EvidenceId[];complete:boolean;log:LogLine[]};
const qa=new URLSearchParams(location.search).get('qa')?.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,64);
export const SAVE_KEY='baiyu-dining-loop-v0.1'+(qa?'-qa-'+qa:'');
export type PlayMode='solo'|'group';
export const saveKey=(mode:PlayMode='solo')=>SAVE_KEY+(mode==='group'?'-group':'');
export function loadPlayMode():PlayMode{try{return localStorage.getItem(SAVE_KEY+'-mode')==='group'?'group':'solo';}catch{return 'solo';}}
export function rememberPlayMode(mode:PlayMode){try{localStorage.setItem(SAVE_KEY+'-mode',mode);}catch{/* Progress writes report storage errors separately. */}}
const ids=new Set(['A01','A02','A03']);
export const freshSave=():LoopSave=>({version:1,started:false,found:[],sharedListening:false,stoolTurned:false,answer:'',citations:[],complete:false,log:[]});
export function loadSave(mode:PlayMode='solo'):LoopSave{
 try{
  const p=JSON.parse(localStorage.getItem(saveKey(mode))||'null');if(!p||p.version!==1)return freshSave();
  const shared=p.sharedListening===true,stool=p.stoolTurned===true;
  const found:EvidenceId[]=Array.isArray(p.found)?[...new Set<string>(p.found.filter((id:unknown)=>typeof id==='string'&&ids.has(id)))].filter(id=>(id!=='A02'||shared)&&(id!=='A03'||stool)) as EvidenceId[]:[];
  const answer=typeof p.answer==='string'?p.answer.slice(0,600):'';
  const citations:EvidenceId[]=Array.isArray(p.citations)?p.citations.filter((id:EvidenceId)=>found.includes(id)):[];
  return {version:1,started:p.started===true,found,sharedListening:shared,stoolTurned:stool,
   answer,citations,
   complete:p.complete===true&&evaluateDeduction(answer,citations,found).ok,
   log:Array.isArray(p.log)?p.log.filter((l:LogLine)=>l&&(l.who==='you'||l.who==='dm')&&typeof l.text==='string'&&(l.who==='you'||l.complete===true)).slice(-40).map((l:LogLine)=>({id:typeof l.id==='string'?l.id:crypto.randomUUID(),who:l.who,text:l.text.slice(0,1600),complete:l.complete===true,source:['ai','opening','local-guidance'].includes(l.source||'')?l.source:undefined})):[]};
 }catch{return freshSave();}
}
export function persistSave(save:LoopSave,mode:PlayMode='solo'){try{localStorage.setItem(saveKey(mode),JSON.stringify({...save,log:save.log.filter(l=>l.text&&(l.who==='you'||l.complete)).slice(-40)}));return true;}catch{return false;}}
