import {useEffect, useRef, useState} from 'react';
import {ArrowDown, ArrowRight, ArrowUpRight, Bookmark, Check, Download} from 'lucide-react';
import Reader from './components/Reader';
import RolePreview from './components/RolePreview';
import {roles, type Chapter, type Role} from './content';

const saveKey = 'baiyu-script-preview-role-v1';
const gameUrl = import.meta.env.BASE_URL;

function loadRole() {
  try {
    const id = localStorage.getItem(saveKey);
    return roles.some(role => role.id === id) ? id : '';
  } catch { return ''; }
}

export default function App() {
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [activeRole, setActiveRole] = useState<Role | null>(null);
  const [saved, setSaved] = useState(loadRole);
  const [notice, setNotice] = useState('');
  const roleHeading = useRef<HTMLHeadingElement>(null);
  const selected = roles.find(role => role.id === saved);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  function saveRole(role: Role) {
    const next = saved === role.id ? '' : role.id;
    setSaved(next);
    try {
      if (next) localStorage.setItem(saveKey, next);
      else localStorage.removeItem(saveKey);
    } catch { setNotice('这次偏好未能保存到浏览器，页面内仍会记住你的选择。'); }
  }

  function goToRoles() {
    setChapter(null);
    requestAnimationFrame(() => {
      roleHeading.current?.focus({preventScroll: true});
      document.getElementById('characters')?.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
    });
  }

  return <>
    <a className="skip-link" href="#main">跳到正文</a>
    <header className="site-header page-width">
      <a className="brand" href="#" aria-label="恐怖童谣，回到开头">恐怖童谣<span>剧本预览</span></a>
      <nav aria-label="主导航"><a href="#characters">角色</a><a href="#guide">怎样开始<ArrowUpRight size={14}/></a><a href={gameUrl}>3D试玩</a></nav>
    </header>

    <main id="main" className="page-width">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">六人悬疑故事</p>
          <h1 id="hero-title">第七个孩子<span>归来夜</span></h1>
          <p className="hero-description">二十年后，一封邀请让六位旧友重回白榆。旧广播漏掉了一个称呼，而重聚期间发生的案件，让你们重新核对彼此的经历。</p>
          <p className="hero-facts">6 位玩家<span>·</span>60—90 分钟<span>·</span>轻悬疑</p>
          <div className="hero-actions"><a className="button primary" href="#characters">看看六个角色<ArrowDown size={16}/></a><button className="text-link" onClick={() => setChapter('story')}>先读故事<ArrowRight size={16}/></button></div>
          <p className="quiet-note">公共预览，不含角色秘密与答案。</p>
        </div>
        <figure className="scene-image">
          <img src="./images/baiyu-dining.jpg" width="1600" height="1200" fetchPriority="high" alt="白榆旧餐厅的木桌、银盘、烛台与雨夜窗户"/>
          <figcaption><span>白榆餐厅</span><span>已制作的 3D 场景</span></figcaption>
        </figure>
      </section>

      <section className="characters-section" id="characters" aria-labelledby="characters-title">
        <div className="section-heading"><div><p className="eyebrow">角色</p><h2 id="characters-title" ref={roleHeading} tabIndex={-1}>选一个你想了解的人。</h2></div><p>角色不限玩家性别，也不需要表演经验。</p></div>
        <div className="role-grid">{roles.map((role, index) => <button className={'role-row' + (saved === role.id ? ' is-saved' : '')} key={role.id} aria-label={'查看' + role.name + '的公开介绍'} onClick={() => setActiveRole(role)}>
          <span className="role-number">0{index + 1}</span>
          <span className="role-summary"><span className="role-identity"><strong>{role.name}</strong><span>{role.job}</span></span><span className="role-memory">{role.line}</span></span>
          <span className="role-indicator">{saved === role.id ? <Bookmark size={17} aria-label="我的偏好"/> : <ArrowUpRight size={18}/>}</span>
        </button>)}</div>
        <p className="selection-note" role="status">{selected ? <><Check size={15}/>我的偏好：<strong>{selected.name}</strong><span>正式角色由邀请你的人确认。</span></> : <>点开角色查看公开介绍，再把选角意向发给邀请你的人。</>}</p>
      </section>

      <section className="guide-section" id="guide" aria-labelledby="guide-title">
        <div className="section-heading"><div><p className="eyebrow">入场指南</p><h2 id="guide-title">三步，坐回同一张餐桌。</h2></div><button className="text-link" onClick={() => setChapter('rules')}>查看玩法与规则<ArrowUpRight size={16}/></button></div>
        <ol className="start-steps">
          <li><span>01</span><h3>确认人数</h3><p>6 位玩家。使用真人主持时，另需 1 位不参与推理的 DM；AI 主持需组织者另行配置。</p></li>
          <li><span>02</span><h3>选角领本</h3><p>把角色意向发给邀请你的人，确认后私聊领取自己的第一轮剧本。</p></li>
          <li><span>03</span><h3>一起调查</h3><p>同桌或接通群语音，按主持人引导阅读、交流和核对证据。后续剧本按轮发放。</p></li>
        </ol>
        <div className="guide-resources"><a className="text-link" href="./downloads/白榆-公共预览资料-MP1.0.zip" download><Download size={15}/>下载公共规则与调查表</a><button className="text-link" onClick={() => setChapter('getting-started')}>领取说明<ArrowRight size={15}/></button></div>
        <p className="service-note">当前网页供开团前阅读，暂不提供联机、自动发本或已配置的 AI 主持。若你只是收到转发链接，请先向转发者确认组织者。</p>
        <div className="demo-link"><div><h3>也可以先看看房间。</h3><p>3D 单人小谜 · 约 5—10 分钟，独立于完整文本剧本。</p></div><a className="text-link" href={gameUrl} target="_blank" rel="noreferrer">进入场景试玩<ArrowUpRight size={17}/></a></div>
      </section>
    </main>

    <footer className="site-footer page-width"><span>第七个孩子：归来夜</span><span>公共预览 v0.2 · 文本 MP1.0</span></footer>
    {chapter && <Reader chapter={chapter} onChapter={setChapter} onClose={() => setChapter(null)} onChooseRole={goToRoles}/>}
    {activeRole && <RolePreview key={activeRole.id} role={activeRole} saved={activeRole.id === saved} onSave={() => saveRole(activeRole)} onClose={() => setActiveRole(null)}/>}
    {notice && <div className="toast" role="status">{notice}</div>}
  </>;
}
