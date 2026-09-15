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
 {name:'relationship',words:['关系','感情','恋爱','爱情','伴侣','对象','前任','暧昧','复合','婚姻','分手','喜欢','相处','沟通','边界','冷战','联系','聊天','告白','家庭','朋友'],weakWords:['他','她','我们']},
 {name:'career',words:['工作','事业','职业','学习','备考','复习','考研','考试','创业','项目','领导','同事','收入','财务','转行','跳槽','辞职','换岗','职场','就业','求职','面试','绩效','薪资','升职','技能','论文','升学']},
 {name:'choice',words:['选择','要不要','是否','该不该','决定','比较','哪个','还是','机会','两条路','取舍','纠结','路径']},
 {name:'future',words:['未来','接下来','趋势','之后','近期','今年','明年','发展','走向','时间']},
 {name:'reflection',words:['自己','自我','迷茫','成长','情绪','压力','焦虑','不安','疲惫','方向','生活','状态','疗愈','内耗','困惑','意义','自信']},
];

const GOALS=[
 {name:'advice',words:['怎么办','如何','怎么','建议','下一步','行动','安排','调整','改善','应不应该']},
 {name:'forecast',words:['会不会','是否会','能否','何时','什么时候','几率','结果','趋势','未来']},
 {name:'explanation',words:['为什么','原因','意义','代表','意味着','怎么看','理解']},
 {name:'comparison',words:['比较','区别','哪个','利弊','优缺点','取舍']},
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
 const goalScored=GOALS.map(goal=>{const terms=goal.words.filter(word=>text.includes(word));return {name:goal.name,terms,score:terms.length*2};});
 const activeGoals=goalScored.filter(item=>item.score>=2),goalFallback=goalScored.filter(item=>item.score>0),goals=(activeGoals.length?activeGoals:goalFallback).map(item=>item.name);
 const matchedGoalTerms=[...new Set((activeGoals.length?activeGoals:goalFallback).flatMap(item=>item.terms))];
 const goalScores=Object.fromEntries(goalScored.map(item=>[item.name,item.score]));
 return {themes,matchedTerms,themeScores,goals,matchedGoalTerms,goalScores,goalConfidence:goals.length===0?'open':goals.length===1?'focused':'mixed',ambiguous:themes.length!==1,confidence:themes.length===0?'open':themes.length===1?'focused':'mixed'};
}

export function readingQueryFor(question,messages=[]){
 const fallback=String(question??'').trim().slice(0,2_000);
 if(!Array.isArray(messages))return fallback;
 const latest=[...messages].reverse().find(message=>message?.role==='user'&&message.source!=='demo'&&typeof message.text==='string'&&message.text.trim());
 return latest?latest.text.trim().slice(0,2_000):fallback;
}

export function readingRetrievalFor(question,messages=[]){
 const original=String(question??'').trim().slice(0,2_000),activeQuestion=readingQueryFor(original,messages),activeMeta=analyzeReadingQuestion(activeQuestion);
 const inheritedOriginal=Boolean(original&&activeQuestion!==original&&activeMeta.confidence==='open');
 const retrievalQuestion=(inheritedOriginal?`${original}\n${activeQuestion}`:activeQuestion).slice(0,4_000);
 return {activeQuestion,retrievalQuestion,retrievalMeta:analyzeReadingQuestion(retrievalQuestion),inheritedOriginal};
}

function tokenList(text){
 const value=String(text??'').toLowerCase(),tokens=value.match(/[a-z0-9]+|[\u4e00-\u9fff]{2,4}/g)??[];
 // Include overlapping bigrams so short Chinese questions can match source phrases.
 const chars=[...value].filter(char=>/[\u4e00-\u9fff]/.test(char));
 for(let i=0;i<chars.length-1;i++)tokens.push(chars.slice(i,i+2).join(''));
 return tokens;
}

function chineseNgrams(text){
 return new Set(tokenList(text));
}

function queryExpansionTerms(routing){
 const terms=new Set();
 for(const themeName of routing.themes??[]){
  const theme=THEMES.find(item=>item.name===themeName);
  for(const term of theme?.words??[])terms.add(term);
 }
 for(const goalName of routing.goals??[]){
  const goal=GOALS.find(item=>item.name===goalName);
  for(const term of goal?.words??[])terms.add(term);
 }
 return terms;
}

function weightedQueryTerms(question,routing){
 const direct=chineseNgrams(question),expanded=queryExpansionTerms(routing),weights=new Map([...direct].map(term=>[term,1]));
 for(const term of expanded)if(!weights.has(term))weights.set(term,.35);
 return {direct,expanded,weights};
}

function bm25Score(text,terms,corpus=[]){
 const tokens=tokenList(text),length=tokens.length||1;
 const weighted=terms instanceof Map?terms:new Map((terms??[]).map(term=>[term,1]));
 if(!weighted.size||!tokens.length||!corpus.length)return 0;
 const counts=new Map();for(const token of tokens)counts.set(token,(counts.get(token)??0)+1);
 const documents=corpus.map(chunk=>new Set(tokenList(chunk.text)));
 const averageLength=corpus.reduce((sum,chunk)=>sum+(tokenList(chunk.text).length||1),0)/Math.max(1,corpus.length);
 const k1=1.2,b=.75,total=corpus.length;
 let score=0;
 for(const [term,weight] of weighted){
  const frequency=counts.get(term)??0;if(!frequency)continue;
  const documentFrequency=documents.reduce((sum,document)=>sum+(document.has(term)?1:0),0);
  const idf=Math.log(1+(total-documentFrequency+.5)/(documentFrequency+.5));
  const denominator=frequency+k1*(1-b+b*length/Math.max(1,averageLength));
  score+=weight*idf*(frequency*(k1+1)/denominator);
 }
 return Math.min(6,score);
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

function goalMatchesChunk(goal,kind){
 if(goal==='advice')return ['relationships','work','reflection','orientation'].includes(kind);
 if(goal==='forecast')return ['orientation','waite','modern'].includes(kind);
 if(goal==='explanation')return ['symbolism','orientation','waite','modern'].includes(kind);
 if(goal==='comparison')return ['relationships','work','reflection','modern'].includes(kind);
 return false;
}

function matchingSignals(chunk,{position,terms,themes,goals=[],directTerms=new Set()}){
 const text=chunk.text.toLowerCase();
 const termList=terms instanceof Map?[...terms.keys()]:terms instanceof Set?[...terms]:Array.isArray(terms)?terms:[];
 const matchedTerms=termList.filter(term=>text.includes(term)).slice(0,8);
 const matchedDirectTerms=matchedTerms.filter(term=>directTerms.has(term));
 const matchedExpandedTerms=matchedTerms.filter(term=>!directTerms.has(term));
 const matchedThemes=themes.filter(theme=>{
  if(theme==='relationship')return chunk.kind==='relationships';
  if(theme==='career')return chunk.kind==='work';
  if(theme==='reflection')return ['orientation','reflection'].includes(chunk.kind);
  if(theme==='future')return ['orientation','waite'].includes(chunk.kind);
  return false;
 });
 const matchedGoals=goals.filter(goal=>goalMatchesChunk(goal,chunk.kind));
 const matchedPosition=POSITION_HINTS.some(hint=>hint.words.some(word=>String(position).includes(word))&&chunk.kind===hint.kind);
 return {matchedTerms,matchedDirectTerms,matchedExpandedTerms,matchedThemes,matchedGoals,matchedPosition};
}

function scoreChunk(chunk,{position,terms,themes,goals=[],corpus=[],directTerms=new Set()}){
 let score=chunk.base;
 const signals=matchingSignals(chunk,{position,terms,themes,goals,directTerms});
 score+=bm25Score(chunk.text,terms,corpus);
 for(const term of signals.matchedTerms)score+=term.length>2?1.4:.35;
 for(const theme of signals.matchedThemes)score+=theme==='reflection'?4:3;
 for(const goal of signals.matchedGoals)score+=goal==='advice'?1.6:1.2;
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
 if(signals.matchedGoals.length&&!['symbolism','orientation'].includes(chunk.kind))reasons.push('goal_match');
 if(signals.matchedPosition)reasons.push('position_match');
 if(signals.matchedDirectTerms.length)reasons.push('keyword_match');
 if(signals.matchedExpandedTerms.length&&!['symbolism','orientation'].includes(chunk.kind))reasons.push('expansion_match');
 if(!reasons.length)reasons.push('fallback_context');
 return reasons;
}

function focusedApplicationKinds(themes){
 if(themes.length!==1)return null;
 if(themes[0]==='relationship')return new Set(['relationships']);
 if(themes[0]==='career')return new Set(['work']);
 if(themes[0]==='reflection')return new Set(['reflection']);
 return new Set();
}

function applicationKindsForThemes(themes){
 const kinds=[];
 for(const theme of themes){
  if(theme==='relationship')kinds.push('relationships');
  if(theme==='career')kinds.push('work');
  if(theme==='reflection')kinds.push('reflection');
 }
 return [...new Set(kinds)];
}

export function rerankReadingEvidence(evidence,{semanticScores={},maxTotalEvidence=48,semanticWeight=8}={}){
 if(!Array.isArray(evidence))return [];
 const getScore=item=>{
  const raw=semanticScores instanceof Map?semanticScores.get(item.evidenceId):semanticScores?.[item.evidenceId];
  const value=Number(raw);
  return Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;
 };
 const weight=Number.isFinite(semanticWeight)?Math.max(0,Math.min(20,semanticWeight)):8;
 const ranked=evidence.map(item=>{
  const semanticScore=getScore(item),lexicalScore=Number(item.retrievalScore),baseScore=Number.isFinite(lexicalScore)?lexicalScore:0,score=Number((baseScore+semanticScore*weight).toFixed(3));
  return {...item,retrievalScore:score,retrievalSemanticScore:semanticScore,retrievalMethod:semanticScore>0?`${item.retrievalMethod}+semantic-v1`:item.retrievalMethod};
 });
 const required=ranked.filter(item=>item.retrievalRequired===true);
 const optional=ranked.filter(item=>item.retrievalRequired!==true).sort((a,b)=>b.retrievalScore-a.retrievalScore||a.evidenceId.localeCompare(b.evidenceId));
 const requested=Number.isFinite(maxTotalEvidence)?Math.floor(maxTotalEvidence):48;
 const budget=Math.max(required.length,Math.min(96,Math.max(1,requested)));
 const optionalBudget=Math.max(0,budget-required.length),remaining=[...optional],selected=[];
 while(selected.length<optionalBudget&&remaining.length){
  const represented=new Set(selected.map(item=>item.cardId??item.evidenceId));
  const fresh=remaining.filter(item=>!represented.has(item.cardId??item.evidenceId));
  const pool=fresh.length?fresh:remaining;
  const next=pool[0];
  selected.push(next);
  remaining.splice(remaining.indexOf(next),1);
 }
 return [...required,...selected];
}

export function collectReadingEvidence({question,cards,maxPerCard=5}={}){
 if(typeof question!=='string'||!question.trim()||!Array.isArray(cards))return [];
 const routing=analyzeReadingQuestion(question),queryTerms=weightedQueryTerms(question,routing),terms=queryTerms.weights,themes=routing.themes,goals=routing.goals,limit=Math.max(3,Math.min(7,maxPerCard));
 const perCard=cards.flatMap(card=>{
  const canonical=cardById[card?.id];
  if(!canonical||typeof card.reversed!=='boolean'||typeof card.position!=='string'||!card.position.trim())return [];
  const rawChunks=candidateChunks(card,question);
  const chunks=rawChunks.map((chunk,index)=>{
   const signals=matchingSignals(chunk,{position:card.position,terms,themes,goals,directTerms:queryTerms.direct});
   return {...chunk,score:scoreChunk(chunk,{position:card.position,terms,themes,goals,corpus:rawChunks,directTerms:queryTerms.direct}),retrievalReasons:retrievalReasons(chunk,signals),matchedTerms:signals.matchedTerms,matchedDirectTerms:signals.matchedDirectTerms,matchedExpandedTerms:signals.matchedExpandedTerms,matchedThemes:signals.matchedThemes,matchedGoals:signals.matchedGoals,index};
  });
  const sorted=[...chunks].sort((a,b)=>b.score-a.score||a.index-b.index);
  const required=chunks.filter(chunk=>['symbolism','orientation'].includes(chunk.kind));
  const focusedKinds=focusedApplicationKinds(themes);
  const candidates=focusedKinds?sorted.filter(chunk=>!['relationships','work','reflection'].includes(chunk.kind)||focusedKinds.has(chunk.kind)):sorted;
  // Mixed questions need one application chunk per explicit domain before
  // lower-priority reference chunks fill the remaining budget.
  const applicationKinds=applicationKindsForThemes(themes);
  const thematic=applicationKinds.map(kind=>candidates.find(chunk=>chunk.kind===kind)).filter(Boolean);
  const chosen=[...required,...thematic,...candidates].filter((chunk,index,list)=>list.findIndex(other=>other.kind===chunk.kind)===index).slice(0,limit);
  return chosen.map(chunk=>({
   evidenceId:`${card.id}:${chunk.kind}`,
   cardId:card.id,
   cardName:canonical.name,
   position:card.position,
   orientation:card.reversed?'逆位':'正位',
   kind:chunk.kind,
   tier:evidenceTier(chunk.kind),
   retrievalReasons:chunk.retrievalReasons,
   retrievalTerms:chunk.matchedTerms,
   retrievalDirectTerms:chunk.matchedDirectTerms,
   retrievalExpandedTerms:chunk.matchedExpandedTerms,
   retrievalThemes:chunk.matchedThemes,
   retrievalGoals:chunk.matchedGoals,
   retrievalMethod:'bm25+rules+expansion-v1',
   retrievalScore:Number(chunk.score.toFixed(3)),
   retrievalRequired:['symbolism','orientation'].includes(chunk.kind),
   text:chunk.text,
   source:chunk.source,
   sourceLabel:chunk.sourceLabel,
   url:chunk.url??null,
 }));
 });
 return perCard;
}

export function retrieveReadingEvidence({question,cards,maxPerCard=5,maxTotalEvidence=48,semanticScores={},semanticWeight=8}={}){
 const evidence=collectReadingEvidence({question,cards,maxPerCard});
 return rerankReadingEvidence(evidence,{semanticScores,maxTotalEvidence,semanticWeight});
}

export async function retrieveReadingEvidenceAsync({question,cards,maxPerCard=5,maxTotalEvidence=48,semanticScores={},semanticWeight=8,semanticReranker=null,semanticTimeoutMs=1_500}={}){
 const evidence=collectReadingEvidence({question,cards,maxPerCard});
 let resolvedScores=semanticScores;
 if(typeof semanticReranker==='function'){
  const timeout=Number.isFinite(semanticTimeoutMs)?Math.max(0,Math.min(10_000,semanticTimeoutMs)):1_500;
  const task=Promise.resolve().then(()=>semanticReranker({question,cards,evidence:[...evidence]})).catch(()=>null);
  let timer;
  const guard=new Promise(resolve=>{timer=setTimeout(()=>resolve(null),timeout);});
  const result=await Promise.race([task,guard]);
  clearTimeout(timer);
  if(result instanceof Map||(result&&typeof result==='object'))resolvedScores=result;
 }
 return rerankReadingEvidence(evidence,{semanticScores:resolvedScores,maxTotalEvidence,semanticWeight});
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

export function summarizeReadingEvidence(evidence,cards=[],{themes=[]}={}){
 const items=Array.isArray(evidence)?evidence:[],expected=[...new Set((Array.isArray(cards)?cards:[]).map(card=>card?.id).filter(Boolean))];
 const expectedApplicationKinds=applicationKindsForThemes(Array.isArray(themes)?themes:[]);
 const selectedCardIds=[...new Set(items.map(item=>item?.cardId).filter(Boolean))];
 const countsBy=(values)=>Object.fromEntries([...new Set(values)].map(value=>[value,values.filter(item=>item===value).length]));
 const perCard=Object.fromEntries(expected.map(cardId=>{
  const cardItems=items.filter(item=>item?.cardId===cardId),kinds=new Set(cardItems.map(item=>item.kind));
  return [cardId,{total:cardItems.length,anchorCount:cardItems.filter(item=>item.tier==='anchor').length,applicationKinds:[...new Set(cardItems.filter(item=>item.tier==='application').map(item=>item.kind))].sort(),hasSymbolism:kinds.has('symbolism'),hasOrientation:kinds.has('orientation')}];
 }));
 const missingAnchorCardIds=expected.filter(cardId=>!perCard[cardId].hasSymbolism||!perCard[cardId].hasOrientation);
 const missingApplicationCardIds=expectedApplicationKinds.length?expected.filter(cardId=>!expectedApplicationKinds.some(kind=>items.some(item=>item?.cardId===cardId&&item?.kind===kind))):[];
 return {
  total:items.length,
  requiredCount:items.filter(item=>item?.retrievalRequired===true).length,
  optionalCount:items.filter(item=>item?.retrievalRequired!==true).length,
  selectedCardIds,
  expectedCardIds:expected,
  missingAnchorCardIds,
  expectedApplicationKinds,
  missingApplicationCardIds,
  coverageStatus:missingAnchorCardIds.length?'incomplete':missingApplicationCardIds.length?'anchor_only':'complete',
  tiers:countsBy(items.map(item=>item?.tier).filter(Boolean)),
  kinds:countsBy(items.map(item=>item?.kind).filter(Boolean)),
  semanticCount:items.filter(item=>Number(item?.retrievalSemanticScore)>0).length,
  perCard,
 };
}

function validReference(item,evidenceById,cardsById){
 if(!item||typeof item!=='object'||typeof item.evidenceId!=='string')throw Error('引用证据无效。');
 const evidence=evidenceById.get(item.evidenceId);
 if(!evidence)throw Error('引用证据无效。');
 if(evidence.source==='memory'){
  if(item.cardId!==null||item.position!==null)throw Error('引用证据无效。');
 }else{
  const card=cardsById.get(item.cardId);
  if(!card||evidence.cardId!==item.cardId||evidence.position!==item.position)throw Error('引用证据无效。');
 }
 return {evidenceId:evidence.evidenceId,cardId:evidence.cardId,position:evidence.position,claim:typeof item.claim==='string'?excerpt(item.claim,240):'',kind:evidence.kind,tier:evidence.tier,source:evidence.source,sourceLabel:evidence.sourceLabel,url:typeof evidence.url==='string'?evidence.url:null,retrievalReasons:evidence.retrievalReasons??[]};
}

const CLAIM_STOPWORDS=new Set(['牌面','牌义','牌位','线索','证据','说明','相关','内容','信息','支持','建议','本次','判断','分析']);
function claimSupportedByEvidence(claim,evidence){
 const claimTerms=[...chineseNgrams(claim)].filter(term=>term.length>=2&&!CLAIM_STOPWORDS.has(term));
 if(!claimTerms.length)return false;
 const evidenceTerms=chineseNgrams(evidence?.text??'');
 return claimTerms.some(term=>evidenceTerms.has(term));
}

function isConcreteClarification(text){
 const value=String(text??'').trim();
 if(value.length<4)return false;
 const marks=(value.match(/[？?]/g)??[]).length;
 if(marks>1)return false;
 return marks===1||/[哪什么如何怎么是否还是谁何时什么时候哪里多少为何为什么更想想看先看]/u.test(value);
}

const ACTION_VERB_PATTERN=/记录|列出|写下|核实|查阅|联系|沟通|安排|设定|拆分|练习|观察|复盘|比较|暂停|预约|整理|确认|测试|制定|检查|收集|测量|追踪|完成|行动|执行|买入|咨询|询问|阅读/u;
const ACTION_MARKER_PATTERN=/今天|明天|本周|这周|一周|七天|三天|一天|分钟|小时|一次|两次|第\d+次|一项|一条|一个|每周|截止|结果|是否|回复|回应|复盘|完成|记录|写下|列出|确认/u;
function isConcreteAction(text){
 const value=String(text??'').trim();
 return value.length>=6&&ACTION_VERB_PATTERN.test(value)&&ACTION_MARKER_PATTERN.test(value);
}
const REALITY_BOUNDARY_PATTERN=/现实|核实|资料|专业|医生|律师|持牌|风险|证据|咨询|法规|合同|投资|财务/u;
function hasRealityBoundary(text){
 const value=String(text??'').trim();
 return value.length>=8&&REALITY_BOUNDARY_PATTERN.test(value);
}
const ABSOLUTE_CLAIM_PATTERN=/(?:百分之百|绝对|必然|肯定|一定|注定|保证)(?:.{0,4})(?:会|能|可以|不会|不能|复合|回来|联系|发生|实现|结婚|录取|升职|盈利|获利|解决|治愈|痊愈|安全|准确)/u;
const NEGATED_ABSOLUTE_PATTERN=/(?:不能|无法|不会|不代表|并不|不是|不保证|不意味着|不说明|不要|别|不应|不等于).{0,8}$/u;
function hasAbsoluteClaim(text){
 return String(text??'').split(/[。！？!?；;\n]+/u).some(segment=>{
  const match=segment.match(ABSOLUTE_CLAIM_PATTERN);if(!match)return false;
  return !NEGATED_ABSOLUTE_PATTERN.test(segment.slice(0,match.index));
 });
}

export function parseReadingOutput(content,{cards=[],evidence=[],requireCoverage=false,requireActions=false,requireReferences=false,requireReferenceClaims=false,requireReferenceSupport=false,requireCardReadingSupport=false,requireConcreteActions=false,requireActionReasons=false,requireSynthesis=false,requireSynthesisSupport=false,requireSynthesisAnchors=false,requireUncertainty=false,requireRealityBoundary=false,requireCalibratedLanguage=false,allowClarification=true}={}){
 const text=typeof content==='string'?content.trim():'';
 if(!text)throw Error('解读内容为空，请重试。');
 if(!text.startsWith('{')){
  if(requireCoverage||requireActions||requireReferences||requireSynthesis||requireUncertainty||requireRealityBoundary)throw Error('首轮解读必须返回结构化 JSON，请重试。');
  return {text,synthesis:{text:'',evidenceIds:[]},references:[],cardReadings:[],actions:[],needsClarification:false,clarification:'',followUp:'',uncertainty:''};
 }
 let data;try{data=JSON.parse(text);}catch{throw Error('解读格式不正确，请重试。');}
 if(!data||typeof data.text!=='string'||!data.text.trim()||data.text.length>20_000)throw Error('解读格式不正确，请重试。');
 const evidenceById=new Map(evidence.map(item=>[item.evidenceId,item])),cardsById=new Map(cards.map(item=>[item.id,item]));
 if(data.needsClarification!==undefined&&typeof data.needsClarification!=='boolean')throw Error('澄清问题格式不正确，请重试。');
 const needsClarification=data.needsClarification===true,clarification=excerpt(data.clarification??'',500);
 if(needsClarification&&allowClarification===false)throw Error('明确主题不允许跳过首轮解读，请重试。');
 if(needsClarification&&!isConcreteClarification(clarification))throw Error('澄清问题格式不正确，请重试。');
 if(needsClarification&&((Array.isArray(data.cardReadings)&&data.cardReadings.length>0)||(Array.isArray(data.actions)&&data.actions.length>0)||(Array.isArray(data.references)&&data.references.length>0)||(data.synthesis&&((typeof data.synthesis.text==='string'&&data.synthesis.text.trim())||(Array.isArray(data.synthesis.evidenceIds)&&data.synthesis.evidenceIds.length>0)))))throw Error('澄清时不能同时返回结构化解读，请重试。');
 if(data.references!==undefined&&!Array.isArray(data.references))throw Error('解读引用格式不正确，请重试。');
 const refs=[];const seenReferenceIds=new Set();
 for(const item of data.references??[]){
  const reference=validReference(item,evidenceById,cardsById);
  if(seenReferenceIds.has(reference.evidenceId))continue;
  seenReferenceIds.add(reference.evidenceId);refs.push(reference);
  if(refs.length>=24)break;
 }
 if(requireReferences&&!needsClarification&&(refs.length<cards.length||cards.some(card=>!refs.some(reference=>reference.cardId===card.id))))throw Error('首轮解读引用没有覆盖全部牌面，请重试。');
 if(requireReferences&&!needsClarification&&cards.some(card=>!refs.some(reference=>reference.cardId===card.id&&reference.tier==='anchor')))throw Error('首轮引用必须包含每张牌的核心锚点，请重试。');
 if(requireReferenceClaims&&!needsClarification&&refs.some(reference=>!reference.claim))throw Error('引用说明不能为空，请重试。');
 if(requireReferenceSupport&&!needsClarification&&refs.some(reference=>!claimSupportedByEvidence(reference.claim,evidenceById.get(reference.evidenceId))))throw Error('引用说明与证据不匹配，请重试。');
 let synthesis={text:'',evidenceIds:[]};let synthesisSupportOk=true;
 if(data.synthesis!==undefined){
  if(!data.synthesis||typeof data.synthesis!=='object'||typeof data.synthesis.text!=='string'||!data.synthesis.text.trim()||data.synthesis.text.length>4_000||!Array.isArray(data.synthesis.evidenceIds)||data.synthesis.evidenceIds.length<1||data.synthesis.evidenceIds.length>12||data.synthesis.evidenceIds.some(id=>typeof id!=='string'))throw Error('综合解读格式不正确，请重试。');
  const evidenceIds=data.synthesis.evidenceIds.map(id=>{const chunk=evidenceById.get(id);if(!chunk||chunk.source==='memory'||chunk.cardId===null)throw Error('综合解读引用无效，请重试。');return chunk.evidenceId;});
  synthesis={text:excerpt(data.synthesis.text,4_000),evidenceIds:[...new Set(evidenceIds)]};
  if(requireSynthesisSupport&&!needsClarification&&!claimSupportedByEvidence(synthesis.text,{text:evidenceIds.map(id=>evidenceById.get(id)?.text??'').join('；')}))synthesisSupportOk=false;
 }
 if(requireSynthesis&&!needsClarification){
  const coveredCards=new Set(synthesis.evidenceIds.map(id=>evidenceById.get(id)?.cardId).filter(Boolean));
  if(!synthesis.text||!synthesis.evidenceIds.length||cards.length>1&&cards.some(card=>!coveredCards.has(card.id)))throw Error('首轮综合解读没有覆盖全部牌面，请重试。');
  if(requireSynthesisAnchors&&cards.some(card=>!synthesis.evidenceIds.some(id=>evidenceById.get(id)?.cardId===card.id&&evidenceById.get(id)?.retrievalRequired===true)))throw Error('首轮综合解读必须引用每张牌的核心锚点，请重试。');
 }
 let cardReadings=[];let cardReadingSupportOk=true;
 if(requireCoverage&&!needsClarification&&data.cardReadings===undefined)throw Error('首轮解读必须包含逐牌解读，请重试。');
 if(data.cardReadings!==undefined){
  if(!Array.isArray(data.cardReadings)||data.cardReadings.length>12)throw Error('逐牌解读格式不正确，请重试。');
  const seen=new Set();
  cardReadings=data.cardReadings.map(item=>{
   if(!item||typeof item.cardId!=='string'||seen.has(item.cardId)||!cardsById.has(item.cardId)||typeof item.position!=='string'||typeof item.reading!=='string'||!item.reading.trim()||item.reading.length>4_000||!Array.isArray(item.evidenceIds)||item.evidenceIds.length<1||item.evidenceIds.length>8)throw Error('逐牌解读格式不正确，请重试。');
   const card=cardsById.get(item.cardId);if(card.position!==item.position)throw Error('逐牌解读牌位不匹配。');
   const orientation=card.reversed===true?'逆位':card.reversed===false?'正位':card.orientation??'未知方向';
   const evidenceIds=item.evidenceIds.map(id=>{const chunk=evidenceById.get(id);if(!chunk||chunk.cardId!==item.cardId||chunk.position!==item.position)throw Error('逐牌解读引用无效。');return chunk.evidenceId;});
   if(requireCardReadingSupport&&!needsClarification&&!evidenceIds.some(id=>claimSupportedByEvidence(item.reading,evidenceById.get(id))))cardReadingSupportOk=false;
   if(requireCoverage&&!needsClarification&&!evidenceIds.some(id=>evidenceById.get(id)?.retrievalRequired===true))throw Error('逐牌解读必须引用该牌的核心锚点，请重试。');
   seen.add(item.cardId);return {cardId:item.cardId,position:item.position,orientation,reading:excerpt(item.reading,4_000),evidenceIds};
  });
  if(requireCoverage&&!needsClarification&&(cardReadings.length!==cards.length||cards.some(card=>!seen.has(card.id))))throw Error('首轮解读没有覆盖全部牌面。');
 }
 let actions=[];let actionsConcrete=true,actionsReasoned=true;
 if(data.actions!==undefined){
  const actionLimit=requireActions&&!needsClarification?3:6;
  if(!Array.isArray(data.actions)||data.actions.length>actionLimit)throw Error('行动建议格式不正确，请重试。');
  actions=data.actions.map(item=>{
   if(!item||typeof item.text!=='string'||!item.text.trim()||item.text.length>600||typeof item.evidenceIds===undefined||!Array.isArray(item.evidenceIds)||item.evidenceIds.length<1||item.evidenceIds.length>8||item.evidenceIds.some(id=>typeof id!=='string'))throw Error('行动建议格式不正确，请重试。');
   const evidenceIds=item.evidenceIds.map(id=>{if(!evidenceById.has(id))throw Error('行动建议引用无效，请重试。');return id;});
   if(!evidenceIds.some(id=>['anchor','application','personal'].includes(evidenceById.get(id)?.tier)))throw Error('行动建议必须引用核心或应用证据，请重试。');
   if(item.reason!==undefined&&typeof item.reason!=='string')throw Error('行动建议格式不正确，请重试。');
   if(requireActionReasons&&!needsClarification&&(!item.reason||!item.reason.trim()))actionsReasoned=false;
   if(requireConcreteActions&&!needsClarification&&!isConcreteAction(item.text))actionsConcrete=false;
   return {text:excerpt(item.text,600),reason:excerpt(item.reason??'',500),evidenceIds};
  });
 }
 if(requireActions&&!needsClarification&&actions.length<1)throw Error('首轮解读需要行动建议，请重试。');
 for(const value of ['followUp','uncertainty'])if(data[value]!==undefined&&typeof data[value]!=='string')throw Error('解读格式不正确，请重试。');
 const uncertainty=excerpt(data.uncertainty??'',500);
 if((requireUncertainty||requireRealityBoundary)&&!needsClarification&&!uncertainty)throw Error(requireRealityBoundary?'高风险问题需要现实依据说明，请重试。':'首轮解读必须包含不确定性说明，请重试。');
 if(requireRealityBoundary&&!needsClarification&&!hasRealityBoundary(uncertainty))throw Error('高风险问题需要现实依据说明，请重试。');
 if(requireCardReadingSupport&&!needsClarification&&!cardReadingSupportOk)throw Error('逐牌解读内容与证据不匹配，请重试。');
 if(requireSynthesisSupport&&!needsClarification&&!synthesisSupportOk)throw Error('综合解读内容与证据不匹配，请重试。');
 if(requireConcreteActions&&!needsClarification&&!actionsConcrete)throw Error('行动建议必须包含可观察的完成标准，请重试。');
 if(requireActionReasons&&!needsClarification&&!actionsReasoned)throw Error('首轮行动建议必须说明与牌面相关的理由，请重试。');
 if(requireCalibratedLanguage&&!needsClarification&&hasAbsoluteClaim([data.text,synthesis.text,...cardReadings.map(item=>item.reading)].join('\n')))throw Error('解读包含无法由牌面确认的绝对断言，请重试。');
 return {text:data.text.trim(),synthesis,references:refs,cardReadings,actions,needsClarification,clarification,followUp:excerpt(data.followUp??'',500),uncertainty};
}
