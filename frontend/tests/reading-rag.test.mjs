import {test} from 'node:test';
import assert from 'node:assert/strict';
import {retrieveReadingEvidence,retrieveReadingEvidenceAsync,rerankReadingEvidence,retrieveMemoryEvidence,summarizeReadingEvidence,parseReadingOutput,requiresProfessionalBoundary,analyzeReadingQuestion,readingQueryFor,readingRetrievalFor} from '../server/reading-rag.mjs';

const cards=[
 {id:'m08',reversed:false,position:'建议'},
 {id:'c06',reversed:true,position:'关系挑战'},
];

test('question analysis exposes transparent routing hints without inventing a theme',()=>{
 const relationship=analyzeReadingQuestion('我们之间的沟通和边界要怎么调整？');
 assert.deepEqual(relationship.themes,['relationship']);
 assert.equal(relationship.confidence,'focused');
 assert.ok(relationship.matchedTerms.includes('沟通'));
 assert.ok(relationship.themeScores.relationship>0);
 const open=analyzeReadingQuestion('我最近想看看牌。');
 assert.deepEqual(open.themes,[]);
 assert.equal(open.ambiguous,true);
 assert.equal(open.confidence,'open');
});

test('question routing prefers explicit career terms over weak relationship pronouns',()=>{
 const career=analyzeReadingQuestion('他对我的工作评价，下一步怎么做？');
 assert.deepEqual(career.themes,['career']);
 assert.equal(career.confidence,'focused');
 assert.ok(career.themeScores.career>career.themeScores.relationship);
 const pronoun=analyzeReadingQuestion('他最近会联系我吗？');
 assert.deepEqual(pronoun.themes,['relationship']);
 assert.equal(pronoun.confidence,'focused');
});

test('question routing recognizes common synonyms across reading intents',()=>{
 const career=analyzeReadingQuestion('我想跳槽，怎么准备面试？');
 assert.deepEqual(career.themes,['career']);
 assert.ok(career.matchedTerms.includes('跳槽'));
 const relationship=analyzeReadingQuestion('我们最近冷战，如何重新联系？');
 assert.deepEqual(relationship.themes,['relationship']);
 const reflection=analyzeReadingQuestion('我最近很焦虑，也感到疲惫，怎么调整？');
 assert.deepEqual(reflection.themes,['reflection']);
});

test('question routing distinguishes the requested response goal',()=>{
 const advice=analyzeReadingQuestion('我该怎么和对方沟通？');
 assert.deepEqual(advice.goals,['advice']);
 assert.equal(advice.goalConfidence,'focused');
 const forecast=analyzeReadingQuestion('我们之后会不会复合？');
 assert.deepEqual(forecast.goals,['forecast']);
 const comparison=analyzeReadingQuestion('两个机会哪个利弊更合适？');
 assert.deepEqual(comparison.goals,['comparison']);
});

test('active reading query follows the latest real user message',()=>{
 const history=[{role:'assistant',text:'之前的回答'},{role:'user',text:'我的工作压力很大，下一步怎么安排？'}];
 assert.equal(readingQueryFor('原始关系问题',history),'我的工作压力很大，下一步怎么安排？');
 assert.equal(readingQueryFor('原始关系问题',[{role:'assistant',text:'只有回答'}]),'原始关系问题');
});

test('generic follow-ups inherit the original theme for retrieval continuity',()=>{
 const result=readingRetrievalFor('我该如何处理这段关系？',[{role:'assistant',text:'上一轮回答',source:'ai'},{role:'user',text:'那我该怎么做？'}]);
 assert.equal(result.activeQuestion,'那我该怎么做？');
 assert.equal(result.inheritedOriginal,true);
 assert.ok(result.retrievalQuestion.includes('我该如何处理这段关系？'));
 assert.deepEqual(result.retrievalMeta.themes,['relationship']);
});

test('retrieval always grounds each selected card in orientation and provenance',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards});
 assert.ok(evidence.length>=4&&evidence.length<=12);
 assert.deepEqual(new Set(evidence.map(item=>item.cardId)),new Set(['m08','c06']));
 assert.ok(evidence.some(item=>item.cardId==='m08'&&item.kind==='orientation'));
 assert.ok(evidence.every(item=>item.evidenceId&&item.source&&item.text));
});

test('retrieval labels evidence hierarchy and deterministic reasons',()=>{
 const evidence=retrieveReadingEvidence({question:'关系中如何平静说出感受和底线？',cards:[cards[0]]});
 const anchor=evidence.find(item=>item.kind==='orientation');
 const application=evidence.find(item=>item.kind==='relationships');
 assert.equal(anchor.tier,'anchor');
 assert.ok(anchor.retrievalReasons.includes('required_anchor'));
 assert.equal(application.tier,'application');
 assert.ok(application.retrievalReasons.includes('theme_match'));
 assert.ok(application.retrievalTerms.includes('感受'));
 assert.deepEqual(application.retrievalThemes,['relationship']);
 assert.equal(application.retrievalMethod,'bm25+rules+expansion-v1');
 assert.ok(application.retrievalDirectTerms.includes('感受'));
 assert.equal(typeof application.retrievalScore,'number');
 assert.ok(evidence.some(item=>item.retrievalReasons.includes('keyword_match')));
});

test('retrieval exposes response-goal signals for application evidence',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎么平静说出感受？',cards:[cards[0]]});
 const application=evidence.find(item=>item.kind==='relationships');
 assert.ok(application.retrievalGoals.includes('advice'));
 assert.ok(application.retrievalReasons.includes('goal_match'));
});

test('retrieval keeps direct and low-weight lexicon expansion terms separate',()=>{
 const evidence=retrieveReadingEvidence({question:'我想跳槽，怎么准备？',cards:[{id:'m00',reversed:false,position:'建议'}]});
 const work=evidence.find(item=>item.kind==='work');
 assert.ok(work.retrievalExpandedTerms.includes('辞职'));
 assert.ok(!work.retrievalDirectTerms.includes('辞职'));
});

test('retrieval selects relationship context for relationship questions',()=>{
 const evidence=retrieveReadingEvidence({question:'我们之间的沟通和边界要怎么调整？',cards:[cards[0]]});
 assert.ok(evidence.some(item=>item.kind==='relationships'));
 assert.ok(!evidence.some(item=>item.kind==='work'));
});

test('focused career retrieval excludes unrelated relationship application chunks',()=>{
 const evidence=retrieveReadingEvidence({question:'我该如何规划这次转行和下一步行动？',cards:[cards[0]]});
 assert.ok(evidence.some(item=>item.kind==='work'));
 assert.ok(!evidence.some(item=>item.kind==='relationships'));
});

test('mixed questions retain one application chunk for each explicit domain',()=>{
 const evidence=retrieveReadingEvidence({question:'我该如何处理这段关系，同时规划接下来的工作？',cards:[cards[0]],maxPerCard:5});
 assert.ok(evidence.some(item=>item.kind==='relationships'));
 assert.ok(evidence.some(item=>item.kind==='work'));
});

test('global evidence budget keeps anchors for every card before optional chunks',()=>{
 const evidence=retrieveReadingEvidence({question:'我该如何处理这段关系？',cards,maxPerCard:5,maxTotalEvidence:5});
 assert.equal(evidence.length,5);
 assert.equal(evidence.filter(item=>item.retrievalRequired).length,4);
 for(const card of cards){
  assert.ok(evidence.some(item=>item.cardId===card.id&&item.kind==='symbolism'));
  assert.ok(evidence.some(item=>item.cardId===card.id&&item.kind==='orientation'));
 }
});

test('semantic reranker hook changes optional ordering without displacing anchors',()=>{
 const base=retrieveReadingEvidence({question:'我该如何处理这段关系？',cards:[{id:'m08',reversed:false,position:'建议'}],maxPerCard:7,maxTotalEvidence:4});
 assert.equal(base.length,4);
 assert.equal(base[0].retrievalRequired,true);
 const boosted=retrieveReadingEvidence({question:'我该如何处理这段关系？',cards:[{id:'m08',reversed:false,position:'建议'}],maxPerCard:7,maxTotalEvidence:4,semanticScores:{'m08:modern':1}});
 assert.equal(boosted.length,4);
 assert.equal(boosted[0].retrievalRequired,true);
 const modern=boosted.find(item=>item.kind==='modern');
 assert.equal(modern.retrievalSemanticScore,1);
 assert.ok(modern.retrievalMethod.endsWith('+semantic-v1'));
 assert.equal(modern.retrievalScore,9);
 const direct=rerankReadingEvidence([{evidenceId:'x',retrievalScore:2,retrievalRequired:false,retrievalMethod:'test'}],{semanticScores:new Map([['x',2]]),maxTotalEvidence:1,semanticWeight:4});
 assert.equal(direct[0].retrievalSemanticScore,1);
 assert.equal(direct[0].retrievalScore,6);
 const malformed=rerankReadingEvidence([{evidenceId:'bad',retrievalScore:'not-a-number',retrievalRequired:false,retrievalMethod:'test'}],{maxTotalEvidence:1});
 assert.equal(malformed[0].retrievalScore,0);
});

test('global optional selection rotates across cards before taking a second chunk',()=>{
 const evidence=retrieveReadingEvidence({question:'我该如何处理这段关系？',cards:[
  {id:'m08',reversed:false,position:'建议'},
  {id:'c06',reversed:true,position:'关系挑战'},
  {id:'w01',reversed:false,position:'过去'},
 ],maxPerCard:7,maxTotalEvidence:9});
 const optional=evidence.filter(item=>!item.retrievalRequired);
 assert.equal(optional.length,3);
 assert.equal(new Set(optional.map(item=>item.cardId)).size,3);
});

test('async semantic reranker receives full candidates and falls back on failure',async()=>{
 const seen=[];
 const boosted=await retrieveReadingEvidenceAsync({question:'我该如何处理这段关系？',cards:[{id:'m08',reversed:false,position:'建议'}],maxPerCard:7,maxTotalEvidence:4,semanticReranker:async({evidence})=>{seen.push(evidence.length);return {'m08:modern':1};}});
 assert.equal(seen[0],5);
 assert.equal(boosted.find(item=>item.kind==='modern').retrievalSemanticScore,1);
 const fallback=await retrieveReadingEvidenceAsync({question:'我该如何处理这段关系？',cards:[{id:'m08',reversed:false,position:'建议'}],maxPerCard:7,maxTotalEvidence:4,semanticReranker:async()=>{throw Error('offline');}});
 assert.ok(fallback.every(item=>item.retrievalSemanticScore===0));
 const timed=await retrieveReadingEvidenceAsync({question:'我该如何处理这段关系？',cards:[{id:'m08',reversed:false,position:'建议'}],maxTotalEvidence:4,semanticTimeoutMs:5,semanticReranker:()=>new Promise(()=>{})});
 assert.ok(timed.every(item=>item.retrievalSemanticScore===0));
});

test('evidence summary reports tier and per-card coverage for prompt diagnostics',()=>{
 const evidence=retrieveReadingEvidence({question:'我该如何处理这段关系？',cards});
 const summary=summarizeReadingEvidence(evidence,cards);
 assert.equal(summary.total,evidence.length);
 assert.equal(summary.requiredCount,4);
 assert.deepEqual(summary.missingAnchorCardIds,[]);
 assert.equal(summary.perCard.m08.hasSymbolism,true);
 assert.equal(summary.perCard.m08.hasOrientation,true);
 assert.ok(summary.tiers.anchor>=4);
 assert.equal(summary.semanticCount,0);
});

test('memory retrieval is opt-in and ranks user-confirmed context by the question',()=>{
 const evidence=retrieveMemoryEvidence({question:'做重要决定前我该如何安排自己？',memories:[
  {id:'m1',text:'做重要决定前，我需要先独处整理思绪。',enabled:true},
  {id:'m2',text:'我喜欢在周末散步。',enabled:true},
  {id:'m3',text:'这条记录不应发送。',enabled:false},
 ]});
 assert.equal(evidence[0].evidenceId,'memory:m1');
 assert.ok(!evidence.some(item=>item.evidenceId==='memory:m2'));
 assert.ok(!evidence.some(item=>item.evidenceId==='memory:m3'));
 assert.ok(evidence.every(item=>item.source==='memory'&&item.cardId===null));
 assert.equal(evidence[0].tier,'personal');
 assert.deepEqual(evidence[0].retrievalReasons,['memory_keyword_match']);
});

test('memory retrieval returns no unrelated personal records',()=>{
 const evidence=retrieveMemoryEvidence({question:'我该如何准备考试？',memories:[{id:'m1',text:'我喜欢在周末散步。',enabled:true},{id:'m2',text:'家里的猫叫月光。',enabled:true}]});
 assert.deepEqual(evidence,[]);
});

test('structured output accepts only references from the retrieved evidence set',()=>{
 const evidence=retrieveReadingEvidence({question:'我每天学习两小时，如何保持？',cards:[cards[0]]});
 const valid=JSON.stringify({text:'把稳定节奏拆成可执行的小步。',references:[{evidenceId:evidence[0].evidenceId,cardId:'m08',position:'建议',claim:'稳定节奏'}],followUp:'你最容易在哪个时段中断？',uncertainty:'牌义是反思线索，不是事实证明。'});
 const parsed=parseReadingOutput(valid,{cards,evidence});
 assert.equal(parsed.text,'把稳定节奏拆成可执行的小步。');
 assert.equal(parsed.references[0].evidenceId,evidence[0].evidenceId);
 assert.equal(parsed.references[0].tier,evidence[0].tier);
 assert.equal(parsed.references[0].sourceLabel,evidence[0].sourceLabel);
 assert.deepEqual(parsed.references[0].retrievalReasons,evidence[0].retrievalReasons);
 assert.equal(parsed.followUp,'你最容易在哪个时段中断？');
 assert.throws(()=>parseReadingOutput(JSON.stringify({text:'x',references:[{evidenceId:'fake',cardId:'m08',position:'建议'}]}),{cards,evidence}),/引用证据无效/);
});

test('structured output deduplicates repeated evidence references',()=>{
 const evidence=retrieveReadingEvidence({question:'我每天学习两小时，如何保持？',cards:[cards[0]]});
 const reference={evidenceId:evidence[0].evidenceId,cardId:'m08',position:'建议',claim:'稳定节奏'};
 const parsed=parseReadingOutput(JSON.stringify({text:'保持稳定节奏。',references:[reference,reference]}),{cards:[cards[0]],evidence});
 assert.equal(parsed.references.length,1);
 assert.equal(parsed.references[0].evidenceId,evidence[0].evidenceId);
});

test('reference deduplication preserves unique evidence after repeated entries',()=>{
 const evidence=retrieveReadingEvidence({question:'我每天学习两小时，如何保持？',cards:[cards[0]]});
 const first={evidenceId:evidence[0].evidenceId,cardId:'m08',position:'建议',claim:'稳定节奏'};
 const second={evidenceId:evidence[1].evidenceId,cardId:'m08',position:'建议',claim:'力量'};
 const parsed=parseReadingOutput(JSON.stringify({text:'保持稳定节奏。',references:[...Array(24).fill(first),second]}),{cards:[cards[0]],evidence});
 assert.deepEqual(parsed.references.map(item=>item.evidenceId),[first.evidenceId,second.evidenceId]);
});

test('structured output can cite relevant personal memory with null card coordinates',()=>{
 const memory=retrieveMemoryEvidence({question:'做重要决定前我该如何安排自己？',memories:[{id:'m1',text:'做重要决定前，我需要先独处整理思绪。',enabled:true}]});
 const output=JSON.stringify({text:'把先独处整理思绪作为可执行的准备。',references:[{evidenceId:'memory:m1',cardId:null,position:null,claim:'先独处整理思绪'}]});
 const parsed=parseReadingOutput(output,{cards:[cards[0]],evidence:memory});
 assert.equal(parsed.references[0].cardId,null);
 assert.equal(parsed.references[0].position,null);
 assert.equal(parsed.references[0].tier,'personal');
 assert.throws(()=>parseReadingOutput(JSON.stringify({text:'x',references:[{evidenceId:'memory:m1',cardId:'m08',position:'建议',claim:'先独处'}]}),{cards:[cards[0]],evidence:memory}),/引用证据无效/);
});

test('first-reading output must cover every selected card with grounded evidence',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards});
 const refs=cards.map(card=>{const item=evidence.find(e=>e.cardId===card.id&&e.kind==='orientation');return {evidenceId:item.evidenceId,cardId:card.id,position:card.position,claim:item.text.slice(0,4)};});
 const valid=JSON.stringify({text:'逐张说明并综合关系。',references:refs,cardReadings:cards.map(card=>({cardId:card.id,position:card.position,reading:'结合牌位说明一个可观察的角度。',evidenceIds:[refs.find(ref=>ref.cardId===card.id).evidenceId]}))});
 assert.equal(parseReadingOutput(valid,{cards,evidence,requireCoverage:true}).cardReadings.length,2);
 const missing=JSON.stringify({text:'只解释一张牌。',references:[refs[0]],cardReadings:[{cardId:cards[0].id,position:cards[0].position,reading:'只解释第一张。',evidenceIds:[refs[0].evidenceId]}]});
 assert.throws(()=>parseReadingOutput(missing,{cards,evidence,requireCoverage:true}),/没有覆盖全部牌面/);
});

test('first-reading card explanations must cite a core anchor',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards:[cards[0]]});
 const application=evidence.find(item=>item.kind==='relationships');
 const output=JSON.stringify({text:'逐牌说明。',cardReadings:[{cardId:'m08',position:'建议',reading:'只引用应用语义。',evidenceIds:[application.evidenceId]}]});
 assert.throws(()=>parseReadingOutput(output,{cards:[cards[0]],evidence,requireCoverage:true}),/核心锚点/);
});

test('first structured reading requires a top-level reference for every card',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards});
 const refs=cards.map(card=>{const item=evidence.find(e=>e.cardId===card.id&&e.kind==='orientation');return {evidenceId:item.evidenceId,cardId:card.id,position:card.position,claim:item.text.slice(0,4)};});
 const missingReference=JSON.stringify({text:'逐张说明并综合关系。',cardReadings:cards.map(card=>({cardId:card.id,position:card.position,reading:'结合牌位说明一个可观察的角度。',evidenceIds:[refs.find(ref=>ref.cardId===card.id).evidenceId]})),actions:[{text:'先记录一次具体沟通，再复盘结果。',evidenceIds:[refs[0].evidenceId]}],references:[refs[0]]});
 assert.throws(()=>parseReadingOutput(missingReference,{cards,evidence,requireCoverage:true,requireActions:true,requireReferences:true}),/引用没有覆盖全部牌面/);
});

test('first structured references require a core anchor for every card',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards});
 const applicationRefs=cards.map(card=>{
  const item=evidence.find(e=>e.cardId===card.id&&e.kind==='relationships');
  return {evidenceId:item.evidenceId,cardId:card.id,position:card.position,claim:item.text.slice(0,4)};
 });
 const output=JSON.stringify({
  text:'逐张说明并综合关系。',
  cardReadings:cards.map(card=>{
   const item=evidence.find(e=>e.cardId===card.id&&e.kind==='orientation');
   return {cardId:card.id,position:card.position,reading:'结合牌位说明一个可观察的角度。',evidenceIds:[item.evidenceId]};
  }),
  actions:[{text:'先记录一次具体沟通，再复盘结果。',evidenceIds:[evidence[0].evidenceId]}],
  references:applicationRefs,
 });
 assert.throws(()=>parseReadingOutput(output,{cards,evidence,requireCoverage:true,requireActions:true,requireReferences:true,requireReferenceClaims:true}),/核心锚点/);
});

test('first structured citations require a concise support claim',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards:[cards[0]]});
 const orientation=evidence.find(item=>item.kind==='orientation');
 const output=JSON.stringify({text:'先观察再沟通。',cardReadings:[{cardId:'m08',position:'建议',reading:'观察一个可验证的角度。',evidenceIds:[orientation.evidenceId]}],actions:[{text:'今天记录一次沟通并在一周后复盘。',evidenceIds:[orientation.evidenceId]}],references:[{evidenceId:orientation.evidenceId,cardId:'m08',position:'建议'}]});
 assert.throws(()=>parseReadingOutput(output,{cards:[cards[0]],evidence,requireCoverage:true,requireActions:true,requireReferences:true,requireReferenceClaims:true}),/引用说明不能为空/);
 const unsupported=JSON.stringify({text:'先观察再沟通。',references:[{evidenceId:orientation.evidenceId,cardId:'m08',position:'建议',claim:'保证一定复合'}]});
 assert.throws(()=>parseReadingOutput(unsupported,{cards:[cards[0]],evidence,requireReferenceSupport:true}),/引用说明与证据不匹配/);
});

test('first reading synthesis must cite every selected card',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards});
 const refs=cards.map(card=>{const item=evidence.find(e=>e.cardId===card.id&&e.kind==='orientation');return {evidenceId:item.evidenceId,cardId:card.id,position:card.position,claim:item.text.slice(0,4)};});
 const base={text:'逐张说明并综合关系。',cardReadings:cards.map(card=>({cardId:card.id,position:card.position,reading:'结合牌位说明一个可观察的角度。',evidenceIds:[refs.find(ref=>ref.cardId===card.id).evidenceId]})),actions:[{text:'先记录一次具体沟通，再复盘结果。',evidenceIds:[refs[0].evidenceId]}],references:refs};
 const valid=parseReadingOutput(JSON.stringify({...base,synthesis:{text:'两张牌共同提示先稳定表达，再观察现实回应。',evidenceIds:refs.map(ref=>ref.evidenceId)}}),{cards,evidence,requireCoverage:true,requireActions:true,requireReferences:true,requireReferenceClaims:true,requireSynthesis:true});
 assert.equal(valid.synthesis.evidenceIds.length,2);
 assert.throws(()=>parseReadingOutput(JSON.stringify({...base,synthesis:{text:'只谈第一张牌。',evidenceIds:[refs[0].evidenceId]}}),{cards,evidence,requireCoverage:true,requireActions:true,requireReferences:true,requireReferenceClaims:true,requireSynthesis:true}),/综合解读没有覆盖全部牌面/);
});

test('clarification responses may pause interpretation while keeping strict validation available',()=>{
 const evidence=retrieveReadingEvidence({question:'我最近想看看牌。',cards:[cards[0]]});
 const clarification=JSON.stringify({text:'我想先确认你真正想探索的方向。',needsClarification:true,clarification:'这次更想看关系、事业，还是一个具体决定？',followUp:'请选择一个最想靠近的主题。'});
 const parsed=parseReadingOutput(clarification,{cards:[cards[0]],evidence,requireCoverage:true,requireActions:true,requireReferences:true});
 assert.equal(parsed.needsClarification,true);
 assert.equal(parsed.clarification,'这次更想看关系、事业，还是一个具体决定？');
 assert.deepEqual(parsed.cardReadings,[]);
 assert.throws(()=>parseReadingOutput(JSON.stringify({text:'请补充方向。',needsClarification:true}),{cards:[cards[0]],evidence,requireCoverage:true}),/澄清问题格式不正确/);
});

test('focused first readings cannot use clarification to bypass coverage',()=>{
 const evidence=retrieveReadingEvidence({question:'我该如何处理这段关系？',cards:[cards[0]]});
 const output=JSON.stringify({text:'请补充方向。',needsClarification:true,clarification:'你最想先看哪一部分？'});
 assert.throws(()=>parseReadingOutput(output,{cards:[cards[0]],evidence,requireCoverage:true,requireActions:true,requireReferences:true,allowClarification:false}),/明确主题不允许跳过首轮解读/);
});

test('structured actions must cite evidence from the current reading',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards:[cards[0]]});
 const valid=JSON.stringify({text:'先观察再沟通。',actions:[{text:'记录一次具体沟通中的事实与感受。',reason:'把抽象担忧变成可观察材料。',evidenceIds:[evidence[0].evidenceId]}]});
 const parsed=parseReadingOutput(valid,{cards:[cards[0]],evidence});
 assert.equal(parsed.actions[0].evidenceIds[0],evidence[0].evidenceId);
 assert.throws(()=>parseReadingOutput(JSON.stringify({text:'x',actions:[{text:'做点什么。',evidenceIds:['fake']}]}),{cards:[cards[0]],evidence}),/行动建议引用无效/);
});

test('first reading requires at least one structured action',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards:[cards[0]]});
 const orientation=evidence.find(item=>item.kind==='orientation');
 const output=JSON.stringify({text:'先观察再沟通。',cardReadings:[{cardId:'m08',position:'建议',reading:'观察一个可验证的角度。',evidenceIds:[orientation.evidenceId]}],references:[{evidenceId:orientation.evidenceId,cardId:'m08',position:'建议'}]});
 assert.throws(()=>parseReadingOutput(output,{cards:[cards[0]],evidence,requireCoverage:true,requireActions:true}),/首轮解读需要行动建议/);
});

test('first reading limits structured actions to three',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards:[cards[0]]});
 const orientation=evidence.find(item=>item.kind==='orientation');
 const output=JSON.stringify({
  text:'先观察再沟通。',
  cardReadings:[{cardId:'m08',position:'建议',reading:'观察一个可验证的角度。',evidenceIds:[orientation.evidenceId]}],
  actions:Array.from({length:4},(_,index)=>({text:`记录第${index+1}次沟通。`,evidenceIds:[orientation.evidenceId]})),
 });
 assert.throws(()=>parseReadingOutput(output,{cards:[cards[0]],evidence,requireCoverage:true,requireActions:true}),/行动建议格式不正确/);
});

test('high-stakes questions require an explicit reality-based boundary',()=>{
 const evidence=retrieveReadingEvidence({question:'这项投资要不要买？',cards:[cards[0]]});
 assert.equal(requiresProfessionalBoundary('这项投资要不要买？'),true);
 assert.equal(requiresProfessionalBoundary('这段关系如何沟通？'),false);
 const noBoundary=JSON.stringify({text:'可以放心买入。',references:[]});
 assert.throws(()=>parseReadingOutput(noBoundary,{cards:[cards[0]],evidence,requireUncertainty:true,requireRealityBoundary:true}),/高风险问题需要现实依据说明/);
 const grounded=JSON.stringify({text:'牌面只能作为反思线索。',uncertainty:'投资决定请依据风险承受能力、产品资料和持牌专业意见。'});
 assert.equal(parseReadingOutput(grounded,{cards:[cards[0]],evidence,requireUncertainty:true}).uncertainty,'投资决定请依据风险承受能力、产品资料和持牌专业意见。');
});

test('plain text provider responses stay backward compatible without inventing references',()=>{
 const parsed=parseReadingOutput('保持稳定练习。',{cards,evidence:[]});
 assert.deepEqual(parsed,{text:'保持稳定练习。',synthesis:{text:'',evidenceIds:[]},references:[],cardReadings:[],actions:[],needsClarification:false,clarification:'',followUp:'',uncertainty:''});
});

test('first readings reject plain text so the grounding contract cannot be bypassed',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards:[cards[0]]});
 assert.throws(()=>parseReadingOutput('保持稳定练习。',{cards:[cards[0]],evidence,requireCoverage:true,requireActions:true,requireReferences:true,requireReferenceClaims:true}),/首轮解读必须返回结构化 JSON/);
});
