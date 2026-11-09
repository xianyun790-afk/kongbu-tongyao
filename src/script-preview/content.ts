export type Role = {id:string;name:string;job:string;line:string;description:string;preference:string;object:string;icon:'key'|'brain'|'camera'|'tape'|'ruler'|'pen'};
export const roles:Role[]=[
 {id:'lin',name:'林见秋',job:'刑警',line:'有些事，记不清，不等于没发生。',description:'你记得红绳钥匙的触感，却记不全那一晚。二十年后，眼前的旧屋和零碎的记忆再次重叠。',preference:'梳理事实 · 主动提问',object:'红绳钥匙',icon:'key'},
 {id:'shen',name:'沈时安',job:'精神科医生',line:'当年的点名，为什么总在第六个人停下？',description:'每次回忆点名，你总在第六个人停下来。这一次，你想重新听听熟悉的声音，也听清旧友们记得的事情。',preference:'倾听交流 · 追问细节',object:'旧时的点名',icon:'brain'},
 {id:'zhou',name:'周叙',job:'摄影师',line:'画面留下的，和我们记住的一样吗？',description:'你带回一盘不太愿意打开的旧录像。影像留下的画面，或许能和眼前的记录放在一起核对。',preference:'观察影像 · 比对来源',object:'旧录像',icon:'camera'},
 {id:'xu',name:'许知音',job:'声音修复师',line:'先别说话，再听一遍。',description:'邀请函里，多了一盘旧磁带。你熟悉修复声音的方法，但今晚，有些熟悉的声音仍让你感到陌生。',preference:'声音线索 · 分享材料',object:'旧磁带',icon:'tape'},
 {id:'cheng',name:'程野',job:'工程师',line:'旧楼里的每一处改动，都有来由。',description:'去年，你参与过旧楼加固。今晚，你带着工程文件回来，重新看向这座即将拆除的建筑。',preference:'空间路线 · 实物细节',object:'工程文件',icon:'ruler'},
 {id:'tang',name:'唐棠',job:'插画师',line:'我一直在画她，却画不出她的脸。',description:'你一直在画一个没有脸的女孩。记忆中的画面，似乎可以和眼前的房间慢慢拼在一起。',preference:'环境观察 · 描述感受',object:'未完成的画',icon:'pen'},
];
export const rules=[
  "每人领取自己的角色包，只读DM宣布的当前轮。你扮演自己拿到的角色，其他五个角色由另外五名真人扮演。",
  "可自由交谈、选场景、点物件或向DM申请查看。不用依次发言，也不用每个人都点完才能继续。",
  "角色本给出的过去活动是固定故事事实；现场聊天、去洗手间或阅读快慢，不会改掉角色当时的行程。",
  "角色可拒绝公开私人往事，或选择何时分享。非凶手一旦回答具体时间、地点或已发生的动作，必须照本作事实；不编造证人、物件、路线。",
  "本案有且只有一名现案行凶者，在六个玩家角色之中；无共犯、外来行凶者、NPC凶手、人格替换、秘密通道或远程致死。本案只有一次致命袭击，不靠第二次伤害反转。所有时间已校准，没有钟表快慢谜。",
  "凶手可以使用本人剧本允许的谎言；不能藏毁关键卡片、抢看他人本子，或为躲避指证发明本中没有的作案者。",
  "AI DM负责旁白、NPC、调查结果、发卡与流程。它不会代替你们回答，不会读出别人未公开的角色秘密。需要问某位玩家，就直接问本人。",
  "所有必要声音和影像都有文字记录，听不清也可解谜。当前包可直接按文字朗读开团，实际配音与场景动画尚待制作。",
  "你们可以要求暂停、回看、轻提示。没有阅读超时的隐藏惩罚。现实中不搜身、不抢手机、不表演危险动作。"
];
export const rounds=[
 {title:'归来',subtitle:'回到餐厅，找回缺失的声音。',body:'阅读「01 入场」，认识旧友，自由调查旧餐厅，把广播和名单放在一起核对。',action:'认识角色 · 自由调查'},
 {title:'声音',subtitle:'把每个人的经历，放回同一条时间线。',body:'阅读「02 活动」，交流当晚各自的经历，申请材料、交叉提问，检验彼此的说法。',action:'交流证词 · 核对时间'},
 {title:'归档',subtitle:'给出判断，也给旧事一个交代。',body:'阅读「03 归档」，查看主持人公开的材料。每人独立提交最终判断，锁定后再一起听复盘。',action:'提出指证 · 共同复盘'},
];
export const chapters=[{id:'story',label:'故事前情'},{id:'rules',label:'玩法与规则'},{id:'getting-started',label:'怎样开始'}] as const;
export type Chapter=typeof chapters[number]['id'];
export const claimText=(role:Role)=>`我想选择《第七个孩子：归来夜》的「${role.name}（${role.job}）」。请帮我确认是否与他人重复，并私聊发我第一轮角色本。`;
