import {readFileSync} from 'node:fs';
import {cardById} from '../src/domain.js';
import {cardGuides} from '../src/data/card-guides.js';

const references=JSON.parse(readFileSync(new URL('../src/data/card-references.json',import.meta.url),'utf8'));

export const READING_KNOWLEDGE_VERSION='rws-1909-rag-v11';

// Keep provenance separate from the human-readable source name. The model and
// client can use this stable enum to tell fixed card meaning from external
// context and the user's private memory without parsing labels.
const SOURCE_TYPE_BY_SOURCE={editorial:'fixed_card_meaning',memory:'personal_memory',waite:'external_reference',corpora:'external_reference'};
export function evidenceSourceType(source){return SOURCE_TYPE_BY_SOURCE[source]||'other';}

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
 {name:'advice',words:['怎么办','如何','怎么','应该','先做什么','该做什么','怎样处理','怎样调整','怎样沟通','怎样安排','怎样做','怎样面对','怎样开始','怎样改善','怎样解决','建议','下一步','行动','安排','调整','改善','应不应该']},
 // Temporal context words such as “未来” or “接下来” qualify a question,
 // but do not by themselves ask for a prediction. Keep them low-weight so
 // “未来我该怎么办” routes to advice, while “未来会怎样” still routes to
 // forecast because it contains the explicit prediction phrase “会怎样”.
 {name:'forecast',words:['会不会','是否会','是不是','还有感觉吗','有感觉吗','喜欢我吗','还喜欢','会主动联系','会联系','会如何','未来如何','事业如何','感情如何','关系如何','工作如何','发展如何','结果如何','能否','能不能','有没有可能','有没有机会','是否有机会','有机会吗','何时','什么时候','几率','结果','趋势','发展','走向','可能性','会怎样','怎么样'],weakWords:['未来','之后','接下来','近期','今年','明年']},
 {name:'explanation',words:['为什么','原因','解释','解读','是什么意思','什么意思','是什么含义','含义','意义','代表','意味着','怎么看','怎么理解','如何看','如何理解','怎么解释','如何解释','怎么想','如何想','心里怎么想','对方怎么想','会怎么想','理解']},
 // Decision questions are often phrased without the words "比较" or
 // "哪个". Keep these yes-or-no forms in the comparison goal so retrieval
 // still supplies decision-oriented application evidence.
 {name:'comparison',words:['比较','区别','哪个','哪条','哪种','选哪','利弊','优缺点','取舍','要不要','想不想','是否想','是否需要','是不是需要','该不该','是不是应该','是否应该','是不是要','是否要','是否值得','值不值得']},
];
const GOAL_REQUIRED_TIERS={advice:'application',comparison:'application',forecast:'reference',explanation:'anchor'};

// Intent lexicon matches must respect a small set of Chinese negation
// patterns. Without this guard, phrases such as “不想比较” or “不是想问会不会”
// become active goals even though the user explicitly ruled them out. The
// bounded four-character tail keeps ordinary phrases such as “不知道要不要”
// active while avoiding a broad sentiment classifier.
const NEGATED_INTENT_PREFIX=/(?:不想|不是想|不是要|不用|(?<!要)不要|无需|并非|不在于|不问|不求|不考虑|不需要)[^。！？?\n]{0,4}$/u;
const GOAL_LEXICON_TERMS=[...new Set(GOALS.flatMap(goal=>[...(goal.words??[]),...(goal.weakWords??[])]))];
function activeLexiconTerms(text,terms){
 return terms.filter(term=>{
   // Prefer an explicit longer intent phrase over a shorter substring.
   // Without this, “怎么看” also activates the advice token “怎么”.
   if(GOAL_LEXICON_TERMS.includes(term)&&GOAL_LEXICON_TERMS.some(candidate=>candidate.length>term.length&&candidate.includes(term)&&text.includes(candidate)))return false;
  let offset=0;
  while(offset<=text.length){
   const index=text.indexOf(term,offset);
   if(index<0)return false;
   const prefix=text.slice(Math.max(0,index-8),index);
   if(!NEGATED_INTENT_PREFIX.test(prefix))return true;
   offset=index+Math.max(1,term.length);
  }
  return false;
 });
}

const POSITION_HINTS=[
 {words:['关系','感受','需求','互动','挑战','阻碍','对方','联系','情绪'],kind:'relationships',boost:6},
 {words:['事业','资源','优势','工作','行动','建议','下一步','阻碍','机会','路径','发展','任务'],kind:'work',boost:6},
 {words:['过去','现在','趋势','未来','当下','近期','基础','环境','可能发展'],kind:'orientation',boost:3},
 {words:['选择','现状','隐含因素','意识目标','自我状态','希望','担忧','核心','交叉影响'],kind:'reflection',boost:5},
];

export function analyzeReadingQuestion(question){
 const text=String(question??'').trim().toLowerCase();
 const scored=THEMES.map(theme=>{
  const strongTerms=activeLexiconTerms(text,theme.words);
  const weakTerms=activeLexiconTerms(text,theme.weakWords??[]);
  return {name:theme.name,strongTerms,weakTerms,score:strongTerms.length*2+weakTerms.length*.5};
 });
 const strong=scored.filter(item=>item.score>=2),active=strong.length?strong:scored.filter(item=>item.score>0);
 const themes=active.map(item=>item.name);
 const strongMatchedTerms=[...new Set(active.flatMap(item=>item.strongTerms))];
 const weakMatchedTerms=[...new Set(active.flatMap(item=>item.weakTerms))];
 const matchedTerms=[...new Set([...strongMatchedTerms,...weakMatchedTerms])];
 const themeScores=Object.fromEntries(scored.map(item=>[item.name,item.score]));
 const goalScored=GOALS.map(goal=>{
  const terms=activeLexiconTerms(text,goal.words),weakTerms=activeLexiconTerms(text,goal.weakWords??[]);
  return {name:goal.name,terms,weakTerms,score:terms.length*2+weakTerms.length*.5};
 });
 const activeGoals=goalScored.filter(item=>item.score>=2),goalFallback=goalScored.filter(item=>item.score>0),
  // Weak temporal context alone should keep the question open. It may qualify
  // an explicit goal, but it must not manufacture a forecast route by itself.
  fallbackGoals=goalFallback.filter(item=>item.terms.length>0),selectedGoals=activeGoals.length?activeGoals:fallbackGoals,
  goals=selectedGoals.map(item=>item.name);
 const matchedGoalTerms=[...new Set(selectedGoals.flatMap(item=>[...item.terms,...item.weakTerms]))];
 const goalScores=Object.fromEntries(goalScored.map(item=>[item.name,item.score]));
 return {themes,matchedTerms,strongMatchedTerms,weakMatchedTerms,weakOnly:strong.length===0&&weakMatchedTerms.length>0,themeScores,goals,matchedGoalTerms,goalScores,goalConfidence:goals.length===0?'open':goals.length===1?'focused':'mixed',ambiguous:themes.length!==1,confidence:themes.length===0?'open':themes.length===1?'focused':'mixed'};
}

export function readingQueryFor(question,messages=[]){
 const fallback=String(question??'').trim().slice(0,2_000);
 if(!Array.isArray(messages))return fallback;
 const latest=[...messages].reverse().find(message=>message?.role==='user'&&message.source!=='demo'&&typeof message.text==='string'&&message.text.trim());
 return latest?latest.text.trim().slice(0,2_000):fallback;
}

export function readingRetrievalFor(question,messages=[]){
 const original=String(question??'').trim().slice(0,2_000),activeQuestion=readingQueryFor(original,messages),activeMeta=analyzeReadingQuestion(activeQuestion);
 const inheritedOriginal=Boolean(original&&activeQuestion!==original&&(activeMeta.confidence==='open'||activeMeta.weakOnly));
 const retrievalQuestion=(inheritedOriginal?`${original}${activeMeta.weakOnly?'':`\n${activeQuestion}`}`:activeQuestion).slice(0,4_000);
 return {activeQuestion,retrievalQuestion,retrievalMeta:analyzeReadingQuestion(retrievalQuestion),inheritedOriginal};
}

// A mixed topic is not automatically ambiguous when the user has already
// named the response goals. For example, "未来会怎样，同时下一步怎么做"
// contains both forecast and advice goals and should receive both sections in
// the first answer. Reserve a clarification turn for genuinely open questions
// (or for an existing conversation where the user is refining the answer).
export function canAskClarification(retrievalMeta,{hasPriorAssistant=false}={}){
 if(hasPriorAssistant)return true;
 const meta=retrievalMeta&&typeof retrievalMeta==='object'?retrievalMeta:{};
 return meta.confidence==='open'&&meta.goalConfidence==='open';
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
 const matchedPositionKinds=[...new Set(POSITION_HINTS.filter(hint=>hint.words.some(word=>String(position).includes(word))).map(hint=>hint.kind))];
 const matchedPosition=matchedPositionKinds.includes(chunk.kind);
 return {matchedTerms,matchedDirectTerms,matchedExpandedTerms,matchedThemes,matchedGoals,matchedPosition,matchedPositionKinds};
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

function applicationKindsForThemes(themes,goals=[]){
 const kinds=[];
 for(const theme of themes){
  if(theme==='relationship')kinds.push('relationships');
  if(theme==='career')kinds.push('work');
  if(theme==='reflection')kinds.push('reflection');
 }
 // A choice or action-oriented question still needs an application layer. In
 // the absence of an explicit relationship, career, or reflection domain,
 // use the reflective guide as the safest context instead of inventing a
 // work/relationship interpretation from a temporal word such as “未来”.
 if(!kinds.length&&(themes.includes('choice')||goals.some(goal=>['advice','comparison'].includes(goal))))kinds.push('reflection');
 return [...new Set(kinds)];
}

function resolveReadingEvidenceBudget(question,cards,maxTotalEvidence){
 if(Number.isFinite(maxTotalEvidence))return Math.floor(maxTotalEvidence);
 const count=Array.isArray(cards)?cards.length:0,routing=analyzeReadingQuestion(question);
 const applicationCount=Math.min(3,Math.max(1,applicationKindsForThemes(routing.themes,routing.goals).length,routing.goals.includes('forecast')?1:0));
 // Reserve two anchors plus one application/reference layer per card. Keep a
 // bounded floor for small spreads and a hard ceiling for prompt size.
 return Math.min(96,Math.max(48,count*(2+applicationCount)));
}

export function rerankReadingEvidence(evidence,{semanticScores={},maxTotalEvidence=48,semanticWeight=8,requiredGoalEvidence=[]}={}){
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
 const requested=Number.isFinite(maxTotalEvidence)?Math.floor(maxTotalEvidence):48;
 const budget=Math.max(required.length,Math.min(96,Math.max(1,requested)));
 const reservedIds=new Set(required.map(item=>item.evidenceId)),goalReserved=[];
 for(const goal of [...new Set(Array.isArray(requiredGoalEvidence)?requiredGoalEvidence:[])]){
  const tier=GOAL_REQUIRED_TIERS[goal];
  const candidate=ranked.filter(item=>!reservedIds.has(item.evidenceId)&&item.tier===tier&&Array.isArray(item.retrievalGoals)&&item.retrievalGoals.includes(goal)).sort((a,b)=>b.retrievalScore-a.retrievalScore||a.evidenceId.localeCompare(b.evidenceId))[0];
  if(candidate&&goalReserved.length<Math.max(0,budget-required.length)){goalReserved.push(candidate);reservedIds.add(candidate.evidenceId);}
 }
 const positionReserved=[];
 const positionCardIds=[...new Set(ranked.filter(item=>Array.isArray(item.retrievalReasons)&&item.retrievalReasons.includes('position_match')).map(item=>item.cardId).filter(Boolean))];
 for(const cardId of positionCardIds){
  const candidate=ranked.filter(item=>!reservedIds.has(item.evidenceId)&&item.cardId===cardId&&Array.isArray(item.retrievalReasons)&&item.retrievalReasons.includes('position_match')).sort((a,b)=>b.retrievalScore-a.retrievalScore||a.evidenceId.localeCompare(b.evidenceId))[0];
  if(candidate&&positionReserved.length<Math.max(0,budget-required.length-goalReserved.length)){positionReserved.push(candidate);reservedIds.add(candidate.evidenceId);}
 }
 const optional=ranked.filter(item=>!reservedIds.has(item.evidenceId)).sort((a,b)=>b.retrievalScore-a.retrievalScore||a.evidenceId.localeCompare(b.evidenceId));
 const optionalBudget=Math.max(0,budget-required.length-goalReserved.length-positionReserved.length),remaining=[...optional],selected=[];
 while(selected.length<optionalBudget&&remaining.length){
  const represented=new Set(selected.map(item=>item.cardId??item.evidenceId));
  const fresh=remaining.filter(item=>!represented.has(item.cardId??item.evidenceId));
  const pool=fresh.length?fresh:remaining;
  const next=pool[0];
  selected.push(next);
  remaining.splice(remaining.indexOf(next),1);
 }
 return [...required,...goalReserved,...positionReserved,...selected];
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
   return {...chunk,score:scoreChunk(chunk,{position:card.position,terms,themes,goals,corpus:rawChunks,directTerms:queryTerms.direct}),retrievalReasons:retrievalReasons(chunk,signals),matchedTerms:signals.matchedTerms,matchedDirectTerms:signals.matchedDirectTerms,matchedExpandedTerms:signals.matchedExpandedTerms,matchedThemes:signals.matchedThemes,matchedGoals:signals.matchedGoals,matchedPositionKinds:signals.matchedPositionKinds,index};
  });
  const sorted=[...chunks].sort((a,b)=>b.score-a.score||a.index-b.index);
  const required=chunks.filter(chunk=>['symbolism','orientation'].includes(chunk.kind));
  // Mixed questions need one application chunk per explicit domain before
  // lower-priority reference chunks fill the remaining budget.
 const applicationKinds=applicationKindsForThemes(themes,goals);
  // Keep application evidence inside the domains named by the question even
  // when more than one theme is active. Anchor and reference chunks remain
  // eligible, while unrelated application prose cannot crowd out the topic.
  // If a question has a named non-application theme (for example future),
  // leave the application layer empty instead of inventing a work/relationship
  // domain. Open questions retain the broad fallback context.
  const allowedApplications=new Set(applicationKinds);
  const candidates=themes.length
   ?sorted.filter(chunk=>!['relationships','work','reflection'].includes(chunk.kind)||allowedApplications.has(chunk.kind))
   :sorted;
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
   retrievalPositionKinds:chunk.matchedPositionKinds,
   retrievalGoals:chunk.matchedGoals,
   retrievalMethod:'bm25+rules+expansion-v1',
   retrievalScore:Number(chunk.score.toFixed(3)),
   retrievalRequired:['symbolism','orientation'].includes(chunk.kind),
   text:chunk.text,
   source:chunk.source,
   sourceType:evidenceSourceType(chunk.source),
   sourceLabel:chunk.sourceLabel,
   url:chunk.url??null,
 }));
 });
 return perCard;
}

export function retrieveReadingEvidence({question,cards,maxPerCard=5,maxTotalEvidence=null,semanticScores={},semanticWeight=8}={}){
 const evidence=collectReadingEvidence({question,cards,maxPerCard});
 return rerankReadingEvidence(evidence,{semanticScores,maxTotalEvidence:resolveReadingEvidenceBudget(question,cards,maxTotalEvidence),semanticWeight,requiredGoalEvidence:analyzeReadingQuestion(question).goals});
}

export async function retrieveReadingEvidenceAsync({question,cards,maxPerCard=5,maxTotalEvidence=null,semanticScores={},semanticWeight=8,semanticReranker=null,semanticTimeoutMs=1_500}={}){
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
 return rerankReadingEvidence(evidence,{semanticScores:resolvedScores,maxTotalEvidence:resolveReadingEvidenceBudget(question,cards,maxTotalEvidence),semanticWeight,requiredGoalEvidence:analyzeReadingQuestion(question).goals});
}

export function retrieveMemoryEvidence({question,memories,max=6}={}){
 if(typeof question!=='string'||!question.trim()||!Array.isArray(memories))return [];
 const terms=chineseNgrams(question),limit=Math.max(1,Math.min(10,max));
 const genericTerms=new Set(['如何','怎么','可以','需要','安排','自己','事情','问题','现在','最近','之后','今天','明天','什么','哪个','是否','还是','一个','进行']);
 return memories.filter(memory=>memory&&memory.enabled===true&&typeof memory.id==='string'&&memory.id.length<=120&&typeof memory.text==='string'&&memory.text.trim())
  .map((memory,index)=>{
  const text=memory.text.trim().slice(0,2_000),lower=text.toLowerCase();
  const matchedTerms=[...terms].filter(term=>lower.includes(term));
  let score=0;for(const term of matchedTerms)score+=term.length>2?1.4:.35;
  const strongTerms=matchedTerms.filter(term=>term.length>2),shortTerms=matchedTerms.filter(term=>term.length===2);
  return {memory,index,text,score,matchedTerms,strongTerms,shortTerms};
  })
  // A single generic two-character overlap is too weak to expose a private
  // record. Require one longer phrase or several independent short matches.
  .filter(item=>item.strongTerms.length>0||item.shortTerms.length>=2||item.shortTerms.some(term=>!genericTerms.has(term)))
  .sort((a,b)=>b.score-a.score||a.index-b.index)
  .slice(0,limit)
  .map(({memory,text,matchedTerms,score})=>({evidenceId:`memory:${memory.id}`,cardId:null,cardName:null,position:null,orientation:null,kind:'memory',tier:'personal',retrievalReasons:['memory_keyword_match'],retrievalTerms:matchedTerms.slice(0,8),retrievalMethod:'memory-keyword-v2',retrievalScore:Number(score.toFixed(3)),text,source:'memory',sourceType:evidenceSourceType('memory'),sourceLabel:'你确认的知识库',memoryStatus:'user_confirmed',memoryUse:'context_only',url:null}));
}

export function summarizeReadingEvidence(evidence,cards=[],{themes=[],goals=[]}={}){
 const items=Array.isArray(evidence)?evidence:[],expected=[...new Set((Array.isArray(cards)?cards:[]).map(card=>card?.id).filter(Boolean))];
 const expectedApplicationKinds=applicationKindsForThemes(Array.isArray(themes)?themes:[],Array.isArray(goals)?goals:[]);
 const routedGoals=[...new Set((Array.isArray(goals)?goals:[]).filter(goal=>['advice','forecast','explanation','comparison'].includes(goal)))];
 const selectedCardIds=[...new Set(items.map(item=>item?.cardId).filter(Boolean))];
 const countsBy=(values)=>Object.fromEntries([...new Set(values)].map(value=>[value,values.filter(item=>item===value).length]));
 const perCard=Object.fromEntries(expected.map(cardId=>{
  const cardItems=items.filter(item=>item?.cardId===cardId),kinds=new Set(cardItems.map(item=>item.kind));
  return [cardId,{total:cardItems.length,anchorCount:cardItems.filter(item=>item.tier==='anchor').length,applicationKinds:[...new Set(cardItems.filter(item=>item.tier==='application').map(item=>item.kind))].sort(),hasSymbolism:kinds.has('symbolism'),hasOrientation:kinds.has('orientation')}];
 }));
 const missingAnchorCardIds=expected.filter(cardId=>!perCard[cardId].hasSymbolism||!perCard[cardId].hasOrientation);
 const missingApplicationKindsByCard=Object.fromEntries(expected.map(cardId=>[cardId,expectedApplicationKinds.filter(kind=>!items.some(item=>item?.cardId===cardId&&item?.kind===kind))]));
 const missingApplicationCardIds=expected.filter(cardId=>missingApplicationKindsByCard[cardId]?.length>0);
 const goalCoverage=Object.fromEntries(routedGoals.map(goal=>{
  const matched=items.filter(item=>Array.isArray(item?.retrievalGoals)&&item.retrievalGoals.includes(goal));
  const applicationCount=matched.filter(item=>item.tier==='application').length;
  const referenceCount=matched.filter(item=>item.tier==='reference').length;
  const anchorCount=matched.filter(item=>item.tier==='anchor').length;
  const ok=goal==='advice'||goal==='comparison'?applicationCount>0:goal==='forecast'?referenceCount>0:anchorCount>0;
  return [goal,{matchedCount:matched.length,applicationCount,referenceCount,anchorCount,ok}];
 }));
 const missingGoalCoverage=routedGoals.filter(goal=>goalCoverage[goal]&&!goalCoverage[goal].ok);
 return {
  total:items.length,
  requiredCount:items.filter(item=>item?.retrievalRequired===true).length,
  optionalCount:items.filter(item=>item?.retrievalRequired!==true).length,
  selectedCardIds,
  expectedCardIds:expected,
  missingAnchorCardIds,
  expectedApplicationKinds,
  missingApplicationKindsByCard,
  missingApplicationCardIds,
  goalCoverage,
  missingGoalCoverage,
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
 return {evidenceId:evidence.evidenceId,cardId:evidence.cardId,position:evidence.position,claim:typeof item.claim==='string'?excerpt(item.claim,240):'',evidenceExcerpt:excerpt(evidence.text,360),kind:evidence.kind,tier:evidence.tier,source:evidence.source,sourceType:evidence.sourceType||evidenceSourceType(evidence.source),sourceLabel:evidence.sourceLabel,memoryStatus:evidence.memoryStatus??null,memoryUse:evidence.memoryUse??null,url:typeof evidence.url==='string'?evidence.url:null,retrievalReasons:evidence.retrievalReasons??[]};
}

function evidenceDetails(evidenceIds,evidenceById,maxExcerpt=220){
 return evidenceIds.map(id=>{const chunk=evidenceById.get(id);return {evidenceId:id,kind:chunk.kind,tier:chunk.tier,sourceType:chunk.sourceType||evidenceSourceType(chunk.source),sourceLabel:chunk.sourceLabel,memoryStatus:chunk.memoryStatus??null,memoryUse:chunk.memoryUse??null,evidenceExcerpt:excerpt(chunk.text,maxExcerpt)};});
}

export const GOAL_REFERENCE_TIERS=Object.freeze({advice:'application',comparison:'application',forecast:'reference',explanation:'anchor'});
const READING_GOALS=new Set(Object.keys(GOAL_REFERENCE_TIERS));
function hasGoalReference(goal,refs,goalSections,evidenceById){
 const tier=GOAL_REFERENCE_TIERS[goal];
 const evidenceIds=[...refs.map(reference=>reference.evidenceId),...goalSections.filter(section=>section.goal===goal).flatMap(section=>section.evidenceIds)];
 return evidenceIds.some(evidenceId=>{const evidence=evidenceById.get(evidenceId);return evidence?.tier===tier&&Array.isArray(evidence.retrievalGoals)&&evidence.retrievalGoals.includes(goal);});
}

const CLAIM_STOPWORDS=new Set(['牌面','牌义','牌位','线索','证据','说明','相关','内容','信息','支持','建议','本次','判断','分析']);
const CLAIM_GENERIC_TERMS=new Set(['行动','观察','方式','结果','现实','条件','方向','事情','问题','当前','具体','可能','需要','提供','一种','一个','对方']);
function claimSupportedByEvidence(claim,evidence,{allowGeneric=false,requireSentenceSupport=false}={}){
 const evidenceTerms=chineseNgrams(evidence?.text??'');
 // A supported sentence must not smuggle an unsupported clause after
 // punctuation, enumeration commas, or an explicit contrast/joiner.
 const sentences=String(claim??'').split(/(?:[。！？!?；;，,、\n]+|然而|但是|不过|同时|并且|而且|只是|然后|随后|因此|所以|以及|因为|并|而|且|还|也|但|却)/u).map(item=>item.trim()).filter(Boolean);
 if(!sentences.length)return false;
 let meaningful=false;
 for(const sentence of sentences){
  const claimTerms=[...chineseNgrams(sentence)].filter(term=>term.length>=2&&!CLAIM_STOPWORDS.has(term));
  const specificTerms=allowGeneric?claimTerms:claimTerms.filter(term=>!CLAIM_GENERIC_TERMS.has(term));
  if(!specificTerms.length)continue;
  meaningful=true;
  const supported=specificTerms.some(term=>evidenceTerms.has(term));
  if(requireSentenceSupport&&!supported)return false;
  if(!requireSentenceSupport&&supported)return true;
 }
 return requireSentenceSupport?meaningful:false;
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
const REALITY_BOUNDARY_PATTERN=/现实|核实|资料|专业|医生|律师|持牌|风险|证据|咨询|法规|评估|审查|验证|确认/u;
function hasRealityBoundary(text){
 const value=String(text??'').trim();
 return value.length>=8&&REALITY_BOUNDARY_PATTERN.test(value);
}
const COVERAGE_BOUNDARY_PATTERN=/证据|资料|信息|应用|覆盖|不足|有限|缺少|仅有核心|只能依据核心/u;
function hasCoverageBoundary(text){
 const value=String(text??'').trim();
 return value.length>=8&&COVERAGE_BOUNDARY_PATTERN.test(value);
}
const ABSOLUTE_CLAIM_PATTERN=/(?:百分之百|绝对|必然|肯定|一定|注定|保证)(?:.{0,4})(?:会|能|可以|不会|不能|复合|回来|联系|发生|实现|结婚|录取|升职|盈利|获利|解决|治愈|痊愈|安全|准确)/u;
const NEGATED_ABSOLUTE_PATTERN=/(?:不能|无法|不会|不代表|并不|不是|不保证|不意味着|不说明|不要|别|不应|不等于).{0,8}$/u;
function hasAbsoluteClaim(text){
 return String(text??'').split(/[。！？!?；;\n]+/u).some(segment=>{
  const match=segment.match(ABSOLUTE_CLAIM_PATTERN);if(!match)return false;
  return !NEGATED_ABSOLUTE_PATTERN.test(segment.slice(0,match.index));
 });
}

export function parseReadingOutput(content,{cards=[],evidence=[],requiredGoalEvidence=[],requiredActionGoalEvidence=[],allowedGoalSections=[],requiredGoalSections=[],requireGoalSections=false,requireGoalTextCoverage=false,requireGoalReferenceCoverage=false,requireCoverage=false,requireActions=false,requireReferences=false,requireReferenceClaims=false,requireReferenceSupport=false,requireCardReadingSupport=false,requireConcreteActions=false,requireActionReasons=false,requireActionReasonSupport=false,requireActionTextSupport=false,requireTextSupport=false,requireSynthesis=false,requireSynthesisSupport=false,requireSynthesisCardSupport=false,requireSynthesisAnchors=false,requireUncertainty=false,requireRealityBoundary=false,requireCoverageBoundary=false,requireCalibratedLanguage=false,requirePositionEvidence=false,allowClarification=true,isFollowUp=false}={}){
 const text=typeof content==='string'?content.trim():'';
 if(!text)throw Error('解读内容为空，请重试。');
 if(!text.startsWith('{')){
  if(requireCoverage||requireActions||requireReferences||requireSynthesis||requireUncertainty||requireRealityBoundary)throw Error('首轮解读必须返回结构化 JSON，请重试。');
  if(isFollowUp&&requireTextSupport&&!claimSupportedByEvidence(text,{text:evidence.map(item=>item?.text??'').join('；')},{allowGeneric:false,requireSentenceSupport:true}))throw Error('追问正文与证据不匹配，请重试。');
  return {text,synthesis:{text:'',evidenceIds:[]},goalSections:[],references:[],cardReadings:[],actions:[],needsClarification:false,clarification:'',followUp:'',uncertainty:''};
 }
 let data;try{data=JSON.parse(text);}catch{throw Error('解读格式不正确，请重试。');}
 if(!data||typeof data.text!=='string'||!data.text.trim()||data.text.length>20_000)throw Error('解读格式不正确，请重试。');
 const evidenceById=new Map(evidence.map(item=>[item.evidenceId,item])),cardsById=new Map(cards.map(item=>[item.id,item]));
 if(data.needsClarification!==undefined&&typeof data.needsClarification!=='boolean')throw Error('澄清问题格式不正确，请重试。');
 const needsClarification=data.needsClarification===true,clarification=excerpt(data.clarification??'',500);
 if(needsClarification&&allowClarification===false)throw Error('明确主题不允许跳过首轮解读，请重试。');
 if(needsClarification&&!isConcreteClarification(clarification))throw Error('澄清问题格式不正确，请重试。');
 if(needsClarification&&((Array.isArray(data.goalSections)&&data.goalSections.length>0)||(Array.isArray(data.cardReadings)&&data.cardReadings.length>0)||(Array.isArray(data.actions)&&data.actions.length>0)||(Array.isArray(data.references)&&data.references.length>0)||(data.synthesis&&((typeof data.synthesis.text==='string'&&data.synthesis.text.trim())||(Array.isArray(data.synthesis.evidenceIds)&&data.synthesis.evidenceIds.length>0)))))throw Error('澄清时不能同时返回结构化解读，请重试。');
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
 if(requireReferenceSupport&&!needsClarification&&refs.some(reference=>!claimSupportedByEvidence(reference.claim,evidenceById.get(reference.evidenceId),{allowGeneric:false,requireSentenceSupport:true})))throw Error('引用说明与证据不匹配，请重试。');
 let goalSections=[];
 if(data.goalSections!==undefined){
  if(!Array.isArray(data.goalSections)||data.goalSections.length>4)throw Error('目标分段格式不正确，请重试。');
  const requested=[...new Set((Array.isArray(requiredGoalSections)?requiredGoalSections:[]).filter(goal=>READING_GOALS.has(goal)))],allowed=[...new Set((Array.isArray(allowedGoalSections)&&allowedGoalSections.length?allowedGoalSections:requested).filter(goal=>READING_GOALS.has(goal)))],allowedGoals=new Set(allowed),requestedGoals=new Set(requested),seenGoals=new Set();
  goalSections=data.goalSections.map((item,index)=>{
   if(!item||typeof item!=='object'||!READING_GOALS.has(item.goal)||seenGoals.has(item.goal)||typeof item.text!=='string'||!item.text.trim()||item.text.length>4_000||!Array.isArray(item.evidenceIds)||item.evidenceIds.length<1||item.evidenceIds.length>8||item.evidenceIds.some(id=>typeof id!=='string'))throw Error('目标分段格式不正确，请重试。');
   if(allowed.length&&!allowedGoals.has(item.goal))throw Error('目标分段目标未被本轮路由，请重试。');
   if(requireGoalSections&&!requestedGoals.has(item.goal))throw Error('目标分段目标未被本轮路由，请重试。');
   if(requireGoalSections&&requested[index]!==item.goal)throw Error('目标分段顺序不符合本轮目标计划，请重试。');
   const evidenceIds=item.evidenceIds.map(id=>{const chunk=evidenceById.get(id);if(!chunk||!Array.isArray(chunk.retrievalGoals)||!chunk.retrievalGoals.includes(item.goal))throw Error('目标分段引用无效，请重试。');return chunk.evidenceId;});
   const requiredTier=GOAL_REFERENCE_TIERS[item.goal],hasAvailableRequiredTier=[...evidenceById.values()].some(chunk=>chunk?.tier===requiredTier&&Array.isArray(chunk.retrievalGoals)&&chunk.retrievalGoals.includes(item.goal));
   if((!isFollowUp||requireGoalReferenceCoverage)&&!needsClarification&&hasAvailableRequiredTier&&!evidenceIds.some(id=>evidenceById.get(id)?.tier===requiredTier))throw Error('目标分段缺少目标层级证据，请重试。');
   if(!needsClarification&&!claimSupportedByEvidence(item.text,{text:evidenceIds.map(id=>evidenceById.get(id)?.text??'').join('；')},{allowGeneric:false,requireSentenceSupport:true}))throw Error('目标分段内容与证据不匹配，请重试。');
   seenGoals.add(item.goal);const uniqueIds=[...new Set(evidenceIds)];return {goal:item.goal,text:excerpt(item.text,4_000),evidenceIds:uniqueIds,evidence:evidenceDetails(uniqueIds,evidenceById)};
  });
 }
 if(requireGoalSections&&!needsClarification){
  const required=[...new Set((Array.isArray(requiredGoalSections)?requiredGoalSections:[]).filter(goal=>READING_GOALS.has(goal)))];
  if(required.some(goal=>!goalSections.some(item=>item.goal===goal)))throw Error('首轮解读必须按目标分别返回目标分段，请重试。');
 }
 let goalTextCoverageOk=true;
 if(requireGoalTextCoverage&&!needsClarification&&goalSections.length>1){
  const targets=[...new Set((Array.isArray(requiredGoalSections)&&requiredGoalSections.length?requiredGoalSections:goalSections.map(item=>item.goal)).filter(goal=>READING_GOALS.has(goal)))];
  for(const goal of targets){
   const section=goalSections.find(item=>item.goal===goal);
   const sectionIds=section?.evidenceIds??[];
   const referenceIds=refs.filter(reference=>evidenceById.get(reference.evidenceId)?.retrievalGoals?.includes(goal)).map(reference=>reference.evidenceId);
   const goalEvidenceIds=[...new Set([...sectionIds,...referenceIds])];
   const goalEvidence=goalEvidenceIds.map(id=>evidenceById.get(id)?.text??'').join('；');
   if(section&&!claimSupportedByEvidence(data.text,{text:goalEvidence},{allowGeneric:false,requireSentenceSupport:false}))goalTextCoverageOk=false;
  }
 }
 let synthesis={text:'',evidenceIds:[]};let synthesisSupportOk=true;
 if(data.synthesis!==undefined){
  if(!data.synthesis||typeof data.synthesis!=='object'||typeof data.synthesis.text!=='string'||!data.synthesis.text.trim()||data.synthesis.text.length>4_000||!Array.isArray(data.synthesis.evidenceIds)||data.synthesis.evidenceIds.length<1||data.synthesis.evidenceIds.length>12||data.synthesis.evidenceIds.some(id=>typeof id!=='string'))throw Error('综合解读格式不正确，请重试。');
  const evidenceIds=data.synthesis.evidenceIds.map(id=>{const chunk=evidenceById.get(id);if(!chunk||chunk.source==='memory'||chunk.cardId===null)throw Error('综合解读引用无效，请重试。');return chunk.evidenceId;});
  synthesis={text:excerpt(data.synthesis.text,4_000),evidenceIds:[...new Set(evidenceIds)]};synthesis.evidence=evidenceDetails(synthesis.evidenceIds,evidenceById);
  if(requireSynthesisSupport&&!needsClarification&&!claimSupportedByEvidence(synthesis.text,{text:evidenceIds.map(id=>evidenceById.get(id)?.text??'').join('；')},{allowGeneric:false,requireSentenceSupport:true}))synthesisSupportOk=false;
 }
 if(requireSynthesis&&!needsClarification){
  const coveredCards=new Set(synthesis.evidenceIds.map(id=>evidenceById.get(id)?.cardId).filter(Boolean));
  if(!synthesis.text||!synthesis.evidenceIds.length||cards.length>1&&cards.some(card=>!coveredCards.has(card.id)))throw Error('首轮综合解读没有覆盖全部牌面，请重试。');
  if(requireSynthesisAnchors&&cards.some(card=>!synthesis.evidenceIds.some(id=>evidenceById.get(id)?.cardId===card.id&&evidenceById.get(id)?.retrievalRequired===true)))throw Error('首轮综合解读必须引用每张牌的核心锚点，请重试。');
  if(requireSynthesisCardSupport&&cards.length>1&&cards.some(card=>!synthesis.evidenceIds.some(id=>evidenceById.get(id)?.cardId===card.id&&claimSupportedByEvidence(synthesis.text,evidenceById.get(id),{allowGeneric:false}))))synthesisSupportOk=false;
 }
 let cardReadings=[];let cardReadingSupportOk=true,cardPositionEvidenceOk=true;
 if(requireCoverage&&!needsClarification&&data.cardReadings===undefined)throw Error('首轮解读必须包含逐牌解读，请重试。');
 if(data.cardReadings!==undefined){
  if(!Array.isArray(data.cardReadings)||data.cardReadings.length>12)throw Error('逐牌解读格式不正确，请重试。');
  const seen=new Set();
  cardReadings=data.cardReadings.map(item=>{
   if(!item||typeof item.cardId!=='string'||seen.has(item.cardId)||!cardsById.has(item.cardId)||typeof item.position!=='string'||typeof item.reading!=='string'||!item.reading.trim()||item.reading.length>4_000||!Array.isArray(item.evidenceIds)||item.evidenceIds.length<1||item.evidenceIds.length>8)throw Error('逐牌解读格式不正确，请重试。');
   const card=cardsById.get(item.cardId);if(card.position!==item.position)throw Error('逐牌解读牌位不匹配。');
   const orientation=card.reversed===true?'逆位':card.reversed===false?'正位':card.orientation??'未知方向';
   const evidenceIds=item.evidenceIds.map(id=>{const chunk=evidenceById.get(id);if(!chunk||chunk.cardId!==item.cardId||chunk.position!==item.position)throw Error('逐牌解读引用无效。');return chunk.evidenceId;});
   if(requireCardReadingSupport&&!needsClarification&&!evidenceIds.some(id=>claimSupportedByEvidence(item.reading,evidenceById.get(id),{allowGeneric:false,requireSentenceSupport:true})))cardReadingSupportOk=false;
   if(requireCoverage&&!needsClarification&&!evidenceIds.some(id=>evidenceById.get(id)?.retrievalRequired===true))throw Error('逐牌解读必须引用该牌的核心锚点，请重试。');
   if(requirePositionEvidence&&!needsClarification&&evidence.some(candidate=>candidate?.cardId===card.id&&candidate?.position===card.position&&candidate?.retrievalReasons?.includes('position_match'))&&!evidenceIds.some(id=>evidenceById.get(id)?.retrievalReasons?.includes('position_match')))cardPositionEvidenceOk=false;
   seen.add(item.cardId);return {cardId:item.cardId,position:item.position,orientation,reading:excerpt(item.reading,4_000),evidenceIds,evidence:evidenceDetails(evidenceIds,evidenceById)};
  });
  if(requireCoverage&&!needsClarification&&(cardReadings.length!==cards.length||cards.some(card=>!seen.has(card.id))))throw Error('首轮解读没有覆盖全部牌面。');
 }
 let actions=[];let actionsConcrete=true,actionsReasoned=true,actionsReasonSupported=true,actionsTextSupported=true,actionsGoalTierSupported=true;
 const actionGoals=[...new Set((Array.isArray(requiredActionGoalEvidence)?requiredActionGoalEvidence:[]).filter(goal=>GOAL_REFERENCE_TIERS[goal]))];
 const availableActionGoals=actionGoals.filter(goal=>[...evidenceById.values()].some(item=>item?.tier===GOAL_REFERENCE_TIERS[goal]&&Array.isArray(item.retrievalGoals)&&item.retrievalGoals.includes(goal)));
 if(data.actions!==undefined){
  const actionLimit=requireActions&&!needsClarification?3:6;
  if(!Array.isArray(data.actions)||data.actions.length>actionLimit)throw Error('行动建议格式不正确，请重试。');
  actions=data.actions.map(item=>{
   if(!item||typeof item.text!=='string'||!item.text.trim()||item.text.length>600||typeof item.evidenceIds===undefined||!Array.isArray(item.evidenceIds)||item.evidenceIds.length<1||item.evidenceIds.length>8||item.evidenceIds.some(id=>typeof id!=='string'))throw Error('行动建议格式不正确，请重试。');
   const evidenceIds=item.evidenceIds.map(id=>{if(!evidenceById.has(id))throw Error('行动建议引用无效，请重试。');return id;});
   if(!evidenceIds.some(id=>['anchor','application','personal'].includes(evidenceById.get(id)?.tier)))throw Error('行动建议必须引用核心或应用证据，请重试。');
   if(item.reason!==undefined&&typeof item.reason!=='string')throw Error('行动建议格式不正确，请重试。');
   if(requireActionReasons&&!needsClarification&&(!item.reason||!item.reason.trim()))actionsReasoned=false;
   if((requireActionReasonSupport||isFollowUp)&&!needsClarification&&item.reason!==undefined&&!claimSupportedByEvidence(item.reason,{text:evidenceIds.map(id=>evidenceById.get(id)?.text??'')},{allowGeneric:false,requireSentenceSupport:true}))actionsReasonSupported=false;
   if((requireActionTextSupport||isFollowUp)&&!needsClarification&&!claimSupportedByEvidence(item.text,{text:evidenceIds.map(id=>evidenceById.get(id)?.text??'')},{allowGeneric:false,requireSentenceSupport:true}))actionsTextSupported=false;
   if(requireConcreteActions&&!needsClarification&&!isConcreteAction(item.text))actionsConcrete=false;
   if(!needsClarification&&availableActionGoals.length&&!evidenceIds.some(id=>availableActionGoals.some(goal=>evidenceById.get(id)?.tier===GOAL_REFERENCE_TIERS[goal]&&Array.isArray(evidenceById.get(id)?.retrievalGoals)&&evidenceById.get(id).retrievalGoals.includes(goal))))actionsGoalTierSupported=false;
   return {text:excerpt(item.text,600),reason:excerpt(item.reason??'',500),evidenceIds,evidence:evidenceDetails(evidenceIds,evidenceById)};
  });
 }
 if(requireActions&&!needsClarification&&actions.length<1)throw Error('首轮解读需要行动建议，请重试。');
 for(const value of ['followUp','uncertainty'])if(data[value]!==undefined&&typeof data[value]!=='string')throw Error('解读格式不正确，请重试。');
 const uncertainty=excerpt(data.uncertainty??'',500);
 if((requireUncertainty||requireRealityBoundary)&&!needsClarification&&!uncertainty)throw Error(requireRealityBoundary?'高风险问题需要现实依据说明，请重试。':'首轮解读必须包含不确定性说明，请重试。');
 if(requireRealityBoundary&&!needsClarification&&!hasRealityBoundary(uncertainty))throw Error('高风险问题需要现实依据说明，请重试。');
 if(requireCoverageBoundary&&!needsClarification&&!hasCoverageBoundary(uncertainty))throw Error('证据覆盖不足时必须说明应用资料限制，请重试。');
 if(requireCardReadingSupport&&!needsClarification&&!cardReadingSupportOk)throw Error('逐牌解读内容与证据不匹配，请重试。');
 if(requireSynthesisSupport&&!needsClarification&&!synthesisSupportOk)throw Error('综合解读内容与证据不匹配，请重试。');
 if(requireConcreteActions&&!needsClarification&&!actionsConcrete)throw Error('行动建议必须包含可观察的完成标准，请重试。');
 if(requireActionReasons&&!needsClarification&&!actionsReasoned)throw Error('首轮行动建议必须说明与牌面相关的理由，请重试。');
 if((requireActionReasonSupport||isFollowUp)&&!needsClarification&&!actionsReasonSupported)throw Error('行动理由与牌面证据不匹配，请重试。');
 if(!needsClarification&&availableActionGoals.length&&!actionsGoalTierSupported)throw Error('首轮行动建议缺少当前目标的应用证据，请重试。');
 if(requirePositionEvidence&&!needsClarification&&!cardPositionEvidenceOk)throw Error('逐牌解读必须引用可用的牌位语义证据，请重试。');
 if(requireGoalTextCoverage&&!needsClarification&&!goalTextCoverageOk)throw Error('混合目标正文没有覆盖每个回答目标，请重试。');
 const structuredFollowUp=isFollowUp&&!needsClarification&&(refs.length>0||goalSections.length>0||cardReadings.length>0||synthesis.evidenceIds.length>0||actions.length>0);
 if((requireTextSupport||structuredFollowUp)&&!needsClarification){
  const groundedEvidenceIds=[...new Set(isFollowUp
   ? [...refs.map(item=>item.evidenceId),...goalSections.flatMap(item=>item.evidenceIds),...synthesis.evidenceIds,...cardReadings.flatMap(item=>item.evidenceIds),...actions.flatMap(item=>item.evidenceIds)]
   : [...refs.map(item=>item.evidenceId),...goalSections.flatMap(item=>item.evidenceIds)])];
  const groundedText=groundedEvidenceIds.map(id=>evidenceById.get(id)?.text??'').join('；');
  if(!claimSupportedByEvidence(data.text,{text:groundedText},{allowGeneric:false,requireSentenceSupport:true}))throw Error(structuredFollowUp?'追问正文与证据不匹配，请重试。':'解读正文与证据不匹配，请重试。');
 }
 if((requireActionTextSupport||isFollowUp)&&!needsClarification&&!actionsTextSupported)throw Error('行动建议内容与证据不匹配，请重试。');
 if(requireCalibratedLanguage&&!needsClarification&&hasAbsoluteClaim([data.text,...goalSections.map(item=>item.text),synthesis.text,...cardReadings.map(item=>item.reading),...actions.flatMap(item=>[item.text,item.reason]),...refs.map(item=>item.claim),data.followUp,uncertainty,data.clarification].filter(Boolean).join('\n')))throw Error('解读包含无法由牌面确认的绝对断言，请重试。');
 const enforceGoalReferenceCoverage=!isFollowUp||requireGoalReferenceCoverage;
 if(!needsClarification&&enforceGoalReferenceCoverage&&(!isFollowUp||structuredFollowUp)){
  const goals=[...new Set((Array.isArray(requiredGoalEvidence)?requiredGoalEvidence:[]).filter(goal=>GOAL_REFERENCE_TIERS[goal]))];
  const missing=goals.filter(goal=>[...evidenceById.values()].some(item=>item?.retrievalGoals?.includes(goal)&&item.tier===GOAL_REFERENCE_TIERS[goal])&&!hasGoalReference(goal,refs,goalSections,evidenceById));
  if(missing.length)throw Error(isFollowUp?'追问引用没有覆盖当前回答目标，请重试。':'首轮引用没有覆盖当前回答目标，请重试。');
 }
 return {text:data.text.trim(),synthesis,goalSections,references:refs,cardReadings,actions,needsClarification,clarification,followUp:excerpt(data.followUp??'',500),uncertainty};
}
