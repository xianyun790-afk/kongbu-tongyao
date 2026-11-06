/** Public information only. Private scripts and DM answers must stay outside the static site. */
export const publicRoles = [
  {id:'lin',name:'林见秋',job:'刑警',reason:'再次回到童年生活的地方，想把零碎回忆与眼前记录对上。',preference:'喜欢梳理事实、主动提问'},
  {id:'shen',name:'沈时安',job:'精神科医生',reason:'想重新听听当年的点名，也听清旧友们记得的事情。',preference:'喜欢倾听、追问细节'},
  {id:'zhou',name:'周叙',job:'摄影师',reason:'带着旧影像回来，想核对画面留下了什么。',preference:'喜欢比对来源与原始记录'},
  {id:'xu',name:'许知音',job:'声音修复师',reason:'带着一盘旧磁带，想听清熟悉声音里的疑问。',preference:'喜欢声音线索、分享材料'},
  {id:'cheng',name:'程野',job:'工程师',reason:'曾参与旧楼加固，拆除前再来看一眼建筑与旧档。',preference:'喜欢空间、路线和实物细节'},
  {id:'tang',name:'唐棠',job:'插画师',reason:'想把记忆中的画面与眼前的房间放在一起看。',preference:'喜欢观察环境、描述感受'},
] as const;

export const groupSteps = [
  {title:'在群里认领角色',body:'从六位旧友中选一位，发到群里，由组织者确认互不重复。其他五位由真人扮演。'},
  {title:'私收第一轮短本',body:'组织者私聊发送你这一位的当前轮文字。只读自己的本，不把个人本发到公共群。'},
  {title:'打开共同现场',body:'接通常用语音聊天，由一人共享游戏屏幕、按大家的请求操作。公共线索供所有人查看。'},
  {title:'边调查，边讨论',body:'DM说明本轮目标，真人自由提问、分享和核对材料，最后一起提交判断与依据。'},
] as const;

export function roleClaimText(name: string) {
  return `我想认领「${name}」，请组织者确认是否与他人重复，并私聊发我当前第一轮短本。网页认领仅表达意向，不会锁定席位。`;
}
