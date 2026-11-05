import {STATIC_DEMO,publicAsset} from './demo-mode';
import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {ArrowLeft,ArrowRight,BookOpen,Check,ChevronRight,DoorOpen,Download,Eye,MessageCircle,MoreHorizontal,RotateCcw,Send,Square,Volume2,VolumeX,X} from 'lucide-react';
import {SpeechDraftInput} from '@/components/SpeechDraftInput';
import {DiningRoomViewer,type TargetId,type SceneTargetId,type RoomId} from './room-viewer';
import {DiningDmSession,type DiningDmState} from './dm-service';
import {evidence,INTRO,evaluateDeduction,localDmReply,type EvidenceId} from './story';
import {freshSave,loadSave,persistSave,type LogLine,type LoopSave} from './save';
import {SceneDialogue} from './SceneDialogue';
import {VoiceBubble} from './VoiceBubble';
import {CaptionExpiry,captionDelay} from './caption-lifecycle';
import type {SceneLoadProgress} from './scene-loading';
import './dining-loop.css';

type Panel=TargetId|'journal'|'deduction'|'options'|'finish'|null;
type Feedback=ReturnType<typeof evaluateDeduction>;
const names:Record<NonNullable<Panel>,string>={radio:'墙上的旧广播',tape:'许知音的磁带',stool:'儿童小凳',duty:'旧值日表',dm:'与主持人交谈',journal:'调查手记',deduction:'把称呼找回来',options:'这次共同调查',finish:'这一轮，名字没有漏掉'};
const stateLabels:Record<DiningDmState,string>={idle:'可以继续提问',connecting:'正在接通主持人…',thinking:'主持人正在思考…',speaking:'主持人正在说话',error:'实时连接暂不可用'};
const introText=typeof INTRO==='string'?INTRO:String(INTRO);
const isAbort=(e:unknown)=>e instanceof DOMException&&e.name==='AbortError';
type EntryState='waiting'|'playing'|'done';
type OfficeTarget='ledger'|'computer'|'victim'|'coffee';
type Travel={to:RoomId;phase:'loading'|'leaving'|'arriving';error:string};
const officeNotes:Record<OfficeTarget,{title:string;body:string}>={ledger:{title:'窗下的书桌与名册',body:'窗边摊开着一册旧名册，纸页与附件还留在桌面。这里只能从场景中观察它们的位置；正式第二轮的线索仍由主持人按剧本发放。'},computer:{title:'离线的旧台机',body:'旧台机与打印机放在书桌旁。屏幕没有亮起，机身后侧留着外接线。场景预览不会播放后续记录，也不会自动判定发生过什么。'},coffee:{title:'倾倒的瓷杯',body:'瓷杯侧倒在桌面，杯口连着一小片深色饮料和几滴飞溅。这里可以近看杯沿、釉面和液体的位置；请保护现场，正式调查材料仍由主持人按轮次发放。'},victim:{title:'桌旁现场',body:'顾怀山伏在桌旁，桌沿遮住了部分身体。保持距离观察，先保护现场。这里只展示空间关系，后续核验材料尚未进入这次餐厅小谜。'}};

export default function DiningLoop(){
 const [save,setSave]=useState<LoopSave>(loadSave),[panel,setPanel]=useState<Panel>(null),[ready,setReady]=useState(false),[progress,setProgress]=useState(0),[loadError,setLoadError]=useState(''),[retry,setRetry]=useState(0);
 const [muted,setMuted]=useState(false),[dmState,setDmState]=useState<DiningDmState>('idle'),[dmError,setDmError]=useState(''),[question,setQuestion]=useState(''),[micActive,setMicActive]=useState(false),[audioBytes,setAudioBytes]=useState(0),[feedback,setFeedback]=useState<Feedback|null>(null),[notice,setNotice]=useState(''),[storageError,setStorageError]=useState(false),[localMode,setLocalMode]=useState(STATIC_DEMO),[inspection,setInspection]=useState<TargetId|null>(null);
 const [entry,setEntry]=useState<EntryState>('waiting');const entryRef=useRef<EntryState>('waiting'),sceneHeading=useRef<HTMLHeadingElement>(null),skipButton=useRef<HTMLButtonElement>(null);
 const [roomId,setRoomId]=useState<RoomId>('dining'),[travel,setTravel]=useState<Travel|null>(null),[officePanel,setOfficePanel]=useState<OfficeTarget|null>(null);
 const [officeLoad,setOfficeLoad]=useState<SceneLoadProgress>({phase:'download',loaded:0,total:0});
 const roomRef=useRef<RoomId>('dining'),travelRef=useRef<Travel|null>(null),travelToken=useRef(0),officePanelRef=useRef<OfficeTarget|null>(null),travelHandler=useRef<(room:RoomId)=>void>(()=>{});roomRef.current=roomId;travelRef.current=travel;officePanelRef.current=officePanel;
 const [voiceStatus,setVoiceStatus]=useState('');const recording=useRef(false);
 const updateMic=useCallback((value:boolean)=>{recording.current=value;setMicActive(value);},[]);
 const [dialogue,setDialogue]=useState(false),dialogueRef=useRef(false);dialogueRef.current=dialogue;
 const captionExpiry=useRef(new CaptionExpiry()),heardCaption=useRef<string|null>(null);
 const hideDialogue=useCallback(()=>{captionExpiry.current.clear();setVoiceStatus('');setDialogue(false);},[]);
 const beginDialogue=useCallback(()=>{captionExpiry.current.clear();heardCaption.current=null;setVoiceStatus('');setDialogue(true);},[]);
 const host=useRef<HTMLDivElement>(null),labels=useRef<HTMLDivElement>(null),viewer=useRef<DiningRoomViewer|null>(null),dm=useRef<DiningDmSession|null>(null),latest=useRef(save),live=useRef(true),pendingLine=useRef<string|null>(null),panelRef=useRef(panel),lastQuestion=useRef(''),body=useRef<HTMLDivElement>(null),heading=useRef<HTMLHeadingElement>(null),returnFocus=useRef<HTMLElement|null>(null);
 latest.current=save;panelRef.current=panel;
 const chat=useRef<HTMLDivElement>(null),followChat=useRef(true),feedbackView=useRef<HTMLElement>(null);
 const interrupt=useCallback(()=>{dm.current?.interrupt();pendingLine.current=null;},[]);
 const found=save.found;
 const inspecting=inspection!==null&&inspection!=='dm';
 const notify=(text:string)=>setNotice(text);
 const open=useCallback((next:Panel)=>{
  if(roomRef.current!=='dining'||travelRef.current)return;
  if(entryRef.current==='playing'||entryRef.current==='waiting'&&next!==null&&next!=='options')return;
  if(next==='dm'){
   returnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;hideDialogue();setPanel('dm');setInspection(null);return;
  }
  if(next&&document.activeElement instanceof HTMLElement)returnFocus.current=document.activeElement;
  hideDialogue();
  interrupt();setDmError('');setPanel(next);setInspection(next&&['radio','tape','stool','duty','dm'].includes(next)?next as TargetId:null);if(next==='radio')setSave(s=>s.found.includes('A01')?s:{...s,found:[...s.found,'A01']});
  if(next==='deduction')setFeedback(null);
  if(next&&['radio','tape','stool','duty','dm'].includes(next))viewer.current?.focus(next as TargetId);else viewer.current?.focus(null);
 },[interrupt,hideDialogue]);
 useEffect(()=>{
  live.current=true;
  if(STATIC_DEMO)return;
  const service=new DiningDmSession({
   onState:state=>{if(live.current){if(state==='speaking')heardCaption.current=pendingLine.current;setDmState(state);}},
   onReply:(text,complete,source)=>{
    if(!live.current||!pendingLine.current)return;const id=pendingLine.current;
    setSave(s=>({...s,log:s.log.map(line=>line.id===id?{...line,text,complete,source}:line)}));
   },
   onError:message=>{if(live.current){setDmError(message);pendingLine.current=null;}},
   onAudioReceived:bytes=>{if(live.current)setAudioBytes(bytes);},
  });dm.current=service;
  return()=>{live.current=false;service.stop();dm.current=null;};
 },[]);
 useEffect(()=>{setStorageError(!persistSave(save));},[save]);
 useEffect(()=>{dm.current?.setContext({known:save.found,sharedListening:save.sharedListening,history:save.log.filter(l=>l.complete&&l.text).map(l=>({who:l.who==='you'?'玩家':'主持人',text:l.text})).slice(-12)});viewer.current?.setFound(save.found);},[save.found,save.sharedListening]);
 useEffect(()=>{dm.current?.setMuted(muted);},[muted]);
 useEffect(()=>{
  if(!host.current||!labels.current)return;let room:DiningRoomViewer|null=null;
  travelToken.current++;travelRef.current=null;roomRef.current='dining';setRoomId('dining');setTravel(null);setOfficePanel(null);setPanel(null);setInspection(null);
  setReady(false);setProgress(0);setLoadError('');entryRef.current='waiting';setEntry('waiting');
  try{room=new DiningRoomViewer(host.current,labels.current,{onReady:()=>{setReady(true);room?.setInteractive(false);room?.setFound(latest.current.found);},onProgress:setProgress,onOfficeProgress:setOfficeLoad,onError:message=>{travelToken.current++;travelRef.current=null;setTravel(null);setOfficePanel(null);hideDialogue();interrupt();setLoadError(message);setReady(false);entryRef.current='waiting';setEntry('waiting');},onPick:(id:SceneTargetId)=>{if(id==='office-door'){travelHandler.current('office');return;}if(id==='dining-door'){travelHandler.current('dining');return;}if(id==='ledger'||id==='computer'||id==='victim'||id==='coffee'){returnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setOfficePanel(id);room?.focus(id);return;}open(id);}});viewer.current=room;}
  catch{setLoadError('当前浏览器未能开启三维画面。请开启硬件加速后重新载入。');}
  return()=>{travelToken.current++;room?.destroy();viewer.current=null;};
 },[retry,open]);
 useEffect(()=>{viewer.current?.setInteractive(save.started&&ready&&!panel&&!officePanel&&!travel&&!micActive&&entry==='done');},[save.started,ready,panel,officePanel,travel,entry,micActive]);
 useEffect(()=>{if(entry==='playing')skipButton.current?.focus({preventScroll:true});else if(entry==='done'&&!panel&&!officePanel&&!travel&&!dialogue)sceneHeading.current?.focus({preventScroll:true});},[entry,panel,officePanel,travel,dialogue,roomId]);
 useEffect(()=>{viewer.current?.inspectStoolBottom(inspection==='stool'&&save.stoolTurned);},[inspection,save.stoolTurned,ready]);
 useEffect(()=>{const previous=document.title;document.title='恐怖童谣 · 游戏 Demo';return()=>{document.title=previous;};},[]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),4500);return()=>clearTimeout(timer);},[notice]);
 useEffect(()=>{
  const key=(event:KeyboardEvent)=>{
   if(event.key==='Escape'&&travelRef.current){event.preventDefault();cancelTravel();return;}
   if(event.key==='Escape'&&roomRef.current==='office'){event.preventDefault();if(officePanelRef.current){setOfficePanel(null);viewer.current?.focus(null);}else travelHandler.current('dining');return;}
   if(entryRef.current==='playing'&&event.key==='Escape'){event.preventDefault();viewer.current?.skipEntrance();return;}
   if(dialogueRef.current&&!panelRef.current&&event.key==='Escape'){event.preventDefault();open(null);return;}
   if(!panelRef.current&&!officePanelRef.current)return;
   if(event.key==='Escape'){event.preventDefault();open(null);return;}
   if(event.key==='Tab'){
    const card=document.querySelector<HTMLElement>('.dl-card');
    const focusable=card?Array.from(card.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')).filter(el=>el.getClientRects().length>0):[];
    if(!focusable.length)return;const first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey&&(document.activeElement===first||document.activeElement===heading.current)){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
   }
  };
  document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);
 },[open]);
 useEffect(()=>{
  if(panel||officePanel){heading.current?.focus({preventScroll:true});if(body.current)body.current.scrollTop=0;}
  else if(roomRef.current==='office'&&!travelRef.current){const target=returnFocus.current;const visible=target?.isConnected&&target.getClientRects().length&&getComputedStyle(target).visibility!=='hidden'&&!target.closest('[hidden],[inert]');if(visible)target?.focus({preventScroll:true});else sceneHeading.current?.focus({preventScroll:true});}
  else if(!dialogueRef.current){const target=returnFocus.current?.isConnected?returnFocus.current:document.querySelector<HTMLButtonElement>('.voice-bubble-trigger');target?.focus({preventScroll:true});}
 },[panel,officePanel]);
 useEffect(()=>{
  if(panel!=='dm')return;followChat.current=true;
  if(chat.current)chat.current.scrollTop=chat.current.scrollHeight;
 },[panel]);
 useEffect(()=>{
  if(panel==='dm'&&chat.current&&followChat.current)chat.current.scrollTop=chat.current.scrollHeight;
 },[save.log,panel]);
 useEffect(()=>{
  if(feedback&&feedbackView.current){feedbackView.current.focus({preventScroll:true});feedbackView.current.scrollIntoView({block:'nearest'});}
 },[feedback]);
 const active=dmState==='connecting'||dmState==='thinking'||dmState==='speaking';
 const captionReply=[...save.log].reverse().find(line=>line.who==='dm'&&(line.text||!line.complete));
 useEffect(()=>{
  captionExpiry.current.schedule(captionDelay({visible:dialogue,recording:micActive,state:dmState,status:voiceStatus,error:dmError,reply:captionReply,heard:!muted&&heardCaption.current===captionReply?.id}),hideDialogue);
  return()=>captionExpiry.current.clear();
 },[dialogue,micActive,dmState,voiceStatus,dmError,captionReply?.id,captionReply?.text,captionReply?.complete,muted,hideDialogue]);
 function start(){
  if(!ready||!viewer.current||entryRef.current!=='waiting')return;
  const first=!latest.current.started;entryRef.current='playing';setEntry('playing');
  if(first&&!STATIC_DEMO)void dm.current?.prepareAudio().catch(()=>{});
  viewer.current.beginEntrance(()=>{
   if(!live.current||entryRef.current!=='playing')return;entryRef.current='done';setEntry('done');
   if(!first)return;
   const id=crypto.randomUUID();pendingLine.current=id;setDmError('');beginDialogue();
   setSave(s=>({...s,started:true,log:[...s.log,{id,who:'dm',text:introText,complete:true,source:'opening'}]}));
   if(!STATIC_DEMO)void dm.current?.speakOpening().catch(e=>{if(live.current&&!isAbort(e))setDmError(e instanceof Error?e.message:'开场语音暂不可用，可阅读上方文字继续调查。');});
  });
 }
 function cancelTravel(){
  travelToken.current++;travelRef.current=null;setTravel(null);viewer.current?.cancelOfficeLoad();viewer.current?.showRoom(roomRef.current);
 }
 async function travelTo(next:RoomId){
  if(!viewer.current||entryRef.current!=='done'||travelRef.current||next===roomRef.current)return;
  const token=++travelToken.current;interrupt();setPanel(null);setOfficePanel(null);setInspection(null);hideDialogue();setDmError('');
  const loading:Travel={to:next,phase:'loading',error:''};travelRef.current=loading;setTravel(loading);viewer.current.setInteractive(false);
  try{
   const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
   if(next==='office')await viewer.current.preloadOffice();
   if(!live.current||token!==travelToken.current||!viewer.current)return;
   const leaving:Travel={to:next,phase:'leaving',error:''};travelRef.current=leaving;setTravel(leaving);viewer.current.openConnectionDoor();
   await new Promise(resolve=>setTimeout(resolve,reduced?120:1150));
   if(!live.current||token!==travelToken.current||!viewer.current)return;
   if(!viewer.current.showRoom(next))throw new Error('房间尚未准备好，请重试。');
   roomRef.current=next;setRoomId(next);const arriving:Travel={to:next,phase:'arriving',error:''};travelRef.current=arriving;setTravel(arriving);
   await new Promise(resolve=>setTimeout(resolve,reduced?80:650));if(!live.current||token!==travelToken.current)return;
   travelRef.current=null;setTravel(null);sceneHeading.current?.focus({preventScroll:true});
  }catch(error){if(live.current&&token===travelToken.current){const failed:Travel={to:next,phase:'loading',error:error instanceof Error?error.message:'值班室暂未打开。'};travelRef.current=failed;setTravel(failed);}}
 }
 travelHandler.current=next=>{void travelTo(next);};
 function replayEntrance(){interrupt();hideDialogue();setPanel(null);setInspection(null);entryRef.current='waiting';setEntry('waiting');viewer.current?.showEntrance();start();}
 function restart(){interrupt();hideDialogue();setSave(freshSave());setQuestion('');setFeedback(null);setLocalMode(STATIC_DEMO);setPanel(null);setInspection(null);entryRef.current='waiting';setEntry('waiting');viewer.current?.showEntrance();}
 function showHistory(){returnFocus.current=document.querySelector<HTMLButtonElement>('.voice-bubble-trigger');hideDialogue();setPanel('dm');setInspection(null);viewer.current?.focus(null);}
 async function ask(text=question){
  text=text.trim();if(!text||recording.current||roomRef.current!=='dining'||travelRef.current)return;beginDialogue();interrupt();setDmError('');lastQuestion.current=text;
  const id=crypto.randomUUID(),history=latest.current.log.filter(l=>l.complete&&l.text).map(l=>({who:l.who==='you'?'玩家':'主持人',text:l.text}));
  const lines:LogLine[]=[{id:crypto.randomUUID(),who:'you',text,complete:true},{id,who:'dm',text:'',complete:false,source:localMode?'local-guidance':'ai'}];
  pendingLine.current=id;setSave(s=>({...s,log:[...s.log.filter(l=>l.text),...lines].slice(-40)}));setQuestion('');
  if(localMode){const reply=localDmReply(text,latest.current.found);setSave(s=>({...s,log:s.log.map(l=>l.id===id?{...l,text:reply,complete:true}:l)}));pendingLine.current=null;return;}
  dm.current?.setContext({known:latest.current.found,sharedListening:latest.current.sharedListening,history});
  // Context changes cancel an older turn, so bind the new line after updating.
  pendingLine.current=id;
  try{await dm.current?.sendText(text);}catch(e){if(!isAbort(e))setDmError(e instanceof Error?e.message:'暂时未能连接AI DM。');}
 }
 function shareTape(){
  interrupt();setSave(s=>({...s,sharedListening:true,found:s.found.includes('A02')?s.found:[...s.found,'A02']}));notify('A02 已按本轮共同检听约定记入公共手记。');
 }
 function turnStool(){setSave(s=>({...s,stoolTurned:true,found:s.found.includes('A03')?s.found:[...s.found,'A03']}));notify('A03 已记入手记，可与同组的旧值日表核对。');}
 function submit(){interrupt();const result=evaluateDeduction(save.answer,save.citations,save.found);setFeedback(result);setSave(s=>({...s,complete:result.ok}));if(result.ok){notify('本轮推理完成。可以查看阶段记录。');}}
 function exportNotes(){
  const blob=new Blob([JSON.stringify({title:'恐怖童谣 · 把称呼找回来',appVersion:'0.1.0-r15-pages',...save,publicEvidence:evidence.filter(e=>found.includes(e.id))},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='白榆餐厅-共同调查手记.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
 }
 const evidenceCard=(id:EvidenceId)=>{const item=evidence.find(e=>e.id===id)!;return <article className="dl-evidence" key={id}><small>{id} · {item.source}</small><h3>{item.title}</h3><p>{item.body}</p></article>;};
 const action=(text:string,fn:()=>void,primary=false,disabled=false)=><button type="button" className={primary?'dl-primary':'dl-action'} disabled={disabled} onClick={fn}>{text}<ArrowRight size={16}/></button>;
 let content:ReactNode=null;
 if(panel==='radio')content=<>{evidenceCard('A01')}<div className="dl-recording"><span>A01 / 广播副本</span><p>「阿秋、时安、周叙、知音、程野、唐棠。」</p><div className="dl-sound-gap">底噪中断 · 短暂空缺</div><p>「……把凳子搬过来。」</p></div><p className="dl-small">声音证据以剧本文字展示，保留停顿和顺序。</p>{action(found.includes('A02')?'对照已经公开的磁带':'去看许知音的磁带',()=>open('tape'))}{action('记下疑问，回到现场',()=>open(null),true)}</>;
 if(panel==='tape')content=<>{!save.sharedListening?<><div className="dl-tag">私人携带物 · 外观可见</div><p className="dl-reading">播放器和磁带盒上有“许携带”的纸签。此刻，盒中的内容还没有成为公共线索。</p><div className="dl-note"><strong>本轮试玩的共同检听约定</strong><p>这一小段体验采用剧本中的共同检听事件。由你主动开始后，才把 A02 的等价文字加入公共手记。</p></div>{action('开始本轮约定的共同检听',shareTape,true)}<p className="dl-small">这是试玩的公开材料设置，不代表代替真人角色作出分享决定。</p></>:<>{evidenceCard('A02')}<div className="dl-recording"><span>A02 / 原磁带</span><p>「小满，把凳子搬过来。」</p><small>后接呼吸与椅脚摩擦声。</small></div>{found.includes('A01')&&<div className="dl-compare"><h3>对齐最后一句</h3><p><span>广播副本</span>〔空缺〕，把凳子搬过来。</p><p><span>原磁带</span><mark>小满</mark>，把凳子搬过来。</p><small>两份相同的尾音、呼吸与椅脚声，是比对的依据。</small></div>}{action('继续调查',()=>open(null),true)}</>}</>;
 if(panel==='stool'||panel==='duty')content=<>{!save.stoolTurned?<><div className="dl-tag">同组线索 A03 · 生活旧物</div><p className="dl-reading">六把成人椅之外，还有一张儿童小凳。旧漆磨薄了，底面似乎留着刻痕。</p>{panel==='duty'&&<p className="dl-reading">餐柜上的旧值日表保留着七人轮值的生活记录。小凳底面的刻字，还需要亲手确认。</p>}{action('翻看凳底刻痕',turnStool,true)}</>:<><div className="dl-carving">小 满<small>儿童小凳 · 底面旧刻字</small></div>{evidenceCard('A03')}<details className="dl-details"><summary>展开同组的旧值日记录</summary><p>同一张生活记录上，六个熟悉的称呼之外，还有第七人的位置；它与凳底留下的称呼互相印证。</p>{action(panel==='duty'?'回到小凳旁':'近看餐柜旧值日表',()=>open(panel==='duty'?'stool':'duty'))}</details>{action('记下发现，回到现场',()=>open(null),true)}</>}</>;
 if(panel==='dm')content=<><div className="dl-dm-status" data-state={dmState}><i/>{localMode?'文字主持 · 预设提示':stateLabels[dmState]}{active&&<button onClick={interrupt}><Square size={13}/>停止回应</button>}</div><p className="dl-small">在线 Demo 使用预设文字提示，只依据你已经公开的材料。输入问题后确认发送。</p><div className="dl-chat" ref={chat} onScroll={event=>{const el=event.currentTarget;followChat.current=el.scrollHeight-el.scrollTop-el.clientHeight<64;}} aria-live="polite" aria-relevant="additions text" data-audio-bytes={audioBytes}>{save.log.filter(l=>l.text||!l.complete&&active&&l.id===pendingLine.current).map(line=><article key={line.id} className={line.who==='you'?'is-you':''}><small>{line.who==='you'?'你':line.source==='opening'?'主持人 · 开场':line.source==='local-guidance'?'本地主持提示':'AI DM'}{line.who==='dm'&&!line.complete&&line.text&&(!active||line.id!==pendingLine.current)?' · 回应未完成':''}</small><p>{line.text||'正在组织回应…'}</p>{!line.complete&&line.text&&active&&line.id===pendingLine.current&&<span className="dl-stream-cursor"/>}</article>)}</div>{dmError&&<div className="dl-error" role="alert"><p>{dmError}</p><div>{lastQuestion.current&&<button onClick={()=>void ask(lastQuestion.current)}>重试这一问</button>}<button onClick={()=>{interrupt();setLocalMode(true);setDmError('');notify('已切换本地主持提示，预设反馈不会冒充AI回应。');}}>使用本地主持提示</button></div></div>}<div className="dl-suggestions">{['我现在该查什么？',found.length>=2?'这些材料能支持什么？':'怎样核对广播里的空缺？'].map(q=><button key={q} disabled={active||micActive} onClick={()=>void ask(q)}>{q}<ChevronRight size={13}/></button>)}</div><form onSubmit={e=>{e.preventDefault();void ask();}}><SpeechDraftInput value={question} onChange={setQuestion} maxLength={600} label="向主持人提问的草稿" placeholder="写下问题，或点击语音输入…" suspended={false} context={`dining-loop-dm-${localMode?'local':'ai'}`} onStart={interrupt} onActiveChange={updateMic}/><button className="dl-primary" disabled={!question.trim()||micActive} type="submit"><Send size={15}/>确认提问</button></form><div className="dl-dm-tools">{!STATIC_DEMO&&<button onClick={()=>{interrupt();setLocalMode(!localMode);setDmError('');}}>{localMode?'切回实时 AI DM':'使用本地主持提示'}</button>}{action('回到现场',()=>open(null))}</div></>;
 if(panel==='journal')content=<><p className="dl-reading">{found.length===0?'先从场景里找一件让你在意的旧物。':`你已公开 ${found.length} 组材料，随时可以回看和交叉核对。`}</p>{evidence.map(item=>found.includes(item.id)?<div className="dl-journal-entry" key={item.id}>{evidenceCard(item.id)}<button onClick={()=>open(item.id==='A01'?'radio':item.id==='A02'?'tape':'stool')}>回到物件旁<ChevronRight size={14}/></button></div>:<div className="dl-unfound" key={item.id}><span>{item.id}</span>尚未公开</div>)}{action('提出这一轮的判断',()=>open('deduction'),true)}<button className="dl-text-button" onClick={exportNotes}><Download size={14}/>导出当前手记</button></>;
 if(panel==='deduction')content=<><p className="dl-reading">广播缺失了哪个称呼？两份声音和生活旧物，分别怎样支持你的判断？</p><SpeechDraftInput value={save.answer} onChange={answer=>{setSave(s=>({...s,answer,complete:false}));setFeedback(null);}} maxLength={600} label="本轮推理草稿" placeholder="我认为缺失的称呼是…；我依据的是…" suspended={false} context="dining-loop-deduction" onStart={interrupt} onActiveChange={updateMic}/><fieldset className="dl-citations"><legend>选择要引用的已公开材料</legend>{evidence.map(item=><label key={item.id} className={!found.includes(item.id)?'is-locked':''}><input type="checkbox" disabled={!found.includes(item.id)} checked={save.citations.includes(item.id)} onChange={()=>{setFeedback(null);setSave(s=>({...s,complete:false,citations:s.citations.includes(item.id)?s.citations.filter(id=>id!==item.id):[...s.citations,item.id]}));}}/><span><small>{item.id}{!found.includes(item.id)?' · 尚未公开':''}</small>{item.title}</span></label>)}</fieldset><button className="dl-primary" disabled={!save.answer.trim()||micActive} onClick={submit}>提交这一轮判断<ArrowRight size={16}/></button>{feedback&&<section ref={feedbackView} tabIndex={-1} className={`dl-feedback ${feedback.ok?'is-success':''}`} role="status"><h3>{feedback.title}</h3><p>{feedback.body}</p>{feedback.supported.length>0&&<ul>{feedback.supported.map(text=><li key={text}><Check size={14}/>{text}</li>)}</ul>}{feedback.missing.length>0&&<div className="dl-missing"><small>还可以补上</small>{feedback.missing.map(text=><p key={text}>{text}</p>)}</div>}{feedback.ok?action('查看本轮成果',()=>open('finish'),true):action('带着问题，继续调查',()=>open(null))}</section>}</>;
 if(panel==='finish')content=<><div className="dl-result-mark"><Check size={28}/></div><h3 className="dl-result-title">找回称呼：小满</h3><p className="dl-reading">你用广播与原带的差异找到了缺口，再用生活记录确认：这个称呼曾经属于这里的一个孩子。</p><div className="dl-results"><p><Check size={16}/>比对了同一段旧声音</p><p><Check size={16}/>把称呼与生活旧物对应起来</p><p><Check size={16}/>完成一次有依据的判断</p></div><p className="dl-small">本次餐厅共同调查到这里结束。你可以继续环顾、重看材料或询问主持人。后续案情不在本试玩范围内。</p>{action('导出这一轮手记',exportNotes,true)}{action('继续留在餐厅',()=>open(null))}</>;
 if(panel==='options')content=<><p className="dl-reading">《恐怖童谣》游戏 Demo，约 5–10 分钟。先在白榆餐厅完成“找回称呼”的小谜，再探索值班室场景。</p><div className="dl-note"><strong>真实 3D 场景 · 在线文字试玩</strong><p>拖动环顾，滚轮缩放，点击场景光点或物件近看。三个调查组可以自由选择顺序。此公开 Demo 使用预设文字主持，不采集麦克风；实时 AI 和语音需另接服务。</p></div><div className="dl-object-directory"><h3>物件目录</h3>{(['radio','tape','stool','duty','dm'] as TargetId[]).map(id=><button key={id} disabled={!save.started||entry!=='done'} onClick={()=>open(id)}>{names[id]}<ArrowRight size={14}/></button>)}</div>{action('经过大厅和楼梯，前往二楼值班室',()=>void travelTo('office'),false,!save.started||entry!=='done')}<p className="dl-small">值班室目前提供三维场景预览，正式第二轮尚未接入这次小谜。</p><p className="dl-small">真人角色剧本单独分发。这个公共试玩不载入私人剧本与后续答案；AI DM不替真人作角色决定。</p><button className="dl-action" onClick={exportNotes}><Download size={15}/>导出手记</button>{save.started&&entry==='done'&&action('重看开门转场',replayEntrance)}<details className="dl-details"><summary>重新体验这个小谜</summary><p>只重置这次试玩的本机进度。可以先导出手记。</p>{action('确认重开这次试玩',restart)}</details><details className="dl-details"><summary>素材来源与署名</summary><p>人物模型：<a href="https://sketchfab.com/3d-models/eric-rigged-001-rigged-3d-business-man-a46bc9f67aaa415bb4f3241eef900e7f" target="_blank" rel="noreferrer">Eric Rigged 001 / Renderpeople</a>，采用<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer"> CC BY 4.0 </a>许可。为虚构角色调整了姿势、材质与网页细节。窗外夜景、旧灰泥与瓷杯采用 Poly Haven 的 CC0 素材，咖啡颜色与细微湿润变化采用 CC0 纹理。<a href={publicAsset('models/dining-loop/ASSET-CREDITS.txt')} target="_blank" rel="noreferrer">查看完整署名</a></p></details><a className="dl-old-link" href="https://github.com/xianyun790-afk/kongbu-tongyao" target="_blank" rel="noreferrer">制作思路与项目源码<ArrowRight size={14}/></a></>;
 return <main className="dining-loop" data-room={roomId} data-travel={Boolean(travel)} data-travel-phase={travel?.phase} data-panel={Boolean(panel||officePanel)} data-started={save.started} data-entering={entry==='playing'} data-dialogue={dialogue&&!panel}>
  <div className="dl-stage" inert={Boolean(panel||officePanel||travel)||micActive||entry!=='done'}><div className="dl-canvas" ref={host}/><div className="dl-labels" ref={labels}/><div className="dl-edge-shade"/></div>
  <header className="dl-header" inert={entry==='playing'||Boolean(travel)}><div className="dl-brand"><span>恐怖童谣</span><small>{roomId==='dining'?'餐厅 · 共同调查':'二楼值班室 · 场景预览'}</small></div><div className="dl-header-actions"><button onClick={()=>open('journal')} disabled={!save.started||entry!=='done'||roomId!=='dining'}><BookOpen size={16}/><span>手记</span><small>{found.length}/3</small></button>{!STATIC_DEMO&&<button aria-label={muted?'开启主持语音':'静音主持语音'} aria-pressed={muted} onClick={()=>setMuted(!muted)}>{muted?<VolumeX size={17}/>:<Volume2 size={17}/>}</button>}<button aria-label="试玩说明与物件目录" disabled={roomId!=='dining'} onClick={()=>open('options')}><MoreHorizontal size={20}/></button></div></header>
  {!ready&&<div className="dl-loading" role="status">{loadError?<><h2>三维场景暂时没有打开</h2><p>{loadError}</p><button className="dl-primary" onClick={()=>setRetry(n=>n+1)}>重新载入三维场景<RotateCcw size={15}/></button></>:<><span>正在走进白榆餐厅</span><div className="dl-loading-track"><i style={{width:`${Math.round(progress*100)}%`}}/></div><small>{Math.round(progress*100)}% · 正在载入真实三维物件</small></>}</div>}
  {ready&&entry==='waiting'&&!panel&&<section className="dl-intro" aria-label="试玩前情"><div className="dl-eyebrow">游戏 Demo / 5–10 分钟</div><h1>{save.started?<>门后的灯，<br/>还为你亮着。</>:<>有个称呼，<br/>被留在了空白里。</>}</h1><p>{save.started?<>你的调查手记仍在。<br/>推开门，回到刚才的餐厅。</>:<>二十年后，六个人重回白榆。<br/>旧广播叫出了熟悉的名字，<br/>最后一句之前，却少了一小段。</>}</p><div className="dl-intro-rule"/><p className="dl-intro-task">{save.started?`已公开 ${found.length} / 3 组材料，继续寻找遗漏的称呼。`:<>在餐厅里找三组旧物，<br/>把漏掉的称呼找回来。</>}</p><button className="dl-primary" onClick={start}>{save.started?'推开门，继续调查':'推开门，进入餐厅'}<ArrowRight size={17}/></button><small>{save.started?'调查进度已保留；入场动画可以跳过。':'在线文字试玩 · 主持提示和对话可在记录里回看。'}</small></section>}
  {ready&&entry==='playing'&&<div className="dl-entry-controls"><span role="status">门后的餐厅，灯还亮着。</span><button ref={skipButton} onClick={()=>viewer.current?.skipEntrance()}>跳过转场<ChevronRight size={15}/></button></div>}
  {ready&&save.started&&entry==='done'&&!panel&&roomId==='dining'&&!travel&&<><div className="dl-objective"><small>{save.complete?'本轮已完成':'这一轮只解一个小谜'}</small><h1 ref={sceneHeading} tabIndex={-1}>{save.complete?'这次，名字没有漏掉。':'广播里，少了哪个称呼？'}</h1></div><footer className="dl-bottom"><span>拖动环顾 · 点击物件近看</span><nav><button className="dl-room-link" onClick={()=>void travelTo('office')}><DoorOpen size={15}/><span>去值班室</span></button><button onClick={showHistory}><MessageCircle size={16}/>对话记录</button><button className="dl-judge" onClick={()=>open(save.complete?'finish':'deduction')}>{save.complete?'查看本轮成果':'提出判断'}<ArrowRight size={16}/></button></nav></footer></>}
  {ready&&entry==='done'&&dialogue&&!panel&&roomId==='dining'&&!travel&&<SceneDialogue log={save.log} state={dmState} error={dmError} localMode={localMode} status={voiceStatus}/>}
  {ready&&entry==='done'&&save.started&&<div hidden={Boolean(panel||travel)||roomId!=='dining'}>{STATIC_DEMO?<div className="voice-bubble"><button className="voice-bubble-trigger" type="button" aria-label="向文字主持提问" title="向文字主持提问" onClick={showHistory}><MessageCircle size={21}/></button></div>:<VoiceBubble suspended={Boolean(panel||travel)||roomId!=='dining'} onStart={()=>{interrupt();setDmError('');beginDialogue();}} onCancel={hideDialogue} onAsk={text=>void ask(text)} onActiveChange={updateMic} onStatus={setVoiceStatus}/>}</div>}
  {ready&&entry==='done'&&roomId==='office'&&!travel&&!officePanel&&<>
   <div className="dl-objective"><small>二楼中央 · 场景预览</small><h1 ref={sceneHeading} tabIndex={-1}>值班室</h1></div>
   <footer className="dl-bottom"><span>拖动环顾 · 点击光点近看 · 正式线索由 DM 发放</span><nav><button onClick={()=>viewer.current?.focus(null)}><RotateCcw size={15}/>恢复视角</button><button className="dl-judge" onClick={()=>void travelTo('dining')}><ArrowLeft size={15}/>返回餐厅</button></nav></footer>
  </>}
  {travel&&<div className="dl-room-travel" data-phase={travel.phase} role="status" aria-live="polite"><div><small>白榆儿童之家</small><p>{travel.phase==='loading'&&travel.to==='office'?'正在打开二楼值班室':travel.to==='office'?'餐厅 → 大厅 → 主楼梯 → 二楼值班室':'二楼值班室 → 主楼梯 → 大厅 → 餐厅'}</p>{travel.error?<><span>{travel.error}</span><div className="dl-route-actions"><button onClick={()=>{const next=travel.to;cancelTravel();void travelTo(next);}}>重试</button><button onClick={cancelTravel}>留在当前房间</button></div></>:travel.phase==='loading'&&travel.to==='office'?<><div className="dl-loading-track" role="progressbar" aria-label="二楼场景下载进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={officeLoad.total?Math.min(100,Math.round(officeLoad.loaded/officeLoad.total*100)):undefined}><i style={{width:officeLoad.total?Math.min(100,Math.round(officeLoad.loaded/officeLoad.total*100))+'%':'0%'}}/></div><span>{officeLoad.phase==='decode'?'资源已下载，正在还原三维场景…':officeLoad.phase==='ready'?'场景已准备好，即将进入。':officeLoad.total?(officeLoad.loaded/1048576).toFixed(1)+' / '+(officeLoad.total/1048576).toFixed(1)+' MB · 正在下载':'正在连接二楼场景…'}</span><span className="dl-load-note">首次进入需要下载场景；你的调查进度会保留。</span></>:<span>{travel.phase==='arriving'?'到了。':travel.to==='office'?'推开餐厅门，沿主楼梯上楼。':'沿楼梯下楼，回到长桌旁。'}</span>}</div>{!travel.error&&travel.phase!=='arriving'&&<button className="dl-route-cancel" onClick={cancelTravel}>取消 · 留在当前房间 · Esc</button>}</div>}
  {officePanel&&!travel&&<><div className="dl-card-backdrop" aria-hidden="true" onClick={()=>setOfficePanel(null)}/><section className="dl-card" role="dialog" aria-modal="true" aria-labelledby="dl-office-title"><header className="dl-card-header"><div><span>BAIYU / DUTY OFFICE · PREVIEW</span><h2 id="dl-office-title" tabIndex={-1} ref={heading}>{officeNotes[officePanel].title}</h2></div><button aria-label="关闭卡片" onClick={()=>setOfficePanel(null)}><X size={20}/></button></header><div className="dl-card-body" ref={body}><p className="dl-reading">{officeNotes[officePanel].body}</p></div><footer className="dl-card-footer"><button onClick={()=>setOfficePanel(null)}><Eye size={14}/>收起卡片，近看实物</button><button onClick={()=>{setOfficePanel(null);viewer.current?.focus(null);}}><ArrowLeft size={14}/>回到房间视角</button></footer></section></>}
  {panel&&<><div className="dl-card-backdrop" aria-hidden="true" onClick={()=>open(null)}/><section className="dl-card" data-kind={panel} role="dialog" aria-modal="true" aria-labelledby="dl-card-title"><header className="dl-card-header"><div><span>{panel==='dm'?'PUBLIC CHANNEL / DM':panel==='deduction'?'YOUR DEDUCTION':panel==='finish'?'ROUND COMPLETE':panel==='journal'?'FIELD NOTES':'BAIYU / DINING ROOM'}</span><h2 id="dl-card-title" ref={heading} tabIndex={-1}>{names[panel]}</h2></div><button aria-label="关闭卡片，回到现场" onClick={()=>open(null)}><X size={20}/></button></header><div className="dl-card-body" ref={body}>{content}</div><footer className="dl-card-footer"><button onClick={()=>open(null)}><ArrowLeft size={14}/>回到现场</button>{inspecting?<button onClick={()=>{interrupt();setPanel(null);}}><Eye size={14}/>收起卡片，近看实物</button>:<span>{found.length} / 3 组材料已公开</span>}</footer></section></>}
  {!panel&&roomId==='dining'&&!travel&&inspection&&save.started&&ready&&entry==='done'&&<button className="dl-scene-return" onClick={()=>open(null)}><ArrowLeft size={15}/>回到初始视角</button>}
  {notice&&<div className="dl-notice" role="status">{notice}</div>}{storageError&&<div className="dl-save-warning" role="status">浏览器未能保存进度，请在离开前导出手记。</div>}
 </main>;
}
