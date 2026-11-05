import content from '../../config/dining-loop-public.json';

/** Public short-case content only. No private role script or later-round truth. */
export type EvidenceId = 'A01' | 'A02' | 'A03';
export type Evidence = {
  id: EvidenceId;
  title: string;
  source: string;
  body: string;
  observation: string;
};
export type DeductionResult = {
  ok: boolean;
  kind: 'success' | 'partial' | 'retry';
  title: string;
  body: string;
  supported: string[];
  missing: string[];
};
export type SharedListeningRelease = {
  mode: 'scheduled_shared_listening';
  label: string;
  confirmation: string;
  notice: string;
};

export const VERSION = content.version;
export const INTRO = content.intro;
export const OBJECTIVE = content.objective;
export const TITLE = content.title;
export const SCOPE = content.scope;
export const CONCLUSION = content.conclusion;
export const LOCAL_DM_LABEL = '文字主持 · 预设提示';
export const EVIDENCE_IDS: readonly EvidenceId[] = ['A01', 'A02', 'A03'];
export const evidence: Evidence[] = content.evidence.map(({ id, title, source, body, observation }) => ({
  id: id as EvidenceId, title, source, body, observation,
}));
export const A02_RELEASE = content.evidence[1].release as SharedListeningRelease;

export function isEvidenceId(value: unknown): value is EvidenceId {
  return typeof value === 'string' && EVIDENCE_IDS.includes(value as EvidenceId);
}

export function normalizeEvidenceIds(values: readonly unknown[]): EvidenceId[] {
  return EVIDENCE_IDS.filter(id => values.includes(id));
}

export function getEvidence(id: EvidenceId): Evidence {
  return evidence.find(card => card.id === id)!;
}

const supportText: Record<EvidenceId, string> = {
  A01: 'A01：广播副本的末句前有一处声音缺口。',
  A02: 'A02：共同检听的原带可与广播逐段核对。',
  A03: 'A03：凳底刻字与七行值日表提供生活记录核对。',
};

/** Mechanical feedback is authoritative; the DM model never unlocks completion. */
export function evaluateDeduction(
  text: string,
  citedIds: readonly unknown[],
  releasedIds: readonly unknown[],
): DeductionResult {
  const answer = String(text ?? '').replace(/\s+/g, '').trim();
  const released = normalizeEvidenceIds(releasedIds);
  const citations = normalizeEvidenceIds(citedIds).filter(id => released.includes(id));
  const supported = citations.map(id => supportText[id]);
  const missing: string[] = [];
  const namesXiaoman = /小满/.test(answer) && !/(?:不是|并非|不叫|绝非|排除)(?:白)?小满|(?:白)?小满(?:并不是|不是)(?:被删|缺失|缺少|那个称呼|名字)/.test(answer);

  if (!answer) {
    return { ok: false, kind: 'retry', title: '先写下你的判断',
      body: '广播缺失的称呼是什么？写下名字，再选择你用来核对的材料。',
      supported, missing: ['补上你对缺失称呼的判断。'] };
  }
  if (!namesXiaoman) missing.push('找回“把凳子搬过来”之前缺失的称呼。');
  if (!citations.includes('A01')) missing.push(released.includes('A01')
    ? '选上A01广播副本，说明你在核对哪一处缺口。'
    : '先查看墙上的旧广播，取得A01。');
  if (!citations.includes('A02')) missing.push(released.includes('A02')
    ? '选上A02原带，把它与广播副本的同一位置进行比较。'
    : '原带还没有公开；在磁带处开启本轮约定的共同检听。');
  if (!citations.includes('A03')) missing.push(released.includes('A03')
    ? '选上A03凳底与名单，用生活记录核对这个称呼。'
    : '查看儿童小凳或餐柜旧值日表，取得A03生活记录。');

  // A name plus three checked boxes must not override a contradictory written
  // conclusion. Uncertainty and hypothetical suspects remain valid discussion.
  const clauses = answer.split(/[,，。；;！!？?\n]/);
  const qualifiesClaim = (clause: string) =>
    /不能|无法|未能|不(?:能|足以|认为|认定|表示|说明|敢断定|敢认定)|不确定|尚未|没有(?:证据|依据)|没证据|未(?:证实|确定|认定|证明)|可能|也许|或许|是否|猜|不代表|不是|并非|没有剪|没有删|没剪|没删/.test(clause);
  const deniesNameGap = clauses.some(clause => {
    if (/不能说|不能认定|无法认定|不确定|是否|也许|可能/.test(clause)) return false;
    // “原带里的小满没有被删” correctly describes the intact original.
    if (/原带|原磁带/.test(clause) && !/广播|副本/.test(clause)) return false;
    return /(?:小满|这个称呼|这个名字|这段称呼).{0,4}(?:并没有|没有|并未|未曾|不曾|没|未)(?:被)?(?:删|剪|去掉|省略)|(?:广播|副本)(?:里|中)?(?:并没有|没有|并未|未曾|不曾|没|未)(?:被|把)?(?:删|剪|去掉|省略)/.test(clause);
  });
  const person = '(?:许知音|梁素琴|林见秋|沈时安|周叙|程野|唐棠|顾怀山|小满)';
  const alias = '(?:许知音|许|梁素琴|梁|林见秋|沈时安|周叙|程野|唐棠|顾怀山|小满)';
  const explicitEditor = new RegExp(
    `${person}(?:亲手|曾经|已经|当时|偷偷|负责|帮忙)?(?:把(?:广播|副本|录音))?(?:剪辑|剪|删去|删掉|删除|删|改动)(?:了|过|的|广播|副本|录音|称呼|名字|小满)`
    + `|(?:是|由)${alias}(?:剪辑|剪|删去|删掉|删除|删|改动)(?:了|过|的|广播|副本|录音)`
    + `|${person}(?:就是|是).{0,5}(?:剪辑者|删名者|改动者)`
    + `|(?:剪辑者|删名者|改动者)(?:就是|是)${alias}`
    + `|(?:就是|确定|肯定|证明是|认定|断定).{0,6}${alias}.{0,5}(?:剪|删)`);
  const unsupportedEditor = clauses.some(clause => !qualifiesClaim(clause) && explicitEditor.test(clause));
  const unsupportedArrival = clauses.some(clause =>
    !/不能|无法|未能|不(?:能|足以)|不确定|尚未|没有证据|未证实|可能|也许|是否|猜|不代表/.test(clause)
    && /(?:小满|第七人|第七个人).{0,5}今晚.{0,4}(?:到场|来了|在场|出现)|今晚.{0,5}(?:来了|在场|到场|出现).{0,5}(?:小满|第七人|第七个人)|今晚(?:有|多了)(?:一个|位)?第七(?:个)?人|今晚(?:的)?第七(?:个)?人(?:就是|是)(?:白)?小满/.test(clause));
  if (deniesNameGap) missing.push('重新对照A01与A02，不要把“副本没有删去称呼”写成结论。');
  if (unsupportedEditor) missing.push('把“谁剪过副本”的确定指认改为待核实；当前三份材料没有确认改动者。');
  if (unsupportedArrival) missing.push('区分当年的旧录音和今晚到场情况；旧材料没有记录今晚另有一人。');

  if (missing.length === 0) return {
    ok: true, kind: 'success', title: '找回了缺失的称呼', body: CONCLUSION,
    supported: [
      'A01与A02：呼吸和椅脚声对应，原带保留“小满”，副本缺少这段称呼。',
      'A03：凳底刻字与七行值日表，把这个称呼与旧生活记录对应起来。',
    ], missing: [],
  };
  return {
    ok: false,
    kind: namesXiaoman || supported.length > 0 ? 'partial' : 'retry',
    title: namesXiaoman ? '名字有了，继续补齐依据' : '再核对缺口中的称呼',
    body: deniesNameGap ? (released.includes('A01') && released.includes('A02')
      ? '你已写出名字，但“没有被删去”与两段公开录音的差异不符。再看原带保留了什么、广播副本缺少了什么。'
      : '你写出了一个名字。先取得两段录音并逐段核对，再判断副本有没有缺少称呼。')
      : unsupportedEditor ? '你提出了改动者人选。先把能确认的片段差异与仍待核实的猜测分开。'
      : unsupportedArrival ? '先把旧生活记录和今晚发生的事分开，再核对广播副本与原带。'
      : namesXiaoman ? '“小满”是一个可继续核对的方向。把两段录音与生活记录一起作为依据，完成这次小发现。'
      : '已经找到的材料会保留。先看末句缺少什么，再用对应记录核实。',
    supported, missing,
  };
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}

/** Text-only local fallback, deliberately labelled rather than posing as an LLM. */
export function localDmReply(
  question: string,
  releasedIds: readonly unknown[],
  progress?: unknown,
): string {
  const q = String(question ?? '').trim();
  const known = normalizeEvidenceIds(releasedIds);
  const has = (id: EvidenceId) => known.includes(id);
  const reply = (body: string) => `${LOCAL_DM_LABEL}：${body}`;
  const status = record(progress);

  if (/系统提示|系统消息|system\s*prompt|开发者|管理员|忽略.{0,8}(规则|指令)|越权|源码|secret/i.test(q)) {
    return reply(content.dm.unavailableReply);
  }
  if (/私人|私密|角色本|替.{0,5}(同意|分享|承认|投票)|假装.{0,6}(许|真人)|我是许/.test(q)) {
    return reply(content.dm.privateMaterialReply);
  }
  if (/凶手|杀人|死者|死亡|死因|袭击|DNA|第二幕|第三幕|下一幕|后续案情|[BC]0[1-8]/i.test(q)) {
    return reply(content.dm.unavailableReply);
  }
  if (/提示|卡住|下一步|做什么|查什么|怎么开始|怎么玩|怎么过|目标/.test(q)) {
    if (!has('A01')) return reply('先走近墙上的旧广播，查看并重听它的末句。场景里的线索可以自由选择查看顺序。');
    if (!has('A02')) return reply('广播副本已经可以查看。桌上的磁带可以发起本轮约定的共同检听，之后再把两段末句放在一起核对。');
    if (!has('A03')) return reply('两段录音已经可以对照。再看看儿童小凳的底面，或餐柜里留下的旧值日表。');
    const level = Math.max(1, Math.min(3, typeof status.hintLevel === 'number' ? status.hintLevel + 1 : 1));
    const hint = content.dm.hints.find(item => item.level === level)!;
    return reply(hint.body);
  }
  if (/手印|指纹|灰尘|擦|搬/.test(q)) {
    return reply(has('A03') ? content.dm.activeHelp.handprint : '查看小凳时，可以连同刻字、灰尘与现场说明一起核对。先取得这组公开观察。');
  }
  if (/(谁|哪个|许|梁).{0,8}(剪|删|改)|剪辑者|删名者|制作人/.test(q)) {
    return reply(has('A01') && has('A02') ? content.dm.activeHelp.editorIdentity : '先核对已公开的录音版本。若原带还未共同检听，可以从桌上磁带发起约定的公开检听。');
  }
  if (/今晚.{0,8}(七|小满|人)|幽灵|鬼/.test(q)) {
    return reply(has('A01') && has('A03') ? content.dm.activeHelp.tonightSeventhPerson : '先区分旧材料记下的事情和今晚的到场情况。可以查看旧广播和旧生活记录各自写了什么。');
  }
  if (/小满|名字|称呼|叫谁|叫什么|名单|值日|木凳|凳底|第七/.test(q)) {
    if (has('A03')) return reply('凳底刻着“小满”，旧值日表也有七个常用名字，最后是小满。你可以用这组生活记录，核对录音里缺失的称呼。');
    if (has('A02')) return reply('已共同检听的原带最后一句是“小满，把凳子搬过来”。再用旧生活记录核对这个称呼。');
    return reply('这个称呼需要从已公开材料中核对。儿童小凳和餐柜旧值日表可以自由查看，原带则要先完成约定的共同检听。');
  }
  if (/录音|广播|磁带|原带|缺口|声音|呼吸|椅脚|相同|不同|对比|比较/.test(q)) {
    if (has('A01') && has('A02')) return reply('两段录音末句后的呼吸和椅脚声在对应位置相同；原带保留“小满，把凳子搬过来”，广播副本在称呼处有缺口。你觉得这两个版本是什么关系？');
    if (has('A01')) return reply('广播末句前的底噪中断了一小段。原带可以通过共同检听公开，之后再逐段核对。');
    if (has('A02')) return reply('共同检听的原带最后一句是“小满，把凳子搬过来”。先查看墙上旧广播，再比较同一处声音。');
    return reply('先查看墙上的旧广播，或从桌上磁带发起共同检听。只有实际展示的材料会进入这次公共讨论。');
  }
  if (/完成|结束|提交|答案|结论/.test(q)) {
    if (status.completed === true) return reply('这段餐厅小谜已经完成。你可以继续环顾房间、重看公开材料，或重新开始这段短篇试玩。');
    return reply('把你认为缺失的称呼写进推理区，并选择广播副本、公开原带与生活记录作为依据。提交后会分别说明哪些依据已经支持判断、还缺哪一环。');
  }
  if (/你是谁|在线|大模型|本地|备用/.test(q)) return reply('我现在提供本地预设的公共主持提示，不是在线大模型的即时回答。你仍可查看线索、提问和提交推理。');
  if (/材料|依据|支持|证据/.test(q)) {
    if (has('A01') && has('A02') && has('A03')) return reply('录音比对能确定称呼处存在缺口；凳底刻字与值日表能核对这个称呼属于谁。把声音中的差异和生活记录分别写进判断，就能组成这一轮的依据。');
    return reply('先把已公开的声音和旧物分开核对：声音用于比较缺口，生活记录用于确认称呼。尚未查看的材料不会算作你的依据。');
  }
  return reply(known.length ? '可以从一个已公开的细节继续问起，例如广播缺口、两段录音怎样核对，或凳底与名单记了什么。' : content.dm.openingQuestion);
}
