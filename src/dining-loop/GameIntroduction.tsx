import {useEffect,useId,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Check,CheckCheck,Copy,Download,Users,X} from 'lucide-react';
import {groupSteps,publicRoles,roleClaimText} from './public-onboarding';
import './game-introduction.css';

export type EntryMode='solo'|'group';
type GuidePage='steps'|'roles'|'ready';

export interface GameIntroductionProps {
  hasSave:boolean;
  foundCount:number;
  groupHasSave?:boolean;
  groupFoundCount?:number;
  initialView?:'intro'|'group';
  onEnter:(mode:EntryMode)=>void;
  /** When provided, this is a read-only guide opened over an active scene. */
  onClose?:()=>void;
}

const guidePages:{id:GuidePage;label:string}[]=[{id:'steps',label:'怎么开团'},{id:'roles',label:'六位旧友'},{id:'ready',label:'进入前确认'}];
const checks=['六人角色互不重复，每人已私收自己的第一轮短本','共同语音已接通，大家能看到同一块游戏屏幕','组织者已准备第一轮资料，并能记录实际公开的材料'];

export function GameIntroduction({hasSave,foundCount,groupHasSave=false,groupFoundCount=0,initialView='intro',onEnter,onClose}:GameIntroductionProps){
  const [guide,setGuide]=useState(initialView==='group'),[page,setPage]=useState<GuidePage>('steps');
  const [roleId,setRoleId]=useState<string>(''),[copyState,setCopyState]=useState<'idle'|'done'|'failed'>('idle');
  const [confirmed,setConfirmed]=useState([false,false,false]);
  const entrySection=useRef<HTMLElement>(null),primaryEntry=useRef<HTMLButtonElement>(null),groupTrigger=useRef<HTMLButtonElement>(null),dialog=useRef<HTMLDivElement>(null),guideHeading=useRef<HTMLHeadingElement>(null),guideBody=useRef<HTMLDivElement>(null);
  const initialFocus=useRef<HTMLElement|null>(null),titleId=useId(),scopeId=useId();
  const selectedRole=publicRoles.find(role=>role.id===roleId);
  const claim=selectedRole?roleClaimText(selectedRole.name):'';
  const allReady=confirmed.every(Boolean);
  const publicGuide=import.meta.env.BASE_URL+'play-kit/round-one-public-v0.2.0.zip';
  const scriptPreview=import.meta.env.BASE_URL+'script/';

  useEffect(()=>{
    if(!guide)return;
    initialFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
    guideHeading.current?.focus({preventScroll:true});
    const handleKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(onClose)onClose();else setGuide(false);return;}
      if(event.key!=='Tab')return;
      const items=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),[tabindex="0"]')??[]).filter(el=>el.getClientRects().length>0);
      if(!items.length)return;
      const first=items[0],last=items[items.length-1];
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===guideHeading.current)){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===guideHeading.current)){event.preventDefault();first.focus();}
      else if(!dialog.current?.contains(document.activeElement)){event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',handleKey,true);
    return()=>{document.removeEventListener('keydown',handleKey,true);const target=initialFocus.current;requestAnimationFrame(()=>{if(target?.isConnected&&target.getClientRects().length)target.focus({preventScroll:true});else groupTrigger.current?.focus({preventScroll:true});});};
  },[guide]);

  useEffect(()=>{
    if(guide)return;
    primaryEntry.current?.focus({preventScroll:true});
    const handleKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();onClose?.();return;}
      if(event.key!=='Tab')return;
      const items=Array.from(entrySection.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href]')??[]);
      if(!items.length)return;
      const first=items[0],last=items[items.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      else if(!entrySection.current?.contains(document.activeElement)){event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',handleKey,true);
    return()=>document.removeEventListener('keydown',handleKey,true);
  },[guide]);

  useEffect(()=>{if(guideBody.current)guideBody.current.scrollTop=0;},[page]);

  async function copyClaim(){
    try{await navigator.clipboard.writeText(claim);setCopyState('done');}
    catch{setCopyState('failed');}
  }

  function openGuide(){setPage('steps');setGuide(true);}
  function changePage(next:GuidePage){setPage(next);}
  function closeGuide(){if(onClose)onClose();else setGuide(false);}

  return <div className="game-introduction">
    <section ref={entrySection} className="gi-entry" aria-label="进入白榆餐厅前" hidden={guide}>
      <div className="gi-entry-content">
        <p className="gi-overline"><span/>白榆儿童之家 · 第一轮试玩</p>
        <h1>{hasSave?'回到那张':'再坐回'}<br/>{hasSave?'旧餐桌。':'旧餐桌。'}</h1>
        <div className="gi-prologue">
          <p>二十年后，白榆即将拆除。<br/>一封匿名邀请，让六位旧友再次回到这里。</p>
          <p>前院长承诺交出原始档案，墙上的广播却先响了。<br className="gi-wide-break"/>最后一句之前，留下了一小段不自然的空白。</p>
        </div>
        <div className="gi-mission">
          <span className="gi-section-label">{hasSave?'这一轮的共同调查':'这一轮，先弄清一件事'}</span>
          <p>{hasSave&&foundCount>=3?'回看共同检听与公共材料，整理你们的判断和依据。':'录音里，究竟漏掉了哪个称呼？'}</p>
        </div>
        <p className="gi-solo-note">独自体验无需选角。你以共同调查视角查看物件、核对材料，约 5–10 分钟。</p>
        {hasSave&&<p className="gi-save-note">本机单人记录 · 已查看 {Math.min(3,Math.max(0,foundCount))}/3 组公共材料</p>}
        <div className="gi-entry-actions">
          {onClose?<button ref={primaryEntry} className="gi-button gi-button-primary" onClick={onClose}>返回当前现场<ArrowRight size={17}/></button>:<button ref={primaryEntry} className="gi-button gi-button-primary" onClick={()=>onEnter('solo')}>{hasSave?'推开门，继续调查':'推开门，进入餐厅'}<ArrowRight size={17}/></button>}
          <button ref={groupTrigger} className="gi-button gi-button-secondary" onClick={openGuide}><Users size={16}/>六人开团与角色</button>
        </div>
        <p className="gi-entry-scope">当前在线主持为预设文字 · 二楼值班室仅为场景预览</p>
        <a className="gi-script-preview" href={scriptPreview}>完整剧本与六人角色预览<ArrowRight size={14}/></a>
      </div>
    </section>

    {guide&&<div className="gi-guide-overlay">
      <div ref={dialog} className="gi-guide" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={scopeId}>
        <p id={scopeId} className="gi-sr-only">六名真人使用共同语音与一块共享屏幕游玩。当前没有多人同步，在线主持使用预设文字，个人剧本由组织者私发。</p>
        <header className="gi-guide-header">
          <div><p className="gi-overline">把角色留给真人，把现场交给大家</p><h2 id={titleId} ref={guideHeading} tabIndex={-1}>六人，回到白榆</h2></div>
          <button className="gi-icon-button" onClick={closeGuide} aria-label={onClose?'关闭说明，返回当前现场':'关闭六人开团说明'}><X size={20}/></button>
        </header>
        <nav className="gi-guide-nav" aria-label="开团说明章节">{guidePages.map((item,index)=><button key={item.id} aria-current={page===item.id?'page':undefined} onClick={()=>changePage(item.id)}><span>0{index+1}</span>{item.label}</button>)}</nav>
        <div ref={guideBody} className="gi-guide-body">
          {page==='steps'&&<section aria-label="开团流程">
            <div className="gi-guide-intro"><h3>今夜，为什么回到这里？</h3><p>白榆即将拆除，一封匿名邀请让六位旧友重回餐厅。前院长承诺交出原始档案，旧广播却先响了：最后一句之前，少了一小段。这一轮先查清，录音里漏掉了哪个称呼。</p></div><div className="gi-guide-intro"><h3>一块公共屏，六份个人文字。</h3><p>个人经历私下阅读，公共物件一起核对。你只扮演一位，其他角色都由真人完成。</p></div>
            <ol className="gi-steps">{groupSteps.map((step,index)=><li key={step.title}><span className="gi-step-number">0{index+1}</span><div><h4>{step.title}</h4><p>{step.body}</p></div></li>)}</ol>
            <div className="gi-scope-box"><h4>这次能玩到哪里</h4><p>第一轮建议 20–30 分钟，尚未经过六人盲测。先调查餐厅录音里缺失的称呼，并说明依据。二楼值班室只供场景预览，不是本轮必经关卡。</p><p><strong>当前没有多人同步。</strong>各自打开网页不会共享进度；先用共同语音和一块共享屏幕组织。本机记录由共享屏操作者保管。</p><p>在线主持使用预设文字。完整 60–90 分钟文本剧本属于另一套流程，尚未完整实现在场景中。</p></div>
            <button className="gi-inline-link" onClick={()=>changePage('roles')}>看看六位旧友<ArrowRight size={15}/></button>
          </section>}
          {page==='roles'&&<section aria-label="公开选角册">
            <div className="gi-guide-intro"><h3>选一个你想从中观察的人。</h3><p>下面只是公开简介与游玩偏好，不是职业技能或数值优势。所有人都能查看公共物件；角色不限玩家性别，不要求表演、背台词或恋爱互动。</p></div>
            <div className="gi-role-grid">{publicRoles.map((role,index)=><button className={'gi-role'+(selectedRole?.id===role.id?' is-selected':'')} key={role.id} aria-pressed={selectedRole?.id===role.id} onClick={()=>{setRoleId(role.id);setCopyState('idle');}}><span className="gi-role-top"><span className="gi-role-number">0{index+1}</span><span className="gi-role-selection">{selectedRole?.id===role.id?<Check size={15}/>:<span/>}</span></span><span className="gi-role-name">{role.name}<small>{role.job}</small></span><span className="gi-role-reason">{role.reason}</span><span className="gi-role-preference">{role.preference}</span></button>)}</div>
            <div className="gi-claim-area" aria-live="polite">{selectedRole?<><div className="gi-claim-heading"><h4>我想认领「{selectedRole.name}」</h4><button className="gi-copy-button" onClick={()=>void copyClaim()}>{copyState==='done'?<CheckCheck size={15}/>:<Copy size={15}/>} {copyState==='done'?'已复制':'复制到群里'}</button></div><p>{copyState==='done'?'发到群里，由组织者确认是否重复，再私聊领取自己的第一轮短本。':'这里只生成认领意向，不会锁定席位。请由组织者在群里确认，再私聊领取自己的第一轮短本。'}</p>{copyState==='failed'&&<label className="gi-copy-fallback">未能自动复制，请选中下方文字手动复制。<textarea readOnly value={claim} onFocus={event=>event.currentTarget.select()} rows={3}/></label>}</>:<p>点一位角色，生成发到群里的认领意向。网页不会自动分配或保留角色。</p>}</div>
            <p className="gi-privacy-note">个人剧本不在公共网页下载。请向组织者私聊领取你自己的当前轮短本，不要索要其他人的本或DM答案。</p>
            <button className="gi-inline-link" onClick={()=>changePage('ready')}>角色确认好后，检查开团准备<ArrowRight size={15}/></button>
          </section>}
          {page==='ready'&&<section aria-label="共同调查准备确认">
            <div className="gi-guide-intro"><h3>开门之前，大家都准备好了？</h3><p>这些由操作者手动确认，网页不会检测其他玩家是否在线。</p></div>
            <div className="gi-checklist">{checks.map((text,index)=><label key={text} className={confirmed[index]?'is-checked':''}><input type="checkbox" checked={confirmed[index]} onChange={event=>setConfirmed(current=>current.map((checked,i)=>i===index?event.target.checked:checked))}/><span className="gi-check-mark" aria-hidden="true">{confirmed[index]&&<Check size={15}/>}</span><span>{text}</span></label>)}</div>
            <div className="gi-scope-box"><h4>操作者协助大家，真人决定怎么查</h4><p>按大家的请求点击物件、共同检听，记录哪些材料已经公开。可以自由提问和比对，不必按固定顺序轮流点击。</p><p>含答案的主持资料应由不参与推理的人保管；若组织者也扮演角色，请使用无剧透分发清单，并由非玩家准备主持资料。</p></div>
            {groupHasSave&&<p className="gi-group-save">共享屏幕的本机记录 · 已查看 {Math.min(3,Math.max(0,groupFoundCount))}/3 组公共材料。继续时仅恢复这台设备的组团记录。</p>}
            {!onClose&&<p className="gi-ready-hint">{allReady?'准备完成。进入现场后，先用自己的话介绍身份，再共同调查。':'勾选上面三项即可进入；还没凑齐人也可以返回，直接体验单人小谜。'}</p>}
          </section>}
        </div>
        <footer className="gi-guide-footer">
          <a className="gi-download" href={publicGuide} download><Download size={15}/><span>下载公共开团说明<small>无私人本与答案</small></span></a>
          {onClose?<button className="gi-button gi-button-primary" onClick={onClose}>返回当前现场<ArrowRight size={16}/></button>:page==='ready'?<button className="gi-button gi-button-primary" disabled={!allReady} onClick={()=>onEnter('group')}>{groupHasSave?'继续这组调查':'准备好了，进入共同现场'}<ArrowRight size={16}/></button>:<button className="gi-button gi-button-primary" onClick={()=>changePage(page==='steps'?'roles':'ready')}>{page==='steps'?'查看角色':'检查开团准备'}<ArrowRight size={16}/></button>}
          {!onClose&&<button className="gi-back-link" onClick={()=>setGuide(false)}><ArrowLeft size={14}/>返回单人试玩</button>}
        </footer>
      </div>
    </div>}
  </div>;
}
