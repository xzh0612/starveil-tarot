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

/* ── AI 生成合成内容标识 ──────────────────────────────────────────────
   依据《生成式人工智能服务管理暂行办法》《人工智能生成合成内容标识办法》：
   AI 生成内容需要显式标识（用户可见标签），导出到文件的还需要隐式标识（元数据）。
   文案与元数据集中在此，对话面板与导出共用同一份口径，避免两处漂移。 */
export const AI_CONTENT_LABEL = 'AI 生成';
export const AI_CONTENT_DISCLAIMER = '本内容由 AI 模型生成，仅供自我反思，不构成医疗、法律、投资等专业建议；重要决定请咨询专业人士。';
export const AI_CONTENT_GENERATOR = '星幕塔罗 STARVEIL · NYX';
export const AI_CONTENT_POLICY = 'aigc-label-cn-v1';

/** 隐式标识：写进导出文件的元数据块，字段名同时兼容中文语义与常规读取习惯。 */
export function aiContentNotice(kind = 'reading', now = new Date()) {
  return {
    aiGenerated: true,
    label: AI_CONTENT_LABEL,
    contentKind: kind,
    generator: AI_CONTENT_GENERATOR,
    disclaimer: AI_CONTENT_DISCLAIMER,
    policy: AI_CONTENT_POLICY,
    labeledAt: now.toISOString(),
  };
}

/** 档案导出：数组改为带格式信封，隐式标识随文件走，同时给后续导入留出版本位。 */
export function createArchiveExport(records = [], now = new Date()) {
  return {
    format: 'starveil-archive',
    schemaVersion: 1,
    exportedAt: now.toISOString(),
    contentNotice: aiContentNotice('tarot-archive', now),
    records: Array.isArray(records) ? records : [],
  };
}

/** 全量备份导出：保留原有三块数据结构，只在外层补隐式标识。 */
export function createBackupExport({ history = [], memories = [], settings = {} } = {}, now = new Date()) {
  return {
    format: 'starveil-backup',
    schemaVersion: 1,
    exportedAt: now.toISOString(),
    contentNotice: aiContentNotice('tarot-backup', now),
    history,
    memories,
    settings,
  };
}

/* ── 档案导入 ────────────────────────────────────────────────────────
   导入是攻击面：把文件里的每个字段都当作不可信输入，逐项校验并限长。
   只要一条记录里有关键字段不合法就整条丢弃，不做部分修补——半坏的数据
   比没有数据更难排查。兼容本应用导出的两种信封与早期的裸数组档案。 */
export const IMPORT_MAX_CHARS = 8 * 1024 * 1024;
const QUESTION_LIMIT = 500;
const MESSAGE_TEXT_LIMIT = 20_000;
const NOTE_LIMIT = 2_000;

function isPlainObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function clip(value, max) { return typeof value === 'string' ? value.slice(0, max) : ''; }

function sanitizeMessage(message) {
  if (!isPlainObject(message)) return null;
  if (message.role !== 'user' && message.role !== 'assistant') return null;
  if (typeof message.text !== 'string' || !message.text.trim()) return null;
  return { ...message, text: message.text.slice(0, MESSAGE_TEXT_LIMIT) };
}

function sanitizeRecord(record) {
  if (!isPlainObject(record)) return null;
  const question = clip(record.question, QUESTION_LIMIT).trim();
  if (!question) return null;
  const spread = record.spread;
  if (!isPlainObject(spread) || !Array.isArray(spread.positions) || !spread.positions.length) return null;
  const deck = Array.isArray(record.deck) ? record.deck.filter(card => isPlainObject(card) && cardById[card.id]) : [];
  if (deck.length !== 78 || new Set(deck.map(card => card.id)).size !== 78) return null;
  const positions = spread.positions.map(position => clip(position, 60)).filter(Boolean);
  if (positions.length !== spread.positions.length) return null;
  const rawSelected = Array.isArray(record.selected) ? record.selected : [];
  if (!rawSelected.length || rawSelected.length > positions.length) return null;
  const selected = rawSelected.filter(index => Number.isInteger(index) && index >= 0 && index < 78);
  // 有任何一个下标不合法就整条拒绝，不做“悄悄少一张牌”的修补。
  if (selected.length !== rawSelected.length || new Set(selected).size !== selected.length) return null;
  const revealed = (Array.isArray(record.revealed) ? record.revealed : []).filter(index => selected.includes(index));
  const messages = (Array.isArray(record.messages) ? record.messages : []).map(sanitizeMessage).filter(Boolean);
  const notes = (Array.isArray(record.notes) ? record.notes : [])
    .filter(item => isPlainObject(item) && typeof item.text === 'string' && item.text.trim())
    .map(item => ({ text: item.text.slice(0, NOTE_LIMIT), date: typeof item.date === 'string' ? item.date : new Date().toISOString() }));
  const date = typeof record.date === 'string' && !Number.isNaN(Date.parse(record.date)) ? record.date : new Date().toISOString();
  const { messages: _messages, notes: _notes, ...rest } = record;
  return {
    ...rest,
    id: typeof record.id === 'string' && record.id ? record.id : crypto.randomUUID(),
    date,
    question,
    spread: { ...spread, name: clip(spread.name, 80), positions },
    deck,
    selected,
    revealed,
    messages,
    notes,
    // 导入的数据一律不继承“允许引用个人知识库”，避免把别人的记忆开关带进来。
    usePersonalMemory: false,
  };
}

export function parseArchiveImport(text) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, records: [], skipped: 0, error: '文件是空的。' };
  if (text.length > IMPORT_MAX_CHARS) return { ok: false, records: [], skipped: 0, error: '文件超过 8 MB，看起来不是档案备份。' };
  let data = null;
  try { data = JSON.parse(text); } catch { return { ok: false, records: [], skipped: 0, error: '不是有效的 JSON 文件。' }; }
  let raw = null;
  if (Array.isArray(data)) raw = data;
  else if (isPlainObject(data) && Array.isArray(data.records)) raw = data.records;
  else if (isPlainObject(data) && Array.isArray(data.history)) raw = data.history;
  if (!raw) return { ok: false, records: [], skipped: 0, error: '没有找到可导入的档案记录。' };
  const records = [];
  const seen = new Set();
  for (const item of raw) {
    const record = sanitizeRecord(item);
    if (!record || seen.has(record.id)) continue;
    seen.add(record.id);
    records.push(record);
  }
  if (!records.length) return { ok: false, records: [], skipped: raw.length, error: '文件里没有通过校验的档案记录。' };
  return { ok: true, records, skipped: raw.length - records.length, error: '' };
}

/** 合并时以本地已有记录为准，同 id 不覆盖，最终按时间倒序排列。 */
export function mergeArchive(current, incoming) {
  const base = Array.isArray(current) ? current.filter(item => isPlainObject(item) && typeof item.id === 'string') : [];
  const existing = new Set(base.map(item => item.id));
  const added = (Array.isArray(incoming) ? incoming : []).filter(item => item && typeof item.id === 'string' && !existing.has(item.id));
  const records = [...added, ...base].sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
  return { records, added: added.length };
}
