import {useEffect, useRef} from 'react';
import {ArrowLeft, ArrowRight, Download} from 'lucide-react';
import Modal from './Modal';
import {chapters, rules, rounds, type Chapter} from '../content';

export default function Reader({chapter, onChapter, onClose, onChooseRole}: {chapter: Chapter; onChapter: (c: Chapter) => void; onClose: () => void; onChooseRole: () => void}) {
  const scroll = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const index = chapters.findIndex(c => c.id === chapter);
  useEffect(() => { scroll.current?.scrollTo(0, 0); heading.current?.focus({preventScroll: true}); }, [chapter]);

  return <Modal title="故事与规则" onClose={onClose} className="reader-dialog">
    <nav aria-label="阅读章节" className="reader-nav">{chapters.map(item => <button key={item.id} aria-current={item.id === chapter ? 'page' : undefined} onClick={() => onChapter(item.id)}>{item.label}</button>)}</nav>
    <div ref={scroll} className="reader-scroll"><article className="reading-article">
      <h2 ref={heading} tabIndex={-1}>{chapters[index].label}</h2>
      {chapter === 'story' && <>
        <p className="reading-lead">二十年后，<br/>你们再次回到白榆。</p>
        <p>你们是白榆儿童之家当年的六个孩子。旧楼即将拆除，一封匿名邀请让你们重新坐到餐桌前。前院长顾怀山承诺，今晚会交出原始档案。</p>
        <p>墙上的旧广播叫出了熟悉的名字，却在最后一句之前，留下一小段不自然的空白。</p>
        <p>调查从那个缺失的称呼开始。重聚期间发生的案件，又让你们重新核对每个人的经历。通过交流与搜证，你们需要给出有依据的最终判断。</p>
        <p className="reading-note">这是六名真人共同完成的悬疑故事。私人往事只在个人剧本中揭示，这里不会公开答案。雨夜旧宅氛围，无血腥和突脸惊吓。</p>
      </>}
      {chapter === 'rules' && <>
        <p>每人扮演一位旧友，阅读自己的剧本，自由交流与调查。主持人负责旁白、公共材料和阶段推进。</p>
        <h3>公共规则</h3>
        <ol className="reading-rules">{rules.map(rule => <li key={rule}>{rule}</li>)}</ol>
        <h3>三轮流程</h3>
        <div className="reader-rounds">{rounds.map((round, i) => <section key={round.title}><h4>0{i + 1} · {round.title}</h4><p>{round.body}</p></section>)}</div>
        <p className="reading-note">完整文本建议 60—90 分钟，尚未完成六人盲测。此网页不提供已配置的 AI 主持；组织者需配置主持资料、人工私发角色本并控制轮次。</p>
        <a className="text-link" href="./downloads/玩家公共规则.md" download><Download size={15}/>保存公共规则原文</a>
      </>}
      {chapter === 'getting-started' && <>
        <ol className="getting-started"><li><h3>先确认人数</h3><p>真人主持需要 6 位玩家＋1 位不参与推理的 DM，共 7 人。使用 AI 主持时，需要组织者另行配置；当前网页未接通该服务。</p></li><li><h3>把意向发给邀请你的人</h3><p>在角色介绍里复制选角意向，由邀请者确认角色没有重复。如果你只收到转发链接，请先询问转发者谁是组织者。</p></li><li><h3>只领取自己的当前轮剧本</h3><p>组织者私聊发送「01 入场」。后两轮等待主持人宣布再领取，避免提前看到别人未公开的内容。</p></li><li><h3>接通语音，再一起开始</h3><p>同桌或使用常用群语音都可以。按主持人引导介绍身份、自由调查和交换材料，最后独立提交判断。</p></li></ol>
        <p className="reading-note">这里的偏好不会锁定席位，公共页面也不创建联机房间。3D Demo 是一个约 5—10 分钟的独立餐厅小谜，二楼仅供场景预览，不包含完整三轮。</p>
      </>}
    </article></div>
    <footer className="reader-footer"><button className="text-link" disabled={index === 0} onClick={() => onChapter(chapters[index - 1].id)}><ArrowLeft size={15}/>上一节</button><span>{index + 1} / {chapters.length}</span>{index < chapters.length - 1 ? <button className="text-link" onClick={() => onChapter(chapters[index + 1].id)}>下一节<ArrowRight size={15}/></button> : <button className="text-link" onClick={onChooseRole}>去选角色<ArrowRight size={15}/></button>}</footer>
  </Modal>;
}
