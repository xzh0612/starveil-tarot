import {readFileSync} from 'node:fs';
import {cardById} from '../src/domain.js';
import {cardGuides} from '../src/data/card-guides.js';

const references=JSON.parse(readFileSync(new URL('../src/data/card-references.json',import.meta.url),'utf8'));

const PROFESSIONAL_BOUNDARY_WORDS=['健康','症状','疾病','诊断','治疗','药物','医疗','法律','律师','诉讼','合同','纠纷','投资','股票','基金','理财','借贷','保险','税务'];

export function requiresProfessionalBoundary(question){
 const text=String(question??'').toLowerCase();
 return PROFESSIONAL_BOUNDARY_WORDS.some(word=>text.includes(word));
}

const THEMES=[
 {name:'relationship',words:['关系','感情','恋爱','爱情','伴侣','前任','暧昧','复合','婚姻','分手','喜欢','相处','沟通','边界'],weakWords:['他','她','我们']},
 {name:'career',words:['工作','事业','职业','学习','考研','考试','创业','项目','领导','同事','收入','财务','转行','升职','技能']},
 {name:'choice',words:['选择','要不要','是否','该不该','决定','比较','哪个','还是','机会','两条路']},
 {name:'future',words:['未来','接下来','趋势','之后','今年','明年','发展','走向','时间']},
 {name:'reflection',words:['自己','迷茫','成长','情绪','压力','方向','生活','状态','疗愈','内耗','困惑','意义']},
];

const POSITION_HINTS=[
 {words:['关系','感受','需求','互动','挑战'],kind:'relationships',boost:6},
 {words:['事业','资源','优势','工作','行动','建议','下一步'],kind:'work',boost:6},
 {words:['过去','现在','趋势','未来'],kind:'orientation',boost:3},
];

export function analyzeReadingQuestion(question){
 const text=String(question??'').trim().toLowerCase();
 const scored=THEMES.map(theme=>{
  const strongTerms=theme.words.filter(word=>text.includes(word));
  const weakTerms=(theme.weakWords??[]).filter(word=>text.includes(word));
  return {name:theme.name,strongTerms,weakTerms,score:strongTerms.length*2+weakTerms.length*.5};
 });
 const strong=scored.filter(item=>item.score>=2),active=strong.length?strong:scored.filter(item=>item.score>0);
 const themes=active.map(item=>item.name);
 const matchedTerms=[...new Set(active.flatMap(item=>[...item.strongTerms,...item.weakTerms]))];
 const themeScores=Object.fromEntries(scored.map(item=>[item.name,item.score]));
 return {themes,matchedTerms,themeScores,ambiguous:themes.length!==1,confidence:themes.length===0?'open':themes.length===1?'focused':'mixed'};
}

function chineseNgrams(text){
 const value=String(text??'').toLowerCase(),tokens=new Set(value.match(/[a-z0-9]+|[\u4e00-\u9fff]{2,4}/g)??[]);
 // Include overlapping bigrams so short Chinese questions can match source phrases.
 const chars=[...value].filter(char=>/[\u4e00-\u9fff]/.test(char));
 for(let i=0;i<chars.length-1;i++)tokens.add(chars.slice(i,i+2).join(''));
 return tokens;
}

function themesFor(question){
 return analyzeReadingQuestion(question).themes;
}

function excerpt(text,max=360){
 const value=String(text??'').replace(/\s+/g,' ').trim();
 return value.length>max?`${value.slice(0,max-1)}…`:value;
}

function candidateChunks(card,question){
 const guide=cardGuides[card.id],reference=references[card.id];
 const orientation=card.reversed?'reversed':'upright';
 const modern=[...(reference?.light??[]).slice(0,3),...(reference?.shadow??[]).slice(0,3)].join('；');
 return [
  {kind:'symbolism',text:guide.symbolism,source:'editorial',sourceLabel:'星幕编辑牌义',base:4},
  {kind:'orientation',text:guide[orientation],source:'editorial',sourceLabel:`星幕编辑牌义 · ${card.reversed?'逆位':'正位'}`,base:10},
  {kind:'relationships',text:guide.relationships,source:'editorial',sourceLabel:'星幕编辑牌义 · 关系与情感',base:2},
  {kind:'work',text:guide.work,source:'editorial',sourceLabel:'星幕编辑牌义 · 事业与行动',base:2},
  {kind:'reflection',text:guide.question,source:'editorial',sourceLabel:'星幕编辑牌义 · 反思问题',base:1},
  reference?.waite&&{kind:'waite',text:excerpt(reference.waite),source:'waite',sourceLabel:'A. E. Waite · The Pictorial Key to the Tarot',url:reference.waiteUrl,base:2},
  modern&&{kind:'modern',text:excerpt(`建设面与挑战面：${modern}`,420),source:'corpora',sourceLabel:'Corpora · tarot interpretations',url:reference.modernUrl,base:1},
 ].filter(Boolean);
}

function matchingSignals(chunk,{position,terms,themes}){
 const text=chunk.text.toLowerCase();
 const termList=terms instanceof Set?[...terms]:Array.isArray(terms)?terms:[];
 const matchedTerms=termList.filter(term=>text.includes(term)).slice(0,8);
 const matchedThemes=themes.filter(theme=>{
  if(theme==='relationship')return chunk.kind==='relationships';
  if(theme==='career')return chunk.kind==='work';
  if(theme==='reflection')return ['orientation','reflection'].includes(chunk.kind);
  if(theme==='future')return ['orientation','waite'].includes(chunk.kind);
  return false;
 });
 const matchedPosition=POSITION_HINTS.some(hint=>hint.words.some(word=>String(position).includes(word))&&chunk.kind===hint.kind);
 return {matchedTerms,matchedThemes,matchedPosition};
}

function scoreChunk(chunk,{position,terms,themes}){
 let score=chunk.base;
 const signals=matchingSignals(chunk,{position,terms,themes});
 for(const term of signals.matchedTerms)score+=term.length>2?1.4:.35;
 for(const theme of signals.matchedThemes)score+=theme==='reflection'?4:3;
 for(const hint of POSITION_HINTS)if(signals.matchedPosition&&hint.kind===chunk.kind)score+=hint.boost;
 return score;
}

function evidenceTier(kind){
 if(['symbolism','orientation'].includes(kind))return 'anchor';
 if(['relationships','work','reflection'].includes(kind))return 'application';
 return 'reference';
}

function retrievalReasons(chunk,signals){
 const reasons=[];
 if(['symbolism','orientation'].includes(chunk.kind))reasons.push('required_anchor');
 if(signals.matchedThemes.length)reasons.push('theme_match');
 if(signals.matchedPosition)reasons.push('position_match');
 if(signals.matchedTerms.length)reasons.push('keyword_match');
 if(!reasons.length)reasons.push('fallback_context');
 return reasons;
}

export function retrieveReadingEvidence({question,cards,maxPerCard=5}={}){
 if(typeof question!=='string'||!question.trim()||!Array.isArray(cards))return [];
 const terms=chineseNgrams(question),themes=themesFor(question),limit=Math.max(3,Math.min(7,maxPerCard));
 return cards.flatMap(card=>{
  const canonical=cardById[card?.id];
  if(!canonical||typeof card.reversed!=='boolean'||typeof card.position!=='string'||!card.position.trim())return [];
  const chunks=candidateChunks(card,question).map((chunk,index)=>{
   const signals=matchingSignals(chunk,{position:card.position,terms,themes});
   return {...chunk,score:scoreChunk(chunk,{position:card.position,terms,themes}),retrievalReasons:retrievalReasons(chunk,signals),index};
  });
  const sorted=[...chunks].sort((a,b)=>b.score-a.score||a.index-b.index);
  const required=chunks.filter(chunk=>['symbolism','orientation'].includes(chunk.kind));
  const chosen=[...required,...sorted].filter((chunk,index,list)=>list.findIndex(other=>other.kind===chunk.kind)===index).slice(0,limit);
  return chosen.map(chunk=>({
   evidenceId:`${card.id}:${chunk.kind}`,
   cardId:card.id,
   cardName:canonical.name,
   position:card.position,
   orientation:card.reversed?'逆位':'正位',
   kind:chunk.kind,
   tier:evidenceTier(chunk.kind),
   retrievalReasons:chunk.retrievalReasons,
   text:chunk.text,
   source:chunk.source,
   sourceLabel:chunk.sourceLabel,
   url:chunk.url??null,
  }));
 });
}

export function retrieveMemoryEvidence({question,memories,max=6}={}){
 if(typeof question!=='string'||!question.trim()||!Array.isArray(memories))return [];
 const terms=chineseNgrams(question),limit=Math.max(1,Math.min(10,max));
 return memories.filter(memory=>memory&&memory.enabled===true&&typeof memory.id==='string'&&memory.id.length<=120&&typeof memory.text==='string'&&memory.text.trim())
  .map((memory,index)=>{
  const text=memory.text.trim().slice(0,2_000),lower=text.toLowerCase();
  let score=0;for(const term of terms)if(lower.includes(term))score+=term.length>2?1.4:.35;
  return {memory,index,text,score};
 })
  .filter(item=>item.score>0)
  .sort((a,b)=>b.score-a.score||a.index-b.index)
  .slice(0,limit)
  .map(({memory,text})=>({evidenceId:`memory:${memory.id}`,cardId:null,cardName:null,position:null,orientation:null,kind:'memory',tier:'personal',retrievalReasons:['memory_keyword_match'],text,source:'memory',sourceLabel:'你确认的知识库',url:null}));
}

function validReference(item,evidenceById,cardsById){
 if(!item||typeof item!=='object'||typeof item.evidenceId!=='string')throw Error('引用证据无效。');
 const evidence=evidenceById.get(item.evidenceId),card=cardsById.get(item.cardId);
 if(!evidence||!card||evidence.cardId!==item.cardId||evidence.position!==item.position)throw Error('引用证据无效。');
 return {evidenceId:evidence.evidenceId,cardId:evidence.cardId,position:evidence.position,claim:typeof item.claim==='string'?excerpt(item.claim,240):'',kind:evidence.kind,tier:evidence.tier,source:evidence.source,sourceLabel:evidence.sourceLabel,retrievalReasons:evidence.retrievalReasons??[]};
}

export function parseReadingOutput(content,{cards=[],evidence=[],requireCoverage=false,requireActions=false,requireReferences=false,requireReferenceClaims=false,requireUncertainty=false}={}){
 const text=typeof content==='string'?content.trim():'';
 if(!text)throw Error('解读内容为空，请重试。');
 if(!text.startsWith('{')){
  if(requireUncertainty)throw Error('高风险问题需要现实依据说明，请重试。');
  return {text,references:[],cardReadings:[],actions:[],needsClarification:false,clarification:'',followUp:'',uncertainty:''};
 }
 let data;try{data=JSON.parse(text);}catch{throw Error('解读格式不正确，请重试。');}
 if(!data||typeof data.text!=='string'||!data.text.trim()||data.text.length>20_000)throw Error('解读格式不正确，请重试。');
 const evidenceById=new Map(evidence.map(item=>[item.evidenceId,item])),cardsById=new Map(cards.map(item=>[item.id,item]));
 if(data.needsClarification!==undefined&&typeof data.needsClarification!=='boolean')throw Error('澄清问题格式不正确，请重试。');
 const needsClarification=data.needsClarification===true,clarification=excerpt(data.clarification??'',500);
 if(needsClarification&&!clarification)throw Error('澄清问题格式不正确，请重试。');
 if(data.references!==undefined&&!Array.isArray(data.references))throw Error('解读引用格式不正确，请重试。');
 const refs=(data.references??[]).slice(0,24).map(item=>validReference(item,evidenceById,cardsById));
 if(requireReferences&&!needsClarification&&(refs.length<cards.length||cards.some(card=>!refs.some(reference=>reference.cardId===card.id))))throw Error('首轮解读引用没有覆盖全部牌面，请重试。');
 if(requireReferenceClaims&&!needsClarification&&refs.some(reference=>!reference.claim))throw Error('引用说明不能为空，请重试。');
 let cardReadings=[];
 if(data.cardReadings!==undefined){
  if(!Array.isArray(data.cardReadings)||data.cardReadings.length>12)throw Error('逐牌解读格式不正确，请重试。');
  const seen=new Set();
  cardReadings=data.cardReadings.map(item=>{
   if(!item||typeof item.cardId!=='string'||seen.has(item.cardId)||!cardsById.has(item.cardId)||typeof item.position!=='string'||typeof item.reading!=='string'||!item.reading.trim()||item.reading.length>4_000||!Array.isArray(item.evidenceIds)||item.evidenceIds.length<1||item.evidenceIds.length>8)throw Error('逐牌解读格式不正确，请重试。');
   const card=cardsById.get(item.cardId);if(card.position!==item.position)throw Error('逐牌解读牌位不匹配。');
   const evidenceIds=item.evidenceIds.map(id=>{const chunk=evidenceById.get(id);if(!chunk||chunk.cardId!==item.cardId||chunk.position!==item.position)throw Error('逐牌解读引用无效。');return chunk.evidenceId;});
   seen.add(item.cardId);return {cardId:item.cardId,position:item.position,reading:excerpt(item.reading,4_000),evidenceIds};
  });
  if(requireCoverage&&!needsClarification&&(cardReadings.length!==cards.length||cards.some(card=>!seen.has(card.id))))throw Error('首轮解读没有覆盖全部牌面。');
 }
 let actions=[];
 if(data.actions!==undefined){
  if(!Array.isArray(data.actions)||data.actions.length>6)throw Error('行动建议格式不正确，请重试。');
  actions=data.actions.map(item=>{
   if(!item||typeof item.text!=='string'||!item.text.trim()||item.text.length>600||typeof item.evidenceIds===undefined||!Array.isArray(item.evidenceIds)||item.evidenceIds.length<1||item.evidenceIds.length>8||item.evidenceIds.some(id=>typeof id!=='string'))throw Error('行动建议格式不正确，请重试。');
   const evidenceIds=item.evidenceIds.map(id=>{if(!evidenceById.has(id))throw Error('行动建议引用无效，请重试。');return id;});
   if(item.reason!==undefined&&typeof item.reason!=='string')throw Error('行动建议格式不正确，请重试。');
   return {text:excerpt(item.text,600),reason:excerpt(item.reason??'',500),evidenceIds};
  });
 }
 if(requireActions&&!needsClarification&&actions.length<1)throw Error('首轮解读需要行动建议，请重试。');
 for(const value of ['followUp','uncertainty'])if(data[value]!==undefined&&typeof data[value]!=='string')throw Error('解读格式不正确，请重试。');
 const uncertainty=excerpt(data.uncertainty??'',500);
 if(requireUncertainty&&!uncertainty)throw Error('高风险问题需要现实依据说明，请重试。');
 return {text:data.text.trim(),references:refs,cardReadings,actions,needsClarification,clarification,followUp:excerpt(data.followUp??'',500),uncertainty};
}
