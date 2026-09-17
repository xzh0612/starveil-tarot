import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GOAL_REFERENCE_TIERS,READING_CORPUS_STATUS,validateReadingCorpus,retrieveReadingEvidence,retrieveReadingEvidenceAsync,rerankReadingEvidence,retrieveMemoryEvidence,summarizeReadingEvidence,parseReadingOutput,requiresProfessionalBoundary,requiresPerspectiveBoundary,analyzeReadingQuestion,readingQueryFor,readingRetrievalFor,canAskClarification,evidenceSourceType,evidenceSourceAuthority} from '../server/reading-rag.mjs';

const cards=[
 {id:'m08',reversed:false,position:'建议'},
 {id:'c06',reversed:true,position:'关系挑战'},
];

test('goal evidence tiers use one shared immutable contract',()=>{
 assert.deepEqual(GOAL_REFERENCE_TIERS,{advice:'application',comparison:'application',forecast:'reference',explanation:'anchor'});
 assert.equal(Object.isFrozen(GOAL_REFERENCE_TIERS),true);
});

test('source authority keeps fixed card meaning above supplemental context',()=>{
 assert.equal(evidenceSourceAuthority('editorial'),'canonical_fixed');
 assert.equal(evidenceSourceAuthority('waite'),'historical_reference');
 assert.equal(evidenceSourceAuthority('corpora'),'contextual_reference');
 assert.equal(evidenceSourceAuthority('memory'),'user_context');
 assert.equal(evidenceSourceAuthority('unknown'),'unknown');
 const evidence=retrieveReadingEvidence({question:'我们之间的沟通要怎么调整？',cards:[cards[0]]});
 assert.equal(evidence.find(item=>item.kind==='orientation').sourceAuthority,'canonical_fixed');
 assert.equal(evidence.find(item=>item.kind==='waite').sourceAuthority,'historical_reference');
});

test('reading corpus contains complete fixed and reference material for all 78 cards',()=>{
 const status=validateReadingCorpus();
 assert.deepEqual(status,READING_CORPUS_STATUS);
 assert.equal(status.ok,true);
 assert.deepEqual({cards:status.cardCount,guides:status.guideCount,references:status.referenceCount},{cards:78,guides:78,references:78});
 assert.deepEqual(status.missingGuides,[]);
 assert.deepEqual(status.missingReferences,[]);
 assert.deepEqual(status.orphanGuides,[]);
 assert.deepEqual(status.orphanReferences,[]);
});

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

test('weak-only follow-ups inherit the original retrieval theme',()=>{
 const weak=analyzeReadingQuestion('他呢？');
 assert.equal(weak.weakOnly,true);
 assert.deepEqual(weak.strongMatchedTerms,[]);
 assert.deepEqual(weak.weakMatchedTerms,['他']);
 const result=readingRetrievalFor('我该如何规划这次转行？',[{role:'assistant',text:'上一轮回答'},{role:'user',text:'他呢？'}]);
 assert.equal(result.activeQuestion,'他呢？');
 assert.equal(result.inheritedOriginal,true);
 assert.equal(result.retrievalQuestion,'我该如何规划这次转行？');
 assert.deepEqual(result.retrievalMeta.themes,['career']);
});

test('follow-up routing separates inherited context from the current goal',()=>{
 const explicit=readingRetrievalFor('我该如何处理这段关系？',[{role:'assistant',text:'上一轮回答'},{role:'user',text:'会有结果吗？'}]);
 assert.equal(explicit.inheritedOriginal,true);
 assert.equal(explicit.retrievalQuestion,'我该如何处理这段关系？\n会有结果吗？');
 assert.deepEqual(explicit.retrievalMeta.themes,['relationship']);
 assert.deepEqual(explicit.retrievalMeta.goals,['forecast']);
 const contextOnly=readingRetrievalFor('我该如何处理这段关系？',[{role:'assistant',text:'上一轮回答'},{role:'user',text:'未来呢？'}]);
 assert.equal(contextOnly.inheritedOriginal,true);
 assert.deepEqual(contextOnly.retrievalMeta.themes,['relationship','future']);
 assert.deepEqual(contextOnly.retrievalMeta.goals,['advice']);
 const domainSwitch=readingRetrievalFor('我该如何处理这段关系？',[{role:'assistant',text:'上一轮回答'},{role:'user',text:'那事业呢？'}]);
 assert.equal(domainSwitch.inheritedOriginal,false);
 assert.deepEqual(domainSwitch.retrievalMeta.themes,['career']);
 assert.deepEqual(domainSwitch.retrievalMeta.goals,['advice']);
 const routedEvidence=retrieveReadingEvidence({question:domainSwitch.retrievalQuestion,cards:[cards[0]],routing:domainSwitch.retrievalMeta});
 assert.ok(routedEvidence.some(item=>item.kind==='work'&&item.retrievalGoals.includes('advice')));
 assert.deepEqual(summarizeReadingEvidence(routedEvidence,[cards[0]],domainSwitch.retrievalMeta).missingGoalCoverage,[]);
});

test('question routing recognizes common synonyms across reading intents',()=>{
 const career=analyzeReadingQuestion('我想跳槽，怎么准备面试？');
 assert.deepEqual(career.themes,['career']);
 assert.ok(career.matchedTerms.includes('跳槽'));
 const relationship=analyzeReadingQuestion('我们最近冷战，如何重新联系？');
 assert.deepEqual(relationship.themes,['relationship']);
 const reflection=analyzeReadingQuestion('我最近很焦虑，也感到疲惫，怎么调整？');
 assert.deepEqual(reflection.themes,['reflection']);
 const how=analyzeReadingQuestion('我怎样处理这段关系？');
 assert.deepEqual(how.goals,['advice']);
});

test('question routing covers colloquial outcome, scenario and decision phrasing',()=>{
 const relationship=analyzeReadingQuestion('我和她还有戏吗？');
 assert.deepEqual(relationship.themes,['relationship']);
 assert.deepEqual(relationship.goals,['forecast']);
 const career=analyzeReadingQuestion('这份 offer 值不值得接？');
 assert.deepEqual(career.themes,['career']);
 assert.deepEqual(career.goals,['comparison']);
 const sleep=analyzeReadingQuestion('我最近总是睡不好，该怎么办？');
 assert.deepEqual(sleep.themes,['reflection']);
 assert.deepEqual(sleep.goals,['advice']);
 assert.equal(requiresProfessionalBoundary('我最近总是睡不好，该怎么办？'),true);
 assert.deepEqual(analyzeReadingQuestion('这个官司最后能赢吗？').goals,['forecast']);
 assert.equal(requiresProfessionalBoundary('这个官司最后能赢吗？'),true);
 assert.deepEqual(analyzeReadingQuestion('这张牌放在阻碍位说明什么？').goals,['explanation']);
 assert.deepEqual(analyzeReadingQuestion('我该先联系他还是等他？').goals,['comparison']);
 assert.deepEqual(analyzeReadingQuestion('未来三个月工作会怎么走？').goals,['forecast']);
 assert.deepEqual(analyzeReadingQuestion('我想问一下下个月的财运').goals,['forecast']);
 assert.equal(requiresProfessionalBoundary('我想问一下下个月的财运'),true);
});

test('question routing covers thought, stance, continuation and admission phrasing',()=>{
 const thought=analyzeReadingQuestion('他的真实想法是什么？');
 assert.deepEqual(thought.themes,['relationship']);
 assert.deepEqual(thought.goals,['explanation']);
 assert.deepEqual(analyzeReadingQuestion('她对我到底是什么态度？').goals,['explanation']);
 assert.deepEqual(analyzeReadingQuestion('我到底应该不应该继续？').goals,['comparison']);
 const admission=analyzeReadingQuestion('我会不会被录取？');
 assert.deepEqual(admission.themes,['career']);
 assert.deepEqual(admission.goals,['forecast']);
});

test('question routing distinguishes the requested response goal',()=>{
 const advice=analyzeReadingQuestion('我该怎么和对方沟通？');
 assert.deepEqual(advice.goals,['advice']);
 assert.equal(advice.goalConfidence,'focused');
 const forecast=analyzeReadingQuestion('我们之后会不会复合？');
 assert.deepEqual(forecast.goals,['forecast']);
 const future=analyzeReadingQuestion('我之后会怎样发展？');
 assert.deepEqual(future.goals,['forecast']);
 const temporalContextOnly=analyzeReadingQuestion('我想看看未来。');
 assert.deepEqual(temporalContextOnly.goals,[]);
 assert.equal(temporalContextOnly.goalConfidence,'open');
 const futureAdvice=analyzeReadingQuestion('未来我该怎么办？');
 assert.deepEqual(futureAdvice.goals,['advice']);
 const futureAdviceCard={id:'m08',reversed:false,position:'建议'};
 const futureAdviceEvidence=retrieveReadingEvidence({question:'未来我该怎么办？',cards:[futureAdviceCard]});
 assert.ok(futureAdviceEvidence.some(item=>item.kind==='reflection'&&item.retrievalGoals.includes('advice')));
 const futureAdviceSummary=summarizeReadingEvidence(futureAdviceEvidence,[futureAdviceCard],{themes:futureAdvice.themes,goals:futureAdvice.goals});
 assert.deepEqual(futureAdviceSummary.missingGoalCoverage,[]);
 const comparison=analyzeReadingQuestion('两个机会哪个利弊更合适？');
 assert.deepEqual(comparison.goals,['comparison']);
});

test('clarification is reserved for open topics without explicit goals',()=>{
 const open=analyzeReadingQuestion('我最近想看看牌。');
 assert.equal(canAskClarification(open),true);
 const mixed=analyzeReadingQuestion('我之后会怎样发展？同时我该怎么安排下一步？');
 assert.equal(mixed.confidence,'focused');
 assert.equal(mixed.goalConfidence,'mixed');
 assert.equal(canAskClarification(mixed),false);
 assert.equal(canAskClarification(mixed,{hasPriorAssistant:true}),true);
});

test('question routing recognizes common possibility phrasing as forecast',()=>{
 const relationship=analyzeReadingQuestion('我们能不能复合？');
 assert.deepEqual(relationship.goals,['forecast']);
 const career=analyzeReadingQuestion('这次有没有机会被录取？');
 assert.deepEqual(career.goals,['forecast']);
 const evidence=retrieveReadingEvidence({question:'我们能不能复合？',cards:[cards[0]]});
 assert.ok(evidence.some(item=>item.tier==='reference'&&item.retrievalGoals.includes('forecast')));
});

test('question routing prefers longer explanation phrases over generic advice words',()=>{
 const explanation=analyzeReadingQuestion('我怎么看这段关系？');
 assert.deepEqual(explanation.goals,['explanation']);
 const understanding=analyzeReadingQuestion('我怎么理解这张牌？');
 assert.deepEqual(understanding.goals,['explanation']);
 const advice=analyzeReadingQuestion('我怎么处理这段关系？');
 assert.deepEqual(advice.goals,['advice']);
});

test('question routing recognizes explanation phrases about thoughts and card meaning',()=>{
 const otherThoughts=analyzeReadingQuestion('我想知道对方心里怎么想');
 assert.deepEqual(otherThoughts.goals,['explanation']);
 const cardMeaning=analyzeReadingQuestion('这张牌怎么解释？');
 assert.deepEqual(cardMeaning.goals,['explanation']);
 const unchangedAdvice=analyzeReadingQuestion('我下一步怎么做？');
 assert.deepEqual(unchangedAdvice.goals,['advice']);
});

test('question routing recognizes common should-I decision forms',()=>{
 const relationshipDecision=analyzeReadingQuestion('我是不是应该联系他？');
 assert.deepEqual(relationshipDecision.goals,['comparison']);
 const careerDecision=analyzeReadingQuestion('我是否应该换工作？');
 assert.deepEqual(careerDecision.goals,['comparison']);
 const continuationDecision=analyzeReadingQuestion('我是不是要继续这段关系？');
 assert.deepEqual(continuationDecision.goals,['comparison']);
});

test('question routing covers binary decision and prediction phrasing',()=>{
 const needDecision=analyzeReadingQuestion('我是否需要主动联系？');
 assert.deepEqual(needDecision.goals,['comparison']);
 const desireDecision=analyzeReadingQuestion('我想不想继续这段关系？');
 assert.deepEqual(desireDecision.goals,['comparison']);
 const otherState=analyzeReadingQuestion('对方是不是喜欢我？');
 assert.deepEqual(otherState.goals,['forecast']);
});

test('question routing covers natural forecast, explanation and advice phrasing',()=>{
 const contactForecast=analyzeReadingQuestion('他会主动联系我吗？');
 assert.deepEqual(contactForecast.goals,['forecast']);
 const careerForecast=analyzeReadingQuestion('未来三个月事业如何？');
 assert.deepEqual(careerForecast.goals,['forecast']);
 const meaning=analyzeReadingQuestion('这张牌是什么意思？');
 assert.deepEqual(meaning.goals,['explanation']);
 const explicitExplanation=analyzeReadingQuestion('请解释这段关系？');
 assert.deepEqual(explicitExplanation.goals,['explanation']);
 const nextStep=analyzeReadingQuestion('我应该先做什么？');
 assert.deepEqual(nextStep.goals,['advice']);
 const temporalForecast=analyzeReadingQuestion('未来如何？');
 assert.deepEqual(temporalForecast.themes,['future']);
 assert.deepEqual(temporalForecast.goals,['forecast']);
});

test('question routing ignores negated intent phrases without suppressing real goals',()=>{
 const explanation=analyzeReadingQuestion('我不想比较选项，只想知道为什么会这样？');
 assert.deepEqual(explanation.goals,['explanation']);
 const advice=analyzeReadingQuestion('我不是想问会不会复合，我想知道怎么处理？');
 assert.deepEqual(advice.goals,['advice']);
 const decision=analyzeReadingQuestion('我不知道要不要主动联系他。');
 assert.deepEqual(decision.goals,['comparison']);
});

test('question routing recognizes explicit path and option comparisons',()=>{
 const path=analyzeReadingQuestion('我该选哪条路径？');
 assert.deepEqual(path.goals,['comparison']);
 const option=analyzeReadingQuestion('哪种方案更适合我？');
 assert.deepEqual(option.goals,['comparison']);
});

test('question routing treats yes-or-no decisions as comparison goals',()=>{
 const contact=analyzeReadingQuestion('我要不要主动联系他？');
 assert.deepEqual(contact.goals,['comparison']);
 const career=analyzeReadingQuestion('我该不该换工作？');
 assert.deepEqual(career.goals,['comparison']);
 const evidence=retrieveReadingEvidence({question:'我要不要主动联系他？',cards:[cards[0]]});
 assert.ok(evidence.some(item=>item.kind==='relationships'&&item.retrievalGoals.includes('comparison')));
});

test('mixed theme retrieval excludes unrelated application domains',()=>{
 const relationshipChoice=retrieveReadingEvidence({question:'我不知道要不要主动联系他。',cards:[cards[0]]});
 assert.ok(relationshipChoice.some(item=>item.kind==='relationships'));
 assert.ok(!relationshipChoice.some(item=>item.kind==='work'));
 assert.ok(!relationshipChoice.some(item=>item.kind==='reflection'));
 const reflectiveForecast=retrieveReadingEvidence({question:'我现在很迷茫，未来会怎样？',cards:[cards[0]]});
 assert.ok(reflectiveForecast.some(item=>item.kind==='reflection'));
 assert.ok(!reflectiveForecast.some(item=>item.kind==='work'));
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
 const evidence=retrieveReadingEvidence({question:'我该怎么在这段关系里和对方平静说出感受？',cards:[cards[0]]});
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

test('retrieval uses spread position semantics for domain-neutral positions',()=>{
 const workEvidence=retrieveReadingEvidence({question:'我正在整理工作方向。',cards:[{id:'m08',reversed:false,position:'阻碍'}]});
 const work=workEvidence.find(item=>item.kind==='work');
 assert.ok(work);
 assert.ok(work.retrievalReasons.includes('position_match'));
 assert.ok(work.retrievalPositionKinds.includes('work'));
 const reflectionEvidence=retrieveReadingEvidence({question:'我最近想看看牌。',cards:[{id:'m08',reversed:false,position:'自我状态'}]});
 const reflection=reflectionEvidence.find(item=>item.kind==='reflection');
 assert.ok(reflection);
 assert.ok(reflection.retrievalReasons.includes('position_match'));
 assert.ok(reflection.retrievalPositionKinds.includes('reflection'));
});

test('future-only retrieval preserves application evidence selected by the spread position',()=>{
 const evidence=retrieveReadingEvidence({question:'未来会怎样？',cards:[{id:'m08',reversed:false,position:'建议'}]});
 const work=evidence.find(item=>item.kind==='work');
 assert.ok(work);
 assert.ok(work.retrievalReasons.includes('position_match'));
 assert.ok(work.retrievalPositionKinds.includes('work'));
});

test('focused career retrieval excludes unrelated relationship application chunks',()=>{
 const evidence=retrieveReadingEvidence({question:'我该如何规划这次转行和下一步行动？',cards:[cards[0]]});
 assert.ok(evidence.some(item=>item.kind==='work'));
 assert.ok(!evidence.some(item=>item.kind==='relationships'));
});

test('domain-neutral advice retrieval keeps only reflective application context',()=>{
 const question='我该怎么办？',evidence=retrieveReadingEvidence({question,cards:[cards[0]]});
 assert.ok(evidence.some(item=>item.kind==='reflection'));
 assert.ok(!evidence.some(item=>item.kind==='relationships'));
 assert.ok(!evidence.some(item=>item.kind==='work'));
});

test('open retrieval does not invent an application domain from a generic advice position',()=>{
 const evidence=retrieveReadingEvidence({question:'帮我看看',cards:[{id:'m08',reversed:false,position:'建议'}]});
 assert.equal(evidence.some(item=>item.tier==='application'),false);
});

test('high-stakes questions without a supported domain do not borrow application prose',()=>{
 const cards=[{id:'m08',reversed:false,position:'建议'}];
 const evidence=retrieveReadingEvidence({question:'这项投资要不要买？',cards});
 assert.equal(evidence.some(item=>item.tier==='application'),false);
 const summary=summarizeReadingEvidence(evidence,cards,analyzeReadingQuestion('这项投资要不要买？'));
 assert.equal(summary.coverageStatus,'anchor_only');
 assert.deepEqual(summary.missingApplicationKindsByCard,{m08:['reflection']});
});

test('mixed questions retain one application chunk for each explicit domain',()=>{
 const evidence=retrieveReadingEvidence({question:'我该如何处理这段关系，同时规划接下来的工作？',cards:[cards[0]],maxPerCard:5});
 assert.ok(evidence.some(item=>item.kind==='relationships'));
 assert.ok(evidence.some(item=>item.kind==='work'));
});

test('choice-only questions reserve reflective decision context',()=>{
 const question='方案 A 还是方案 B？';
 const evidence=retrieveReadingEvidence({question,cards:[cards[0]],maxPerCard:3});
 assert.ok(evidence.some(item=>item.kind==='reflection'));
 const anchors=evidence.filter(item=>item.tier==='anchor');
 const summary=summarizeReadingEvidence(anchors,[cards[0]],{themes:analyzeReadingQuestion(question).themes});
 assert.deepEqual(summary.expectedApplicationKinds,['reflection']);
 assert.deepEqual(summary.missingApplicationCardIds,['m08']);
 assert.equal(summary.coverageStatus,'anchor_only');
});

test('mixed-theme coverage reports every missing application domain',()=>{
 const question='我该如何处理这段关系，同时规划接下来的工作？';
 const card=cards[0],routing=analyzeReadingQuestion(question),evidence=retrieveReadingEvidence({question,cards:[card],maxPerCard:3});
 const summary=summarizeReadingEvidence(evidence,[card],{themes:routing.themes,goals:routing.goals});
 assert.deepEqual(summary.expectedApplicationKinds,['relationships','work']);
 assert.deepEqual(summary.missingApplicationKindsByCard,{m08:['work']});
 assert.deepEqual(summary.missingApplicationCardIds,['m08']);
 assert.equal(summary.coverageStatus,'anchor_only');
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

test('modern reference retrieval follows card orientation',()=>{
 const upright=retrieveReadingEvidence({question:'我想理解这张牌的意义。',cards:[{id:'m08',reversed:false,position:'现在'}],maxPerCard:7}).find(item=>item.kind==='modern');
 const reversed=retrieveReadingEvidence({question:'我想理解这张牌的意义。',cards:[{id:'m08',reversed:true,position:'现在'}],maxPerCard:7}).find(item=>item.kind==='modern');
 assert.match(upright.text,/Imposing restrictions/);
 assert.doesNotMatch(upright.text,/Indulging weakness/);
 assert.match(reversed.text,/Indulging weakness/);
 assert.doesNotMatch(reversed.text,/Imposing restrictions/);
});

test('question routing covers common outcome, meaning and suitability phrases',()=>{
 const reunion=analyzeReadingQuestion('我们会复合吗？');
 assert.deepEqual(reunion.goals,['forecast']);
 const returnQuestion=analyzeReadingQuestion('他还会回来吗？');
 assert.deepEqual(returnQuestion.goals,['forecast']);
 const timing=analyzeReadingQuestion('多久能复合？');
 assert.deepEqual(timing.goals,['forecast']);
 const meaning=analyzeReadingQuestion('这张牌说明了什么？');
 assert.deepEqual(meaning.goals,['explanation']);
 const relationshipChoice=analyzeReadingQuestion('这段关系值得继续吗？');
 assert.deepEqual(relationshipChoice.goals,['comparison']);
 const jobFit=analyzeReadingQuestion('这份工作适合我吗？');
 assert.deepEqual(jobFit.goals,['comparison']);
});

test('global evidence budget reserves position matches before generic references',()=>{
 const evidence=retrieveReadingEvidence({question:'我正在整理工作方向。',cards:[{id:'m08',reversed:false,position:'阻碍'}],maxPerCard:7,maxTotalEvidence:3,semanticScores:{'m08:modern':1},semanticWeight:20});
 assert.equal(evidence.length,3);
 assert.ok(evidence.some(item=>item.evidenceId==='m08:work'&&item.retrievalReasons.includes('position_match')));
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

test('default evidence budget reserves one required tier per routed goal',()=>{
 const spread=[
  {id:'m08',reversed:false,position:'建议'},
  {id:'c06',reversed:true,position:'关系挑战'},
  {id:'w01',reversed:false,position:'过去'},
 ];
 const question='我之后会怎样发展？同时两个机会哪个更适合我？';
 const evidence=retrieveReadingEvidence({question,cards:spread});
 assert.ok(evidence.some(item=>item.tier==='reference'&&item.retrievalGoals.includes('forecast')));
 assert.ok(evidence.some(item=>item.tier==='application'&&item.retrievalGoals.includes('comparison')));
 const tight=retrieveReadingEvidence({question,cards:spread,maxTotalEvidence:6});
 assert.equal(tight.length,6);
});

test('goal evidence reservation chooses the highest scored matching chunk',()=>{
 const evidence=[
  {evidenceId:'anchor',tier:'anchor',retrievalRequired:true,retrievalScore:10,retrievalMethod:'test'},
  {evidenceId:'low',tier:'reference',retrievalRequired:false,retrievalGoals:['forecast'],retrievalScore:1,retrievalMethod:'test'},
  {evidenceId:'high',tier:'reference',retrievalRequired:false,retrievalGoals:['forecast'],retrievalScore:9,retrievalMethod:'test'},
  {evidenceId:'filler',tier:'reference',retrievalRequired:false,retrievalGoals:[],retrievalScore:100,retrievalMethod:'test'},
 ];
 const selected=rerankReadingEvidence(evidence,{requiredGoalEvidence:['forecast'],maxTotalEvidence:2});
 assert.deepEqual(selected.map(item=>item.evidenceId),['anchor','high']);
});

test('per-card goal reservation keeps required-tier evidence across a tight spread',()=>{
 const evidence=[
  {evidenceId:'a:anchor',cardId:'a',tier:'anchor',retrievalRequired:true,retrievalScore:10,retrievalMethod:'test'},
  {evidenceId:'b:anchor',cardId:'b',tier:'anchor',retrievalRequired:true,retrievalScore:10,retrievalMethod:'test'},
  {evidenceId:'a:reference',cardId:'a',tier:'reference',retrievalRequired:false,retrievalGoals:['forecast'],retrievalScore:2,retrievalMethod:'test'},
  {evidenceId:'b:reference',cardId:'b',tier:'reference',retrievalRequired:false,retrievalGoals:['forecast'],retrievalScore:1,retrievalMethod:'test'},
  {evidenceId:'filler',cardId:'a',tier:'reference',retrievalRequired:false,retrievalGoals:[],retrievalScore:100,retrievalMethod:'test'},
 ];
 const selected=rerankReadingEvidence(evidence,{requiredGoalEvidence:['forecast'],maxTotalEvidence:4,reserveGoalEvidencePerCard:true});
 assert.deepEqual(selected.map(item=>item.evidenceId),['a:anchor','b:anchor','a:reference','b:reference']);
});

test('position evidence stays ahead of per-card goal evidence when the budget is exhausted',()=>{
 const evidence=[
  {evidenceId:'a:anchor',cardId:'a',tier:'anchor',retrievalRequired:true,retrievalScore:10,retrievalMethod:'test'},
  {evidenceId:'b:anchor',cardId:'b',tier:'anchor',retrievalRequired:true,retrievalScore:10,retrievalMethod:'test'},
  {evidenceId:'a:position',cardId:'a',tier:'application',retrievalRequired:false,retrievalReasons:['position_match'],retrievalScore:1,retrievalMethod:'test'},
  {evidenceId:'b:position',cardId:'b',tier:'application',retrievalRequired:false,retrievalReasons:['position_match'],retrievalScore:1,retrievalMethod:'test'},
  {evidenceId:'a:reference',cardId:'a',tier:'reference',retrievalRequired:false,retrievalGoals:['forecast'],retrievalScore:9,retrievalMethod:'test'},
  {evidenceId:'b:reference',cardId:'b',tier:'reference',retrievalRequired:false,retrievalGoals:['forecast'],retrievalScore:8,retrievalMethod:'test'},
 ];
 const selected=rerankReadingEvidence(evidence,{requiredGoalEvidence:['forecast'],maxTotalEvidence:4,reserveGoalEvidencePerCard:true});
 assert.deepEqual(selected.map(item=>item.evidenceId),['a:anchor','b:anchor','a:position','b:position']);
});

test('mixed goal reservation rotates across cards before stacking goal layers',()=>{
 const evidence=[
  {evidenceId:'a:anchor',cardId:'a',tier:'anchor',retrievalRequired:true,retrievalScore:10,retrievalMethod:'test'},
  {evidenceId:'b:anchor',cardId:'b',tier:'anchor',retrievalRequired:true,retrievalScore:10,retrievalMethod:'test'},
  {evidenceId:'a:advice',cardId:'a',tier:'application',retrievalRequired:false,retrievalGoals:['advice'],retrievalScore:4,retrievalMethod:'test'},
  {evidenceId:'b:advice',cardId:'b',tier:'application',retrievalRequired:false,retrievalGoals:['advice'],retrievalScore:3,retrievalMethod:'test'},
  {evidenceId:'a:forecast',cardId:'a',tier:'reference',retrievalRequired:false,retrievalGoals:['forecast'],retrievalScore:9,retrievalMethod:'test'},
  {evidenceId:'b:forecast',cardId:'b',tier:'reference',retrievalRequired:false,retrievalGoals:['forecast'],retrievalScore:8,retrievalMethod:'test'},
 ];
 const selected=rerankReadingEvidence(evidence,{requiredGoalEvidence:['advice','forecast'],maxTotalEvidence:4,reserveGoalEvidencePerCard:true});
 assert.deepEqual(selected.map(item=>item.evidenceId),['a:anchor','b:anchor','a:advice','b:forecast']);
});

test('default evidence budget expands for large mixed spreads',()=>{
 const cardsForSpread=Array.from({length:12},(_,index)=>({id:`m${String(index).padStart(2,'0')}`,reversed:index%2===1,position:`位置 ${index+1}`}));
 const question='我该如何处理这段关系，同时规划接下来的工作，也想调整自己的状态？';
 const evidence=retrieveReadingEvidence({question,cards:cardsForSpread});
 const summary=summarizeReadingEvidence(evidence,cardsForSpread,{themes:analyzeReadingQuestion(question).themes,goals:analyzeReadingQuestion(question).goals});
 assert.equal(evidence.length,60);
 assert.deepEqual(summary.missingApplicationCardIds,[]);
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
 const summary=summarizeReadingEvidence(evidence,cards,{themes:['relationship'],goals:['advice']});
 assert.equal(summary.total,evidence.length);
 assert.equal(summary.requiredCount,4);
 assert.deepEqual(summary.missingAnchorCardIds,[]);
 assert.equal(summary.perCard.m08.hasSymbolism,true);
 assert.equal(summary.perCard.m08.hasOrientation,true);
 assert.ok(summary.tiers.anchor>=4);
 assert.equal(summary.semanticCount,0);
 assert.deepEqual(summary.missingGoalCoverage,[]);
 assert.equal(summary.goalCoverage.advice.ok,true);
});

test('evidence summary exposes missing goal support',()=>{
 const question='我之后会怎样发展？';
 const cardsForGoal=[{id:'m08',reversed:false,position:'建议'}];
 const evidence=retrieveReadingEvidence({question,cards:cardsForGoal});
 const full=summarizeReadingEvidence(evidence,cardsForGoal,{themes:analyzeReadingQuestion(question).themes,goals:['forecast']});
 assert.deepEqual(full.missingGoalCoverage,[]);
 const anchors=summarizeReadingEvidence(evidence.filter(item=>item.tier==='anchor'),cardsForGoal,{themes:['future'],goals:['forecast']});
 assert.deepEqual(anchors.missingGoalCoverage,['forecast']);
 assert.equal(anchors.goalCoverage.forecast.referenceCount,0);
});

test('evidence summary identifies goal gaps on individual cards',()=>{
 const cardsForGoal=[
  {id:'m08',reversed:false,position:'建议'},
  {id:'c06',reversed:true,position:'关系挑战'},
  {id:'w01',reversed:false,position:'过去'},
 ];
 const question='我之后会怎样发展？';
 const routing=analyzeReadingQuestion(question);
 const evidence=retrieveReadingEvidence({question,cards:cardsForGoal,maxTotalEvidence:8});
 const summary=summarizeReadingEvidence(evidence,cardsForGoal,routing);
 assert.equal(summary.goalCoverage.forecast.ok,true);
 assert.ok(Object.values(summary.missingGoalCoverageByCard).some(goals=>goals.includes('forecast')));
 assert.deepEqual(summary.coverageBoundaryGoals,['forecast']);
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
 assert.equal(evidence[0].sourceType,'personal_memory');
 assert.equal(evidence[0].memoryStatus,'user_confirmed');
 assert.equal(evidence[0].memoryUse,'context_only');
 assert.deepEqual(evidence[0].retrievalReasons,['memory_keyword_match']);
 assert.ok(evidence[0].retrievalTerms.length>0);
 assert.equal(evidence[0].retrievalMethod,'memory-keyword-v2');
});

test('memory retrieval returns no unrelated personal records',()=>{
 const evidence=retrieveMemoryEvidence({question:'我该如何准备考试？',memories:[{id:'m1',text:'我喜欢在周末散步。',enabled:true},{id:'m2',text:'家里的猫叫月光。',enabled:true}]});
 assert.deepEqual(evidence,[]);
});

test('memory retrieval rejects a single generic short overlap',()=>{
 const evidence=retrieveMemoryEvidence({question:'我该怎么安排？',memories:[
  {id:'generic',text:'我会先安排周末散步。',enabled:true},
  {id:'specific',text:'我在重要决定前会先独处整理思绪。',enabled:true},
 ]});
 assert.deepEqual(evidence.map(item=>item.evidenceId),[]);
});

test('structured output accepts only references from the retrieved evidence set',()=>{
 const evidence=retrieveReadingEvidence({question:'我每天学习两小时，如何保持？',cards:[cards[0]]});
 const valid=JSON.stringify({text:'把稳定节奏拆成可执行的小步。',references:[{evidenceId:evidence[0].evidenceId,cardId:'m08',position:'建议',claim:'稳定节奏'}],followUp:'你最容易在哪个时段中断？',uncertainty:'牌义是反思线索，不是事实证明。'});
 const parsed=parseReadingOutput(valid,{cards,evidence});
 assert.equal(parsed.text,'把稳定节奏拆成可执行的小步。');
 assert.equal(parsed.references[0].evidenceId,evidence[0].evidenceId);
 assert.equal(parsed.references[0].tier,evidence[0].tier);
 assert.equal(parsed.references[0].sourceLabel,evidence[0].sourceLabel);
 assert.equal(parsed.references[0].evidenceExcerpt,evidence[0].text);
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
 assert.equal(parsed.references[0].sourceType,'personal_memory');
 assert.equal(parsed.references[0].evidenceExcerpt,memory[0].text);
 assert.throws(()=>parseReadingOutput(JSON.stringify({text:'x',references:[{evidenceId:'memory:m1',cardId:'m08',position:'建议',claim:'先独处'}]}),{cards:[cards[0]],evidence:memory}),/引用证据无效/);
});

test('personal memory cannot ground the top-level reading text',()=>{
 const memory=retrieveMemoryEvidence({question:'做重要决定前我该如何安排自己？',memories:[{id:'m1',text:'做重要决定前，我需要先独处整理思绪。',enabled:true}]});
 const output=JSON.stringify({text:'先独处整理思绪。',references:[{evidenceId:'memory:m1',cardId:null,position:null,claim:'先独处整理思绪'}]});
 assert.throws(()=>parseReadingOutput(output,{cards:[cards[0]],evidence:memory,requireTextSupport:true}),/解读正文与证据不匹配/);
});

test('plain-text follow-ups cannot use personal memory as sole body support',()=>{
 const memory=retrieveMemoryEvidence({question:'做重要决定前我该如何安排自己？',memories:[{id:'m1',text:'做重要决定前，我需要先独处整理思绪。',enabled:true}]});
 assert.throws(()=>parseReadingOutput('先独处整理思绪。',{cards:[cards[0]],evidence:memory,requireTextSupport:true,isFollowUp:true}),/追问正文与证据不匹配/);
});

test('structured references retain fixed source provenance',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards:[cards[0]]});
 const waite=evidence.find(item=>item.kind==='waite');
 const output=JSON.stringify({text:'以原典作为对照。',references:[{evidenceId:waite.evidenceId,cardId:'m08',position:'建议',claim:'Fortitude'}]});
 const parsed=parseReadingOutput(output,{cards:[cards[0]],evidence});
 assert.equal(parsed.references[0].url,waite.url);
 assert.equal(parsed.references[0].source,'waite');
 assert.equal(parsed.references[0].sourceType,'external_reference');
 assert.equal(parsed.references[0].sourceAuthority,'historical_reference');
 assert.equal(parsed.references[0].evidenceExcerpt,waite.text);
});

test('evidence source types stay stable across fixed, external, and unknown sources',()=>{
 assert.equal(evidenceSourceType('editorial'),'fixed_card_meaning');
 assert.equal(evidenceSourceType('corpora'),'external_reference');
 assert.equal(evidenceSourceType('future-source'),'other');
 assert.equal(evidenceSourceAuthority('editorial'),'canonical_fixed');
 assert.equal(evidenceSourceAuthority('memory'),'user_context');
});

test('first-reading output must cover every selected card with grounded evidence',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards});
 const refs=cards.map(card=>{const item=evidence.find(e=>e.cardId===card.id&&e.kind==='orientation');return {evidenceId:item.evidenceId,cardId:card.id,position:card.position,claim:item.text.slice(0,4)};});
 const valid=JSON.stringify({text:'逐张说明并综合关系。',references:refs,cardReadings:cards.map(card=>({cardId:card.id,position:card.position,reading:'结合牌位说明一个可观察的角度。',evidenceIds:[refs.find(ref=>ref.cardId===card.id).evidenceId]}))});
 assert.equal(parseReadingOutput(valid,{cards,evidence,requireCoverage:true}).cardReadings.length,2);
 const missing=JSON.stringify({text:'只解释一张牌。',references:[refs[0]],cardReadings:[{cardId:cards[0].id,position:cards[0].position,reading:'只解释第一张。',evidenceIds:[refs[0].evidenceId]}]});
 assert.throws(()=>parseReadingOutput(missing,{cards,evidence,requireCoverage:true}),/没有覆盖全部牌面/);
});

test('card readings carry the locked card orientation for the UI',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards:[cards[1]]});
 const output=JSON.stringify({text:'逐牌说明。',cardReadings:[{cardId:'c06',position:'关系挑战',reading:'观察一个可验证的角度。',evidenceIds:[evidence.find(item=>item.kind==='orientation').evidenceId]}]});
 const parsed=parseReadingOutput(output,{cards:[cards[1]],evidence});
 assert.equal(parsed.cardReadings[0].orientation,'逆位');
});

test('card readings reject text with no meaningful overlap with cited evidence',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards:[cards[0]]});
 const output=JSON.stringify({text:'逐牌说明。',cardReadings:[{cardId:'m08',position:'建议',reading:'这张牌保证对方一定会回来。',evidenceIds:[evidence.find(item=>item.kind==='orientation').evidenceId]}]});
 assert.throws(()=>parseReadingOutput(output,{cards:[cards[0]],evidence,requireCardReadingSupport:true}),/逐牌解读内容与证据不匹配/);
});

test('first actions reject vague text without an observable completion marker',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards:[cards[0]]});
 const output=JSON.stringify({text:'行动建议。',actions:[{text:'做点什么。',evidenceIds:[evidence.find(item=>item.kind==='orientation').evidenceId]}]});
 assert.throws(()=>parseReadingOutput(output,{cards:[cards[0]],evidence,requireActions:true,requireConcreteActions:true}),/行动建议必须包含可观察的完成标准/);
});

test('first actions require a reason that explains their connection to the reading',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards:[cards[0]]});
 const output=JSON.stringify({text:'先观察再沟通。',actions:[{text:'今天记录一次具体沟通。',evidenceIds:[evidence.find(item=>item.kind==='orientation').evidenceId]}]});
 assert.throws(()=>parseReadingOutput(output,{cards:[cards[0]],evidence,requireActions:true,requireActionReasons:true}),/行动建议必须说明与牌面相关的理由/);
});

test('first action reasons must overlap the cited evidence',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards:[cards[0]]});
 const output=JSON.stringify({text:'先观察再沟通。',actions:[{text:'今天记录一次具体沟通。',reason:'这会保证对方一定会回来。',evidenceIds:[evidence.find(item=>item.kind==='orientation').evidenceId]}]});
 assert.throws(()=>parseReadingOutput(output,{cards:[cards[0]],evidence,requireActions:true,requireActionReasons:true,requireActionReasonSupport:true}),/行动理由与牌面证据不匹配/);
});

test('first action text must overlap the cited evidence',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards:[cards[0]]});
 const output=JSON.stringify({text:'先观察再沟通。',actions:[{text:'今天购买一台相机并在一周后复盘。',reason:'依据牌面稳定、明确的行动线索。',evidenceIds:[evidence.find(item=>item.kind==='orientation').evidenceId]}]});
 assert.throws(()=>parseReadingOutput(output,{cards:[cards[0]],evidence,requireActions:true,requireConcreteActions:true,requireActionReasons:true,requireActionReasonSupport:true,requireActionTextSupport:true}),/行动建议内容与证据不匹配/);
});

test('first action text cannot pass on generic action words alone',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards:[cards[0]]});
 const output=JSON.stringify({text:'先观察再沟通。',actions:[{text:'今天做一个行动并观察结果。',reason:'依据牌面稳定、明确的行动线索。',evidenceIds:[evidence.find(item=>item.kind==='orientation').evidenceId]}]});
 assert.throws(()=>parseReadingOutput(output,{cards:[cards[0]],evidence,requireActions:true,requireConcreteActions:true,requireActionReasons:true,requireActionReasonSupport:true,requireActionTextSupport:true}),/行动建议内容与证据不匹配/);
});

test('first action reasons cannot pass on generic words alone',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards:[cards[0]]});
 const output=JSON.stringify({text:'先观察再沟通。',actions:[{text:'今天记录一次稳定节奏的具体行动。',reason:'这是一条行动建议，并观察结果。',evidenceIds:[evidence.find(item=>item.kind==='orientation').evidenceId]}]});
 assert.throws(()=>parseReadingOutput(output,{cards:[cards[0]],evidence,requireActions:true,requireConcreteActions:true,requireActionReasons:true,requireActionReasonSupport:true,requireActionTextSupport:true}),/行动理由与牌面证据不匹配/);
});

test('structured reading prose cannot pass on generic evidence words alone',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards:[cards[0]]});
 const cardOutput=JSON.stringify({text:'先观察再沟通。',cardReadings:[{cardId:'m08',position:'建议',reading:'观察一个方向并说明结果。',evidenceIds:[evidence.find(item=>item.kind==='orientation').evidenceId]}]});
 assert.throws(()=>parseReadingOutput(cardOutput,{cards:[cards[0]],evidence,requireCardReadingSupport:true}),/逐牌解读内容与证据不匹配/);
 const synthesisOutput=JSON.stringify({text:'先观察再沟通。',synthesis:{text:'说明方向并观察结果。',evidenceIds:[evidence.find(item=>item.kind==='orientation').evidenceId]}});
 assert.throws(()=>parseReadingOutput(synthesisOutput,{cards:[cards[0]],evidence,requireSynthesisSupport:true}),/综合解读内容与证据不匹配/);
});

test('structured prose rejects an unsupported trailing sentence',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards:[cards[0]]});
 const orientation=evidence.find(item=>item.kind==='orientation');
 const cardOutput=JSON.stringify({text:'先观察再沟通。',cardReadings:[{cardId:'m08',position:'建议',reading:'先以稳定节奏观察。对方已经搬去火星。',evidenceIds:[orientation.evidenceId]}]});
 assert.throws(()=>parseReadingOutput(cardOutput,{cards:[cards[0]],evidence,requireCardReadingSupport:true}),/逐牌解读内容与证据不匹配/);
 const actionOutput=JSON.stringify({text:'先观察再沟通。',actions:[{text:'今天记录一次稳定节奏的行动。对方已经搬去火星。',reason:'依据牌面稳定、明确的行动线索。',evidenceIds:[orientation.evidenceId]}]});
 assert.throws(()=>parseReadingOutput(actionOutput,{cards:[cards[0]],evidence,requireActions:true,requireActionReasons:true,requireActionReasonSupport:true,requireActionTextSupport:true}),/行动建议内容与证据不匹配/);
});

test('synthesis rejects prose with no meaningful overlap with cited evidence',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards:[cards[0]]});
 const output=JSON.stringify({text:'综合判断。',synthesis:{text:'这意味着对方一定会回来。',evidenceIds:[evidence.find(item=>item.kind==='orientation').evidenceId]}});
 assert.throws(()=>parseReadingOutput(output,{cards:[cards[0]],evidence,requireSynthesisSupport:true}),/综合解读内容与证据不匹配/);
});

test('reference claims reject an unsupported trailing sentence',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards:[cards[0]]});
 const output=JSON.stringify({text:'先观察再沟通。',references:[{evidenceId:'m08:orientation',cardId:'m08',position:'建议',claim:'稳定、温柔。对方已经搬去火星。'}]});
 assert.throws(()=>parseReadingOutput(output,{cards:[cards[0]],evidence,requireReferenceClaims:true,requireReferenceSupport:true}),/引用说明与证据不匹配/);
});

test('first reading text must overlap the retrieved evidence',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards:[cards[0]]});
 const output=JSON.stringify({text:'对方已经中奖并马上搬去火星。',references:[{evidenceId:'m08:orientation',cardId:'m08',position:'建议',claim:'稳定'}]});
 assert.throws(()=>parseReadingOutput(output,{cards:[cards[0]],evidence,requireTextSupport:true}),/解读正文与证据不匹配/);
});

test('first reading text rejects an unsupported trailing sentence',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards:[cards[0]]});
 const output=JSON.stringify({text:'把练习拆成稳定的小步。对方已经搬去火星。',references:[{evidenceId:'m08:orientation',cardId:'m08',position:'建议',claim:'稳定'}]});
 assert.throws(()=>parseReadingOutput(output,{cards:[cards[0]],evidence,requireTextSupport:true}),/解读正文与证据不匹配/);
});

test('first reading text cannot borrow support from non-reference fields',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards:[cards[0]]});
 const orientation=evidence.find(item=>item.kind==='orientation');
 const relationships=evidence.find(item=>item.kind==='relationships');
 const output=JSON.stringify({text:'平静说出感受和底线。',references:[{evidenceId:orientation.evidenceId,cardId:'m08',position:'建议',claim:'稳定、温柔'}],actions:[{text:'记录一次沟通。',reason:'依据关系中的边界。',evidenceIds:[relationships.evidenceId]}]});
 assert.throws(()=>parseReadingOutput(output,{cards:[cards[0]],evidence,requireTextSupport:true}),/解读正文与证据不匹配/);
 const synthesisOutput=JSON.stringify({text:'平静说出感受和底线。',references:[{evidenceId:orientation.evidenceId,cardId:'m08',position:'建议',claim:'稳定、温柔'}],synthesis:{text:'把关系中的边界纳入观察。',evidenceIds:[relationships.evidenceId]}});
 assert.throws(()=>parseReadingOutput(synthesisOutput,{cards:[cards[0]],evidence,requireTextSupport:true}),/解读正文与证据不匹配/);
});

test('first reading text cannot pass on generic evidence words alone',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards:[cards[0]]});
 const output=JSON.stringify({text:'说明方向并观察结果。',references:[{evidenceId:'m08:orientation',cardId:'m08',position:'建议',claim:'稳定'}]});
 assert.throws(()=>parseReadingOutput(output,{cards:[cards[0]],evidence,requireTextSupport:true}),/解读正文与证据不匹配/);
});

test('first-reading card explanations require available position evidence',()=>{
 const card={id:'m08',reversed:false,position:'阻碍'};
 const evidence=retrieveReadingEvidence({question:'我正在整理工作方向。',cards:[card]});
 const anchor=evidence.find(item=>item.kind==='orientation');
 const position=evidence.find(item=>item.retrievalReasons?.includes('position_match'));
 assert.ok(anchor&&position);
 const missing=JSON.stringify({text:'逐牌说明。',cardReadings:[{cardId:'m08',position:'阻碍',reading:'结合稳定节奏观察一个可验证角度。',evidenceIds:[anchor.evidenceId]}]});
 assert.throws(()=>parseReadingOutput(missing,{cards:[card],evidence,requireCoverage:true,requirePositionEvidence:true}),/牌位语义证据/);
 const grounded=JSON.stringify({text:'逐牌说明。',cardReadings:[{cardId:'m08',position:'阻碍',reading:'结合稳定节奏观察工作行动的阻碍。',evidenceIds:[anchor.evidenceId,position.evidenceId]}]});
 assert.equal(parseReadingOutput(grounded,{cards:[card],evidence,requireCoverage:true,requirePositionEvidence:true}).cardReadings[0].evidenceIds.includes(position.evidenceId),true);
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
 const generic=JSON.stringify({text:'先观察再沟通。',references:[{evidenceId:orientation.evidenceId,cardId:'m08',position:'建议',claim:'行动建议'}]});
 assert.throws(()=>parseReadingOutput(generic,{cards:[cards[0]],evidence,requireReferenceSupport:true}),/引用说明与证据不匹配/);
});

test('grounding does not accept broad relationship words as unsupported facts',()=>{
 const card={id:'m08',reversed:false,position:'建议'};
 const evidence=retrieveReadingEvidence({question:'我该怎么处理这段关系？',cards:[card]});
 assert.throws(()=>parseReadingOutput('关系会在三天后复合。',{cards:[card],evidence,isFollowUp:true,requireTextSupport:true}),/追问正文与证据不匹配/);
 assert.throws(()=>parseReadingOutput('对方会持续伤害我。',{cards:[card],evidence,isFollowUp:true,requireTextSupport:true}),/追问正文与证据不匹配/);
 assert.doesNotThrow(()=>parseReadingOutput('理解对方不意味着容忍持续伤害。',{cards:[card],evidence,isFollowUp:true,requireTextSupport:true}));
});

test('question routing covers relationship states, core meaning and fit questions',()=>{
 const love=analyzeReadingQuestion('他还爱不爱我？');
 assert.deepEqual(love.goals,['forecast']);
 const feeling=analyzeReadingQuestion('他对我有没有感觉？');
 assert.deepEqual(feeling.goals,['forecast']);
 const core=analyzeReadingQuestion('这段关系的核心问题是什么？');
 assert.deepEqual(core.goals,['explanation']);
 const fit=analyzeReadingQuestion('我适不适合换工作？');
 assert.deepEqual(fit.goals,['comparison']);
 const change=analyzeReadingQuestion('未来有什么变化？');
 assert.deepEqual(change.goals,['forecast']);
});

test('question routing covers colloquial state and path questions',()=>{
 const love=analyzeReadingQuestion('他爱我吗？');
 assert.deepEqual(love.goals,['forecast']);
 const interest=analyzeReadingQuestion('他对我有好感吗？');
 assert.deepEqual(interest.goals,['forecast']);
 const feeling=analyzeReadingQuestion('他对我是什么感觉？');
 assert.deepEqual(feeling.goals,['forecast']);
 const path=analyzeReadingQuestion('留在这里还是离开？');
 assert.deepEqual(path.goals,['comparison']);
 const growth=analyzeReadingQuestion('这段关系会怎么发展？');
 assert.deepEqual(growth.goals,['forecast']);
 const card=analyzeReadingQuestion('我只是想了解这张牌');
 assert.deepEqual(card.goals,['explanation']);
});

test('question routing covers productive colloquial intent forms',()=>{
 const thought=analyzeReadingQuestion('他在想什么？');
 assert.deepEqual(thought.goals,['explanation']);
 const missing=analyzeReadingQuestion('他有没有想我？');
 assert.deepEqual(missing.goals,['forecast']);
 const option=analyzeReadingQuestion('选择哪一个更好？');
 assert.deepEqual(option.goals,['comparison']);
 const career=analyzeReadingQuestion('换不换工作？');
 assert.deepEqual(career.goals,['comparison']);
 const message=analyzeReadingQuestion('这张牌想告诉我什么？');
 assert.deepEqual(message.goals,['explanation']);
 const caution=analyzeReadingQuestion('我需要注意什么？');
 assert.deepEqual(caution.goals,['advice']);
 const how=analyzeReadingQuestion('我怎么做比较好？');
 assert.deepEqual(how.goals,['advice']);
 const job=analyzeReadingQuestion('我今年能找到工作吗？');
 assert.deepEqual(job.goals,['forecast']);
 const returner=analyzeReadingQuestion('他会回来找我吗？');
 assert.deepEqual(returner.goals,['forecast']);
});

test('question routing keeps separate clauses in mixed goals',()=>{
 const mixed=analyzeReadingQuestion('这段关系会怎么发展，我该怎么做？');
 assert.deepEqual(mixed.goals,['advice','forecast']);
 const advice=analyzeReadingQuestion('我怎么做比较好？');
 assert.deepEqual(advice.goals,['advice']);
});

test('first reading synthesis must cite every selected card',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards});
 const refs=cards.map(card=>{const item=evidence.find(e=>e.cardId===card.id&&e.kind==='orientation');return {evidenceId:item.evidenceId,cardId:card.id,position:card.position,claim:item.text.slice(0,4)};});
 const base={text:'逐张说明并综合关系。',cardReadings:cards.map(card=>({cardId:card.id,position:card.position,reading:'结合牌位说明一个可观察的角度。',evidenceIds:[refs.find(ref=>ref.cardId===card.id).evidenceId]})),actions:[{text:'先记录一次具体沟通，再复盘结果。',evidenceIds:[refs[0].evidenceId]}],references:refs};
 const valid=parseReadingOutput(JSON.stringify({...base,synthesis:{text:'第一张牌提示用稳定、温柔的方式行动；第二张牌提醒比较过去与当前事实。',evidenceIds:refs.map(ref=>ref.evidenceId)}}),{cards,evidence,requireCoverage:true,requireActions:true,requireReferences:true,requireReferenceClaims:true,requireSynthesis:true,requireSynthesisCardSupport:true});
 assert.equal(valid.synthesis.evidenceIds.length,2);
 assert.throws(()=>parseReadingOutput(JSON.stringify({...base,synthesis:{text:'只谈第一张牌。',evidenceIds:[refs[0].evidenceId]}}),{cards,evidence,requireCoverage:true,requireActions:true,requireReferences:true,requireReferenceClaims:true,requireSynthesis:true}),/综合解读没有覆盖全部牌面/);
});

test('first synthesis prose must support every cited card',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards});
 const refs=cards.map(card=>{const item=evidence.find(e=>e.cardId===card.id&&e.kind==='orientation');return {evidenceId:item.evidenceId,cardId:card.id,position:card.position,claim:item.text.slice(0,4)};});
 const output=JSON.stringify({text:'逐张说明并综合关系。',synthesis:{text:'只复述第一张牌的稳定与温柔。',evidenceIds:refs.map(ref=>ref.evidenceId)},references:refs});
 assert.throws(()=>parseReadingOutput(output,{cards,evidence,requireSynthesis:true,requireSynthesisSupport:true,requireSynthesisCardSupport:true}),/综合解读内容与证据不匹配/);
});

test('first synthesis must cite a core anchor for every selected card',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards});
 const references=cards.map(card=>evidence.find(item=>item.cardId===card.id&&item.kind==='orientation').evidenceId);
 const referenceOnly=cards.map(card=>evidence.find(item=>item.cardId===card.id&&item.kind==='waite').evidenceId);
 const output=JSON.stringify({text:'逐张说明并综合关系。',synthesis:{text:'原典与当前问题形成一个观察线索。',evidenceIds:referenceOnly},cardReadings:cards.map(card=>({cardId:card.id,position:card.position,reading:'结合牌位说明一个可观察的角度。',evidenceIds:[references.find(id=>id.startsWith(`${card.id}:`))]})),actions:[{text:'先记录一次具体沟通，再复盘结果。',evidenceIds:[references[0]]}],references:cards.map(card=>{const id=references.find(value=>value.startsWith(`${card.id}:`));return {evidenceId:id,cardId:card.id,position:card.position,claim:'稳定节奏'};}),uncertainty:'牌面不能确认结果。'});
 assert.throws(()=>parseReadingOutput(output,{cards,evidence,requireCoverage:true,requireActions:true,requireReferences:true,requireReferenceClaims:true,requireSynthesis:true,requireSynthesisAnchors:true}),/综合解读必须引用每张牌的核心锚点/);
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

test('clarification must contain a concrete question cue',()=>{
 const evidence=retrieveReadingEvidence({question:'我最近想看看牌。',cards:[cards[0]]});
 const vague=JSON.stringify({text:'请补充方向。',needsClarification:true,clarification:'请补充。'});
 assert.throws(()=>parseReadingOutput(vague,{cards:[cards[0]],evidence,requireCoverage:true}),/澄清问题格式不正确/);
});

test('clarification cannot carry a partial structured reading',()=>{
 const evidence=retrieveReadingEvidence({question:'我最近想看看牌。',cards:[cards[0]]});
 const output=JSON.stringify({text:'我先确认方向。',needsClarification:true,clarification:'这次更想看关系还是事业？',cardReadings:[{cardId:'m08',position:'建议',reading:'先观察一个角度。',evidenceIds:[evidence.find(item=>item.kind==='orientation').evidenceId]}]});
 assert.throws(()=>parseReadingOutput(output,{cards:[cards[0]],evidence}),/澄清时不能同时返回结构化解读/);
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

test('professional boundary recognizes common financial, legal and clinical phrasings',()=>{
 assert.equal(requiresProfessionalBoundary('这套房贷现在该不该申请？'),true);
 assert.equal(requiresProfessionalBoundary('这份检查报告代表什么？'),true);
 assert.equal(requiresProfessionalBoundary('离婚协议要怎么处理？'),true);
 assert.equal(requiresProfessionalBoundary('我想看看这段关系怎么沟通。'),false);
});

test('mind-reading questions require an uncertainty boundary about observable reality',()=>{
 const card={id:'m08',reversed:false,position:'建议'};
 const evidence=retrieveReadingEvidence({question:'他的真实想法是什么？',cards:[card]});
 assert.equal(requiresPerspectiveBoundary('他的真实想法是什么？'),true);
 assert.equal(requiresPerspectiveBoundary('我该如何处理这段关系？'),false);
 const vague=JSON.stringify({text:'牌面提示他内心仍然在意。',uncertainty:'牌面只能提供趋势线索。'});
 assert.throws(()=>parseReadingOutput(vague,{cards:[card],evidence,requirePerspectiveBoundary:true}),/他人内心/);
 const grounded=JSON.stringify({text:'牌面只能作为理解互动的线索。',uncertainty:'牌面不能确认对方的真实想法，需要通过沟通和现实互动核验。'});
 assert.equal(parseReadingOutput(grounded,{cards:[card],evidence,requirePerspectiveBoundary:true}).uncertainty,'牌面不能确认对方的真实想法，需要通过沟通和现实互动核验。');
});

test('high-stakes boundary accumulates user history but ignores assistant prose',()=>{
 assert.equal(requiresProfessionalBoundary('我想继续聊关系。',[{role:'user',text:'这项投资要不要买？'}]),true);
 assert.equal(requiresProfessionalBoundary('我想继续聊关系。',[{role:'assistant',text:'这项投资要不要买？'}]),false);
});

test('high-stakes boundary rejects a domain-only disclaimer',()=>{
 const output=JSON.stringify({text:'请谨慎。',uncertainty:'投资需要谨慎。'});
 assert.throws(()=>parseReadingOutput(output,{cards:[cards[0]],evidence:[],requireRealityBoundary:true}),/高风险问题需要现实依据说明/);
});

test('high-stakes uncertainty must name a reality check rather than a vague disclaimer',()=>{
 const evidence=retrieveReadingEvidence({question:'这项投资要不要买？',cards:[cards[0]]});
 const output=JSON.stringify({text:'请谨慎。',uncertainty:'不确定。'});
 assert.throws(()=>parseReadingOutput(output,{cards:[cards[0]],evidence,requireRealityBoundary:true}),/高风险问题需要现实依据说明/);
});

test('anchor-only retrieval requires an explicit evidence limitation',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards:[cards[0]]}).filter(item=>item.tier==='anchor');
 const vague=JSON.stringify({text:'先观察。',uncertainty:'牌面不能确认结果。'});
 assert.throws(()=>parseReadingOutput(vague,{cards:[cards[0]],evidence,requireUncertainty:true,requireCoverageBoundary:true}),/证据覆盖不足/);
 assert.throws(()=>parseReadingOutput(vague,{cards:[cards[0]],evidence,requireUncertainty:true,requireCoverageBoundary:true,isFollowUp:true}),/证据覆盖不足/);
 const grounded=JSON.stringify({text:'先观察。',uncertainty:'当前只有核心牌义，关系应用证据不足，需要结合现实资料。'});
 assert.equal(parseReadingOutput(grounded,{cards:[cards[0]],evidence,requireUncertainty:true,requireCoverageBoundary:true}).uncertainty,'当前只有核心牌义，关系应用证据不足，需要结合现实资料。');
});

test('missing forecast evidence requires the same uncertainty boundary',()=>{
 const question='我之后会怎样发展？';
 const card={id:'m08',reversed:false,position:'建议'};
 const full=retrieveReadingEvidence({question,cards:[card]});
 const evidence=full.filter(item=>item.tier==='anchor');
 const vague=JSON.stringify({text:'趋势会很清晰。',uncertainty:'牌面不能确认结果。'});
 assert.throws(()=>parseReadingOutput(vague,{cards:[card],evidence,requireUncertainty:true,requireCoverageBoundary:true}),/证据覆盖不足/);
 const grounded=JSON.stringify({text:'先观察趋势。',uncertainty:'当前缺少预测参考资料，牌面只能提供有限的趋势线索。'});
 assert.equal(parseReadingOutput(grounded,{cards:[card],evidence,requireUncertainty:true,requireCoverageBoundary:true}).uncertainty,'当前缺少预测参考资料，牌面只能提供有限的趋势线索。');
});

test('coverage boundary names the missing goal layer instead of only saying information is limited',()=>{
 const card={id:'m08',reversed:false,position:'建议'};
 const evidence=retrieveReadingEvidence({question:'我之后会怎样发展？',cards:[card]}).filter(item=>item.tier==='anchor');
 const generic=JSON.stringify({text:'先观察趋势。',uncertainty:'当前资料有限，需要谨慎核实。'});
 assert.throws(()=>parseReadingOutput(generic,{cards:[card],evidence,requireUncertainty:true,requireCoverageBoundary:true,coverageBoundaryGoals:['forecast']}),/证据覆盖不足/);
 const grounded=JSON.stringify({text:'先观察趋势。',uncertainty:'当前缺少预测参考资料，牌面只能提供有限的趋势线索。'});
 assert.doesNotThrow(()=>parseReadingOutput(grounded,{cards:[card],evidence,requireUncertainty:true,requireCoverageBoundary:true,coverageBoundaryGoals:['forecast']}));
});

test('forecast readings require a matching reference-tier citation when available',()=>{
 const card={id:'m08',reversed:false,position:'建议'};
 const evidence=retrieveReadingEvidence({question:'我之后会怎样发展？',cards:[card]});
 const orientation=evidence.find(item=>item.kind==='orientation');
 const forecastReference=evidence.find(item=>item.tier==='reference'&&item.retrievalGoals.includes('forecast'));
 assert.ok(forecastReference);
 const missing=JSON.stringify({text:'先观察趋势。',references:[{evidenceId:orientation.evidenceId,cardId:'m08',position:'建议',claim:'核心牌义'}]});
 assert.throws(()=>parseReadingOutput(missing,{cards:[card],evidence,requiredGoalEvidence:['forecast']}),/首轮引用没有覆盖当前回答目标/);
 const valid=JSON.stringify({text:'先观察趋势。',references:[{evidenceId:orientation.evidenceId,cardId:'m08',position:'建议',claim:'核心牌义'},{evidenceId:forecastReference.evidenceId,cardId:'m08',position:'建议',claim:'未来趋势'}]});
 assert.equal(parseReadingOutput(valid,{cards:[card],evidence,requiredGoalEvidence:['forecast']}).references.length,2);
});

test('forecast top-level text must use the routed reference concept',()=>{
 const card={id:'m08',reversed:false,position:'建议'};
 const evidence=retrieveReadingEvidence({question:'我之后会怎样发展？',cards:[card]});
 const orientation=evidence.find(item=>item.kind==='orientation');
 const forecastReference=evidence.find(item=>item.tier==='reference'&&item.retrievalGoals.includes('forecast'));
 assert.ok(orientation&&forecastReference);
 const detached=JSON.stringify({text:'未来先观察现实反馈，保持平静。',references:[
  {evidenceId:orientation.evidenceId,cardId:'m08',position:'建议',claim:'稳定、温柔而明确'},
  {evidenceId:forecastReference.evidenceId,cardId:'m08',position:'建议',claim:'Fortitude 的力量与勇气'},
 ]});
 assert.throws(()=>parseReadingOutput(detached,{cards:[card],evidence,requiredGoalEvidence:['forecast'],requireGoalReferenceCoverage:true,requireReferenceClaims:true,requireReferenceSupport:true,requireGoalTextCoverage:true}),/回答正文没有覆盖当前目标证据/);
 const grounded=JSON.stringify({text:'未来可以以 Fortitude 的力量与勇气作为趋势参考，再观察现实反馈。',references:[
  {evidenceId:orientation.evidenceId,cardId:'m08',position:'建议',claim:'稳定、温柔而明确'},
  {evidenceId:forecastReference.evidenceId,cardId:'m08',position:'建议',claim:'Fortitude 的力量与勇气'},
 ]});
 assert.doesNotThrow(()=>parseReadingOutput(grounded,{cards:[card],evidence,requiredGoalEvidence:['forecast'],requireGoalReferenceCoverage:true,requireReferenceClaims:true,requireReferenceSupport:true,requireGoalTextCoverage:true}));
});

test('mixed first readings require one grounded section per routed goal',()=>{
 const card={id:'m08',reversed:false,position:'建议'};
 const evidence=retrieveReadingEvidence({question:'我之后会怎样发展？同时我该怎么安排下一步？',cards:[card]});
 const adviceApplication=evidence.find(item=>item.tier==='application'&&item.retrievalGoals.includes('advice'));
 assert.ok(adviceApplication);
 const valid=JSON.stringify({text:'分别看下一步与趋势。',goalSections:[
  {goal:'advice',text:'先照顾情绪，再把下一步落实为不被情绪牵着走的行动。',evidenceIds:[adviceApplication.evidenceId]},
  {goal:'forecast',text:'以 Fortitude 的力量与勇气作为趋势参考。',evidenceIds:['m08:waite']},
 ]});
 const parsed=parseReadingOutput(valid,{cards:[card],evidence,requiredGoalSections:['advice','forecast'],requireGoalSections:true});
 assert.deepEqual(parsed.goalSections.map(item=>item.goal),['advice','forecast']);
 const wrongOrder=JSON.stringify({text:'先讲趋势，再讲建议。',goalSections:[{goal:'forecast',text:'以 Fortitude 的力量与勇气作为趋势参考。',evidenceIds:['m08:waite']},{goal:'advice',text:'先照顾情绪，再把下一步落实为不被情绪牵着走的行动。',evidenceIds:[adviceApplication.evidenceId]}]});
 assert.throws(()=>parseReadingOutput(wrongOrder,{cards:[card],evidence,requiredGoalSections:['advice','forecast'],requireGoalSections:true}),/目标分段顺序不符合/);
 const missing=JSON.stringify({text:'只回答建议。',goalSections:[{goal:'advice',text:'先照顾情绪，再把下一步落实为不被情绪牵着走的行动。',evidenceIds:[adviceApplication.evidenceId]}]});
 assert.throws(()=>parseReadingOutput(missing,{cards:[card],evidence,requiredGoalSections:['advice','forecast'],requireGoalSections:true}),/必须按目标分别返回目标分段/);
 const wrongEvidence=JSON.stringify({text:'目标依据不匹配。',goalSections:[{goal:'advice',text:'以 Fortitude 的力量作为建议。',evidenceIds:['m08:waite']},{goal:'forecast',text:'以 Fortitude 的力量与勇气作为趋势参考。',evidenceIds:['m08:waite']}]});
 assert.throws(()=>parseReadingOutput(wrongEvidence,{cards:[card],evidence,requiredGoalSections:['advice','forecast'],requireGoalSections:true}),/目标分段引用无效/);
 const wrongTier=JSON.stringify({text:'预测分段缺少参考层级。',goalSections:[{goal:'advice',text:'把稳定、温柔而明确的方式落实为下一步。',evidenceIds:['m08:orientation']},{goal:'forecast',text:'以稳定线索作为趋势参考。',evidenceIds:['m08:orientation']}]});
 assert.throws(()=>parseReadingOutput(wrongTier,{cards:[card],evidence,requiredGoalSections:['advice','forecast'],requireGoalSections:true}),/目标分段缺少目标层级证据/);
 const unrequested=JSON.stringify({text:'加入未请求目标。',goalSections:[{goal:'advice',text:'先照顾情绪，再把下一步落实为不被情绪牵着走的行动。',evidenceIds:[adviceApplication.evidenceId]},{goal:'forecast',text:'以 Fortitude 的力量与勇气作为趋势参考。',evidenceIds:['m08:waite']},{goal:'comparison',text:'比较条件与代价。',evidenceIds:['m08:modern']}]});
 assert.throws(()=>parseReadingOutput(unrequested,{cards:[card],evidence,requiredGoalSections:['advice','forecast'],requireGoalSections:true}),/目标分段目标未被本轮路由/);
});

test('mixed first-reading top-level text must cover every routed goal',()=>{
 const card={id:'m08',reversed:false,position:'建议'};
 const evidence=retrieveReadingEvidence({question:'我之后会怎样发展？同时我该怎么安排下一步？',cards:[card]});
 const advice=evidence.find(item=>item.tier==='application'&&item.retrievalGoals.includes('advice'));
 const forecast=evidence.find(item=>item.tier==='reference'&&item.retrievalGoals.includes('forecast'));
 assert.ok(advice&&forecast);
 const sections=[
  {goal:'advice',text:'先照顾情绪，再把下一步落实为不被情绪牵着走的行动。',evidenceIds:[advice.evidenceId]},
  {goal:'forecast',text:'以 Fortitude 的力量与勇气作为趋势参考。',evidenceIds:[forecast.evidenceId]},
 ];
 const missing=JSON.stringify({text:'用稳定、温柔而明确的方式面对下一步。',goalSections:sections});
 assert.throws(()=>parseReadingOutput(missing,{cards:[card],evidence,requiredGoalSections:['advice','forecast'],requireGoalSections:true,requireGoalTextCoverage:true,requireTextSupport:true}),/混合目标正文没有覆盖每个回答目标/);
 const covered=JSON.stringify({text:'先照顾情绪，再不被它牵着走，并以 Fortitude 的力量与勇气观察发展。',goalSections:sections});
 assert.deepEqual(parseReadingOutput(covered,{cards:[card],evidence,requiredGoalSections:['advice','forecast'],requireGoalSections:true,requireGoalTextCoverage:true,requireTextSupport:true}).goalSections.map(item=>item.goal),['advice','forecast']);
});

test('single-goal readings reject an unrequested goal section',()=>{
 const card={id:'m08',reversed:false,position:'建议'};
 const evidence=retrieveReadingEvidence({question:'我该怎么处理这段关系？',cards:[card]});
 const output=JSON.stringify({text:'先回答当前目标。',goalSections:[{goal:'forecast',text:'补充一段预测。',evidenceIds:['m08:orientation']}]});
 assert.throws(()=>parseReadingOutput(output,{cards:[card],evidence,allowedGoalSections:['advice']}),/目标分段目标未被本轮路由/);
});

test('single-goal goal sections must also use specific evidence terms',()=>{
 const card={id:'m08',reversed:false,position:'建议'};
 const evidence=retrieveReadingEvidence({question:'我该怎么处理这段关系？',cards:[card]});
 const adviceApplication=evidence.find(item=>item.tier==='application'&&item.retrievalGoals.includes('advice'));
 const output=JSON.stringify({text:'先回答当前目标。',goalSections:[{goal:'advice',text:'说明方向并观察结果。',evidenceIds:[adviceApplication.evidenceId]}]});
 assert.throws(()=>parseReadingOutput(output,{cards:[card],evidence,allowedGoalSections:['advice']}),/目标分段内容与证据不匹配/);
});

test('first-reading goal sections require the routed goal evidence tier',()=>{
 const card={id:'m08',reversed:false,position:'建议'};
 const evidence=retrieveReadingEvidence({question:'我该怎么处理这段关系？',cards:[card]});
 const orientation=evidence.find(item=>item.kind==='orientation');
 const output=JSON.stringify({text:'先回答当前目标。',goalSections:[{goal:'advice',text:'以稳定节奏落实下一步。',evidenceIds:[orientation.evidenceId]}]});
 assert.throws(()=>parseReadingOutput(output,{cards:[card],evidence,allowedGoalSections:['advice']}),/目标分段缺少目标层级证据/);
});

test('calibration rejects absolute predictive claims even when the output is structured',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards:[cards[0]]});
 const output=JSON.stringify({text:'这张牌保证你们一定会复合。',cardReadings:[{cardId:'m08',position:'建议',reading:'把稳定节奏作为观察线索。',evidenceIds:[evidence.find(item=>item.kind==='orientation').evidenceId]}]});
 assert.throws(()=>parseReadingOutput(output,{cards:[cards[0]],evidence,requireCardReadingSupport:true,requireCalibratedLanguage:true}),/绝对断言/);
});

test('calibration rejects absolute claims in actions and goal sections',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards:[cards[0]]});
 const orientation=evidence.find(item=>item.kind==='orientation');
 const actionOutput=JSON.stringify({text:'保持稳定节奏。',actions:[{text:'今天记录一次稳定行动。',reason:'这保证对方一定会回来。',evidenceIds:[orientation.evidenceId]}]});
 assert.throws(()=>parseReadingOutput(actionOutput,{cards:[cards[0]],evidence,requireCalibratedLanguage:true}),/绝对断言/);
 const advice=evidence.find(item=>item.tier==='application'&&item.retrievalGoals?.includes('advice'))??orientation;
 const goalOutput=JSON.stringify({text:'保持稳定节奏。',goalSections:[{goal:'advice',text:'平静一定会解决问题。',evidenceIds:[advice.evidenceId]}]});
 assert.throws(()=>parseReadingOutput(goalOutput,{cards:[cards[0]],evidence,allowedGoalSections:['advice'],requireCalibratedLanguage:true}),/绝对断言/);
});

test('calibration allows a negated boundary around an absolute prediction',()=>{
 const output=JSON.stringify({text:'牌面不能保证一定会复合，仍需观察现实沟通。'});
 const parsed=parseReadingOutput(output,{requireCalibratedLanguage:true});
 assert.equal(parsed.text,'牌面不能保证一定会复合，仍需观察现实沟通。');
});

test('calibration rejects deterministic timing claims but allows timed actions',()=>{
 const timedPrediction=JSON.stringify({text:'三天后他会主动联系你。',uncertainty:'牌面不能确认具体日期。'});
 assert.throws(()=>parseReadingOutput(timedPrediction,{requireCalibratedLanguage:true}),/确定时间/);
 const boundedTiming=JSON.stringify({text:'牌面不能保证三天后会发生这件事。',uncertainty:'仍需观察现实反馈。'});
 assert.doesNotThrow(()=>parseReadingOutput(boundedTiming,{requireCalibratedLanguage:true}));
 const timedAction=JSON.stringify({text:'把稳定节奏作为观察线索。',actions:[{text:'未来三天记录一次现实反馈。',reason:'用稳定节奏核对现实互动。',evidenceIds:['m08:orientation']}]});
 assert.doesNotThrow(()=>parseReadingOutput(timedAction,{cards:[{id:'m08',position:'建议'}],evidence:[{evidenceId:'m08:orientation',cardId:'m08',position:'建议',tier:'anchor',text:'用稳定节奏观察现实反馈。'}],requireCalibratedLanguage:true}));
});

test('plain text provider responses stay backward compatible without inventing references',()=>{
 const parsed=parseReadingOutput('保持稳定练习。',{cards,evidence:[]});
 assert.deepEqual(parsed,{text:'保持稳定练习。',synthesis:{text:'',evidenceIds:[]},goalSections:[],references:[],cardReadings:[],actions:[],needsClarification:false,clarification:'',followUp:'',uncertainty:''});
});

test('plain text follow-ups still require a concrete evidence overlap',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards:[cards[0]]});
 assert.equal(parseReadingOutput('保持温柔而稳定的练习。',{cards:[cards[0]],evidence,isFollowUp:true,requireTextSupport:true}).text,'保持温柔而稳定的练习。');
 assert.throws(()=>parseReadingOutput('对方已经搬去火星。',{cards:[cards[0]],evidence,isFollowUp:true,requireTextSupport:true}),/追问正文与证据不匹配/);
 assert.throws(()=>parseReadingOutput('稳定节奏会在三天后出现。',{cards:[cards[0]],evidence,isFollowUp:true,requireTextSupport:true,requireCalibratedLanguage:true}),/确定时间/);
});

test('structured follow-ups require top-level text support from cited evidence',()=>{
 const card={id:'m08',reversed:false,position:'建议'};
 const evidence=retrieveReadingEvidence({question:'继续聊聊',cards:[card]});
 const orientation=evidence.find(item=>item.kind==='orientation');
 const generic=JSON.stringify({text:'对方已经搬去火星。',references:[{evidenceId:orientation.evidenceId,cardId:'m08',position:'建议',claim:'稳定节奏'}]});
 assert.throws(()=>parseReadingOutput(generic,{cards:[card],evidence,requireReferenceClaims:true,requireReferenceSupport:true,isFollowUp:true}),/追问正文与证据不匹配/);

 const grounded=JSON.stringify({text:'继续用稳定、温柔的方式观察现实回应。',references:[{evidenceId:orientation.evidenceId,cardId:'m08',position:'建议',claim:'稳定节奏'}]});
 assert.equal(parseReadingOutput(grounded,{cards:[card],evidence,requireReferenceClaims:true,requireReferenceSupport:true,isFollowUp:true}).text,'继续用稳定、温柔的方式观察现实回应。');
});

test('structured follow-ups can ground top-level text through goal sections',()=>{
 const card={id:'m08',reversed:false,position:'建议'};
 const evidence=retrieveReadingEvidence({question:'我该如何处理这段关系？',cards:[card]});
 const orientation=evidence.find(item=>item.kind==='orientation');
 const output=JSON.stringify({text:'继续用稳定、温柔的方式观察下一步。',goalSections:[{goal:'advice',text:'把稳定、温柔的方式落实为下一步。',evidenceIds:[orientation.evidenceId]}]});
 const parsed=parseReadingOutput(output,{cards:[card],evidence,allowedGoalSections:['advice'],isFollowUp:true});
 assert.equal(parsed.goalSections[0].goal,'advice');
});

test('structured follow-up actions must stay grounded in their evidence',()=>{
 const card={id:'m08',reversed:false,position:'建议'};
 const evidence=retrieveReadingEvidence({question:'继续聊聊',cards:[card]});
 const orientation=evidence.find(item=>item.kind==='orientation');
 const unsupported=JSON.stringify({text:'保持稳定、温柔而明确。',actions:[{text:'对方已经搬去火星。',reason:'依据稳定、温柔的牌面线索。',evidenceIds:[orientation.evidenceId]}]});
 assert.throws(()=>parseReadingOutput(unsupported,{cards:[card],evidence,isFollowUp:true,requireTextSupport:true}),/行动建议内容与证据不匹配/);
 const grounded=JSON.stringify({text:'保持稳定、温柔而明确。',actions:[{text:'今天记录一次稳定、温柔而明确的沟通。',reason:'依据稳定、温柔的牌面线索。',evidenceIds:[orientation.evidenceId]}]});
 assert.equal(parseReadingOutput(grounded,{cards:[card],evidence,isFollowUp:true,requireTextSupport:true}).actions.length,1);
});

test('structured advice follow-up actions require available application evidence',()=>{
 const card={id:'m08',reversed:false,position:'建议'};
 const evidence=retrieveReadingEvidence({question:'我该如何处理这段关系？',cards:[card]});
 const orientation=evidence.find(item=>item.kind==='orientation');
 const application=evidence.find(item=>item.kind==='relationships');
 const output=JSON.stringify({text:'继续用稳定、温柔的方式观察现实回应。',actions:[{text:'今天记录一次稳定、温柔的沟通。',reason:'依据稳定、温柔的牌面线索。',evidenceIds:[orientation.evidenceId]}]});
 assert.throws(()=>parseReadingOutput(output,{cards:[card],evidence,requiredActionGoalEvidence:['advice'],isFollowUp:true,requireTextSupport:true}),/首轮行动建议缺少当前目标的应用证据/);
 const valid=JSON.stringify({text:'继续用稳定、温柔的方式观察现实回应。',actions:[{text:'今天记录一次稳定、温柔的沟通。',reason:'依据稳定、温柔的牌面线索。',evidenceIds:[orientation.evidenceId,application.evidenceId]}]});
 assert.equal(parseReadingOutput(valid,{cards:[card],evidence,requiredActionGoalEvidence:['advice'],isFollowUp:true,requireTextSupport:true}).actions.length,1);
});

test('rejects a grounded response that does not answer the explicit question domain',()=>{
 const card={id:'m08',reversed:false,position:'建议'};
 const evidence=retrieveReadingEvidence({question:'我该如何处理这段关系？',cards:[card]});
 const orientation=evidence.find(item=>item.kind==='orientation');
 const output=JSON.stringify({text:'继续用稳定、温柔而明确的方式面对恐惧。',actions:[{text:'今天记录一次稳定的行动。',reason:'稳定节奏可以帮助继续观察。',evidenceIds:[orientation.evidenceId]}]});
 assert.throws(()=>parseReadingOutput(output,{cards:[card],evidence,activeQuestion:'我该如何处理这段关系？',requireQuestionRelevance:true,requireTextSupport:true,isFollowUp:true}),/没有直接回应本轮问题/);
 const relevant=JSON.stringify({text:'这段关系可以继续用稳定、温柔而明确的方式面对恐惧。',actions:[{text:'今天记录一次稳定的行动。',reason:'稳定节奏可以帮助继续观察。',evidenceIds:[orientation.evidenceId]}]});
 assert.doesNotThrow(()=>parseReadingOutput(relevant,{cards:[card],evidence,activeQuestion:'我该如何处理这段关系？',requireQuestionRelevance:true,requireTextSupport:true,isFollowUp:true}));
});

test('accepts a same-domain synonym in active question relevance',()=>{
 const card={id:'m08',reversed:false,position:'建议'};
 const evidence=retrieveReadingEvidence({question:'我该如何准备考试？',cards:[card]});
 const orientation=evidence.find(item=>item.kind==='orientation');
 const output=JSON.stringify({text:'学习安排可以继续用稳定、温柔而明确的方式面对恐惧。',actions:[{text:'今天记录一次学习中的稳定节奏行动。',reason:'稳定节奏可以帮助继续观察。',evidenceIds:[orientation.evidenceId]}]});
 assert.doesNotThrow(()=>parseReadingOutput(output,{cards:[card],evidence,activeQuestion:'我该如何准备考试？',requireQuestionRelevance:true,requireTextSupport:true,isFollowUp:true}));
});

test('requires every explicit topic in a mixed active question',()=>{
 const card={id:'m08',reversed:false,position:'建议'};
 const evidence=retrieveReadingEvidence({question:'这段感情和工作如何平衡？',cards:[card]});
 const orientation=evidence.find(item=>item.kind==='orientation');
 const work=evidence.find(item=>item.kind==='work');
 const missing=JSON.stringify({text:'这段感情可以继续用稳定、温柔而明确的方式面对恐惧。',actions:[{text:'今天记录一次稳定的行动。',reason:'稳定节奏可以帮助继续观察。',evidenceIds:[orientation.evidenceId,work.evidenceId]}]});
 assert.throws(()=>parseReadingOutput(missing,{cards:[card],evidence,activeQuestion:'这段感情和工作如何平衡？',requireQuestionRelevance:true,requireTextSupport:true,isFollowUp:true}),/没有直接回应本轮问题/);
 const complete=JSON.stringify({text:'这段感情与工作安排都可以继续用稳定、温柔而明确的方式面对恐惧。',actions:[{text:'今天记录一次稳定的行动。',reason:'稳定节奏可以帮助继续观察。',evidenceIds:[orientation.evidenceId,work.evidenceId]}]});
 assert.doesNotThrow(()=>parseReadingOutput(complete,{cards:[card],evidence,activeQuestion:'这段感情和工作如何平衡？',requireQuestionRelevance:true,requireTextSupport:true,isFollowUp:true}));
});

test('requires the top-level answer to honor an explicit response goal',()=>{
 const output=JSON.stringify({text:'把稳定节奏拆成今天可以执行的小步。'});
 assert.throws(()=>parseReadingOutput(output,{requiredOutputGoals:['forecast'],requireGoalAlignment:true}),/回答没有遵守本轮目标模式/);
 const observationOnly=JSON.stringify({text:'先观察现实反馈，再保持稳定节奏。'});
 assert.throws(()=>parseReadingOutput(observationOnly,{requiredOutputGoals:['forecast'],requireGoalAlignment:true}),/回答没有遵守本轮目标模式/);
 const valid=JSON.stringify({text:'趋势仍可能变化，先观察现实反馈再复盘。'});
 assert.doesNotThrow(()=>parseReadingOutput(valid,{requiredOutputGoals:['forecast'],requireGoalAlignment:true}));
});

test('comparison answers must name a side and a trade-off',()=>{
 const vague=JSON.stringify({text:'比较并做决定。'});
 assert.throws(()=>parseReadingOutput(vague,{requiredOutputGoals:['comparison'],requireGoalAlignment:true}),/回答没有遵守本轮目标模式/);
 const grounded=JSON.stringify({text:'比较主动联系与等待的条件和代价，再根据现实反馈选择。'});
 assert.doesNotThrow(()=>parseReadingOutput(grounded,{requiredOutputGoals:['comparison'],requireGoalAlignment:true}));
});

test('checks each mixed goal section against its own response mode',()=>{
 const evidence=[
  {evidenceId:'advice:application',retrievalGoals:['advice'],tier:'application',text:'稳定节奏可以落实为今天的一步行动。'},
  {evidenceId:'advice:wrong',retrievalGoals:['advice'],tier:'application',text:'趋势可能变化，先观察现实反馈。'},
  {evidenceId:'forecast:reference',retrievalGoals:['forecast'],tier:'reference',text:'趋势可能变化，先观察现实反馈。'},
 ];
 const output=JSON.stringify({text:'先给出下一步，再说明趋势。',goalSections:[
  {goal:'advice',text:'先把稳定节奏落实为今天的一步行动。',evidenceIds:['advice:application']},
  {goal:'forecast',text:'趋势可能变化，先观察现实反馈。',evidenceIds:['forecast:reference']},
 ]});
 assert.doesNotThrow(()=>parseReadingOutput(output,{evidence,requiredOutputGoals:['advice','forecast'],requireGoalAlignment:true}));
 const wrong=JSON.stringify({text:'先给出下一步，再说明趋势。',goalSections:[
  {goal:'advice',text:'趋势可能变化，先观察现实反馈。',evidenceIds:['advice:wrong']},
  {goal:'forecast',text:'趋势可能变化，先观察现实反馈。',evidenceIds:['forecast:reference']},
 ]});
 assert.throws(()=>parseReadingOutput(wrong,{evidence,requiredOutputGoals:['advice','forecast'],requireGoalAlignment:true}),/回答没有遵守本轮目标模式/);
});

test('requires an optional follow-up to be one concrete question',()=>{
 const vague=JSON.stringify({text:'把稳定节奏拆成可执行的小步。',followUp:'还有什么想问的吗？'});
 assert.throws(()=>parseReadingOutput(vague,{requireFollowUpQuestion:true}),/追问问题格式不正确/);
 const multiple=JSON.stringify({text:'把稳定节奏拆成可执行的小步。',followUp:'你想先看关系吗？还是要继续问事业？'});
 assert.throws(()=>parseReadingOutput(multiple,{requireFollowUpQuestion:true}),/追问问题格式不正确/);
 const focused=JSON.stringify({text:'把稳定节奏拆成可执行的小步。',followUp:'你最容易在哪个时段中断？'});
 assert.doesNotThrow(()=>parseReadingOutput(focused,{requireFollowUpQuestion:true}));
});

test('grounding rejects an unsupported comma clause after a supported clause',()=>{
 const card={id:'m08',reversed:false,position:'建议'};
 const evidence=retrieveReadingEvidence({question:'我每天学习两小时，如何保持？',cards:[card]});
 const orientation=evidence.find(item=>item.kind==='orientation');
 const work=evidence.find(item=>item.kind==='work');
 const unsupported=JSON.stringify({text:'保持稳定节奏。',actions:[{text:'保持稳定节奏，但对方已经搬去火星。',evidenceIds:[orientation.evidenceId,work.evidenceId]}]});
 assert.throws(()=>parseReadingOutput(unsupported,{cards:[card],evidence,isFollowUp:true,requireTextSupport:true}),/行动建议内容与证据不匹配/);
 const grounded=JSON.stringify({text:'保持稳定节奏。',actions:[{text:'今天记录一次稳定节奏，并练习克制情绪。',evidenceIds:[orientation.evidenceId,work.evidenceId]}]});
 assert.equal(parseReadingOutput(grounded,{cards:[card],evidence,isFollowUp:true,requireTextSupport:true}).actions.length,1);
});

test('grounding rejects unsupported conjunction and enumeration clauses',()=>{
 const card={id:'m08',reversed:false,position:'建议'};
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards:[card]});
 const orientation=evidence.find(item=>item.kind==='orientation');
 for(const text of ['保持稳定然而对方已经搬去火星。','保持稳定、对方已经搬去火星。','保持稳定并且对方已经搬去火星。','保持稳定而对方已经搬去火星。','保持稳定且对方已经搬去火星。','保持稳定并对方已经搬去火星。','保持稳定以及对方已经搬去火星。','保持稳定也对方已经搬去火星。','保持稳定所以对方已经搬去火星。','保持稳定因此对方已经搬去火星。','保持稳定因为对方已经搬去火星。']){
  const unsupported=JSON.stringify({text:'保持稳定。',cardReadings:[{cardId:'m08',position:'建议',reading:text,evidenceIds:[orientation.evidenceId]}]});
  assert.throws(()=>parseReadingOutput(unsupported,{cards:[card],evidence,requireCardReadingSupport:true}),/逐牌解读内容与证据不匹配/);
 }
 const grounded=JSON.stringify({text:'保持稳定。',cardReadings:[{cardId:'m08',position:'建议',reading:'保持稳定、温柔而明确。',evidenceIds:[orientation.evidenceId]}]});
 assert.equal(parseReadingOutput(grounded,{cards:[card],evidence,requireCardReadingSupport:true}).cardReadings.length,1);
});

test('mixed structured follow-ups must cover every returned goal in top-level text',()=>{
 const card={id:'m08',reversed:false,position:'建议'};
 const evidence=retrieveReadingEvidence({question:'我之后会怎样发展？同时我该怎么安排下一步？',cards:[card]});
 const advice=evidence.find(item=>item.tier==='application'&&item.retrievalGoals.includes('advice'));
 const forecast=evidence.find(item=>item.tier==='reference'&&item.retrievalGoals.includes('forecast'));
 assert.ok(advice&&forecast);
 const sections=[
  {goal:'advice',text:'先照顾情绪，再把下一步落实为不被情绪牵着走的行动。',evidenceIds:[advice.evidenceId]},
  {goal:'forecast',text:'以 Fortitude 作为趋势参考。',evidenceIds:[forecast.evidenceId]},
 ];
 const missing=JSON.stringify({text:'先照顾情绪，再不被它牵着走。',goalSections:sections});
 assert.throws(()=>parseReadingOutput(missing,{cards:[card],evidence,allowedGoalSections:['advice','forecast'],requireGoalTextCoverage:true,requireTextSupport:true,isFollowUp:true}),/混合目标正文没有覆盖每个回答目标/);
 const covered=JSON.stringify({text:'先照顾情绪，再不被它牵着走，并以 Fortitude 作为趋势参考。',goalSections:sections});
 assert.deepEqual(parseReadingOutput(covered,{cards:[card],evidence,allowedGoalSections:['advice','forecast'],requireGoalTextCoverage:true,requireTextSupport:true,isFollowUp:true}).goalSections.map(item=>item.goal),['advice','forecast']);
});

test('structured follow-ups require the routed goal evidence tier',()=>{
 const card={id:'m08',reversed:false,position:'建议'};
 const evidence=retrieveReadingEvidence({question:'我之后会怎样发展？',cards:[card]});
 const orientation=evidence.find(item=>item.kind==='orientation');
 const forecast=evidence.find(item=>item.tier==='reference'&&item.retrievalGoals?.includes('forecast'));
 const missing=JSON.stringify({text:'保持稳定节奏。',references:[{evidenceId:orientation.evidenceId,cardId:'m08',position:'建议',claim:'稳定节奏'}]});
 assert.throws(()=>parseReadingOutput(missing,{cards:[card],evidence,requiredGoalEvidence:['forecast'],requireGoalReferenceCoverage:true,requireReferenceClaims:true,requireReferenceSupport:true,isFollowUp:true}),/追问引用没有覆盖当前回答目标/);
 const valid=JSON.stringify({text:'保持稳定、温柔而明确。',references:[{evidenceId:orientation.evidenceId,cardId:'m08',position:'建议',claim:'稳定节奏'},{evidenceId:forecast.evidenceId,cardId:'m08',position:'建议',claim:'Fortitude'}]});
 assert.equal(parseReadingOutput(valid,{cards:[card],evidence,requiredGoalEvidence:['forecast'],requireGoalReferenceCoverage:true,requireReferenceClaims:true,requireReferenceSupport:true,isFollowUp:true}).references.length,2);
 const sectionOnly=JSON.stringify({text:'Fortitude 提供一条趋势参考。',goalSections:[{goal:'forecast',text:'以 Fortitude 作为趋势参考。',evidenceIds:[forecast.evidenceId]}]});
 assert.equal(parseReadingOutput(sectionOnly,{cards:[card],evidence,requiredGoalEvidence:['forecast'],requireGoalReferenceCoverage:true,allowedGoalSections:['forecast'],isFollowUp:true}).goalSections[0].goal,'forecast');
});

test('first readings reject plain text so the grounding contract cannot be bypassed',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards:[cards[0]]});
 assert.throws(()=>parseReadingOutput('保持稳定练习。',{cards:[cards[0]],evidence,requireCoverage:true,requireActions:true,requireReferences:true,requireReferenceClaims:true}),/首轮解读必须返回结构化 JSON/);
});
