import { cardGuides } from './data/card-guides.js';
export const DECK_VERSION = 'rws-1909-v1';
const majorNames = '愚者,魔术师,女祭司,皇后,皇帝,教皇,恋人,战车,力量,隐者,命运之轮,正义,倒吊人,死神,节制,恶魔,高塔,星星,月亮,太阳,审判,世界'.split(',');
const majorKeys = '开始与探索|意志与创造|直觉与潜意识|滋养与丰盛|秩序与责任|传统与学习|价值与选择|方向与推进|耐心与内在力量|独处与省察|周期与变化|公平与因果|暂停与换位|结束与转化|调和与适度|依附与束缚|动摇与重建|希望与修复|模糊与投射|清晰与生命力|回顾与回应|完成与整合'.split('|');
const minors = {
 w: ['权杖','行动、意愿与创造','新动机,规划远景,拓展等待,阶段庆祝,意见竞争,认可进展,守住立场,快速推进,坚持警觉,负担过重,好奇尝试,热情冒险,自信吸引,远见领导'],
 c: ['圣杯','情绪、关系与连接','情感萌芽,相互连接,朋友支持,倦怠忽视,失落遗憾,回忆善意,幻想选择,主动离开,满足感恩,归属和谐,情绪讯息,浪漫邀约,温柔共情,情绪成熟'],
 s: ['宝剑','思考、沟通与判断','清晰判断,僵持回避,伤心分离,休息恢复,冲突代价,过渡远行,策略隐瞒,自我限制,焦虑担忧,痛苦终结,警觉求知,果断急进,清晰边界,理性决断'],
 p: ['星币','资源、工作与现实','实际机会,平衡安排,协作技能,安全控制,匮乏求助,给予接受,耐心评估,练习精进,独立成果,长期积累,踏实学习,稳定执行,务实照顾,稳健管理'],
};
const ranks='首牌,二,三,四,五,六,七,八,九,十,侍从,骑士,王后,国王'.split(',');
export const cards = [
 ...majorNames.map((name,i)=>({id:`m${String(i).padStart(2,'0')}`,name,group:'大阿卡纳',key:majorKeys[i],area:'长期课题与价值选择'})),
 ...Object.entries(minors).flatMap(([s,[name,area,keys]])=>ranks.map((rank,i)=>({id:`${s}${String(i+1).padStart(2,'0')}`,name:name+rank,group:name,key:keys.split(',')[i],area}))),
].map(c=>({...c,image:`/assets/cards/${c.id}.jpg`,upright:cardGuides[c.id].upright,reversed:cardGuides[c.id].reversed}));
export const cardById = Object.fromEntries(cards.map(c=>[c.id,c]));
export const spreads = [
 ['one','一张指引','给此刻一个清晰的观察角度',['当下指引']],
 ['three','三张指引','看见现状、阻碍与可采取的行动',['现状','阻碍','建议']],
 ['time','时间之流','回顾来处，理解现在，探索趋势',['过去','现在','未来趋势']],
 ['choice','两条道路','比较两种选择的条件与代价',['现状','选择 A 的机会','选择 A 的挑战','选择 B 的机会','选择 B 的挑战']],
 ['love','关系之镜','从自己的感受与互动中理解关系',['我的感受','我的需求','可观察的互动','关系资源','关系挑战','我的下一步']],
 ['career','事业之径','整理方向、资源与下一步',['处境','优势','阻碍','可用资源','下一步']],
 ['horse','马蹄牌阵','从背景走向行动与可能趋势',['过去','现在','隐含因素','阻碍','环境','建议','趋势']],
 ['celtic','凯尔特十字','深入梳理一个复杂的问题',['核心','交叉影响','基础','过去','意识目标','近期趋势','自我状态','环境','希望与担忧','可能发展']],
 ['year','十二月轮','为未来十二个月设置反思主题',Array.from({length:12},(_,i)=>`第 ${i+1} 个月`)],
].map(([id,name,description,positions])=>({id,name,description,positions}));
// Rejection sampling avoids modulo bias. Shuffle happens once before any selection.
export function randomInt(max,fill=a=>crypto.getRandomValues(a)) {
 if(!Number.isInteger(max)||max<1||max>2**32) throw Error('Invalid random range');
 const limit=Math.floor(2**32/max)*max;const a=new Uint32Array(1);
 do{fill(a);}while(a[0]>=limit);
 return a[0]%max;
}
export function newDeck(reversals=true,rand=randomInt){
 const deck=cards.map(c=>({id:c.id,reversed:reversals&&rand(2)===1}));
 for(let i=deck.length-1;i>0;i--){const j=rand(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}
 return deck;
}
export function selectCard(session,index){
 if(!Number.isInteger(index)||index<0||index>=78||session.selected.includes(index)||session.selected.length>=session.spread.positions.length)return session;
 return {...session,selected:[...session.selected,index]};
}
export function chosenCards(session){return session.selected.map((index,i)=>({...session.deck[index],position:session.spread.positions[i]}));}
export function updateReadingFeedback(messages,index,feedback){
 const allowed=new Set(['helpful','review']);
 if(!Array.isArray(messages)||!Number.isInteger(index)||index<0||index>=messages.length||messages[index]?.role!=='assistant'||!allowed.has(feedback))return messages;
 return messages.map((message,messageIndex)=>messageIndex===index?{...message,feedback}:message);
}
export function createSession(question,spread,reversals){return {id:crypto.randomUUID(),date:new Date().toISOString(),question,spread,deck:newDeck(reversals),selected:[],revealed:[],messages:[],usePersonalMemory:false,deckVersion:DECK_VERSION};}
export function load(key,fallback){try{return JSON.parse(localStorage.getItem(`starveil:${key}`))??fallback;}catch{return fallback;}}
export function save(key,value){localStorage.setItem(`starveil:${key}`,JSON.stringify(value));}
