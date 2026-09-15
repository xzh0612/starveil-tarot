import {test} from 'node:test';
import assert from 'node:assert/strict';
import {retrieveReadingEvidence,retrieveMemoryEvidence,parseReadingOutput,requiresProfessionalBoundary,analyzeReadingQuestion} from '../server/reading-rag.mjs';

const cards=[
 {id:'m08',reversed:false,position:'建议'},
 {id:'c06',reversed:true,position:'关系挑战'},
];

test('question analysis exposes transparent routing hints without inventing a theme',()=>{
 const relationship=analyzeReadingQuestion('我们之间的沟通和边界要怎么调整？');
 assert.deepEqual(relationship.themes,['relationship']);
 assert.equal(relationship.confidence,'focused');
 assert.ok(relationship.matchedTerms.includes('沟通'));
 const open=analyzeReadingQuestion('我最近想看看牌。');
 assert.deepEqual(open.themes,[]);
 assert.equal(open.ambiguous,true);
 assert.equal(open.confidence,'open');
});

test('retrieval always grounds each selected card in orientation and provenance',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards});
 assert.ok(evidence.length>=4&&evidence.length<=12);
 assert.deepEqual(new Set(evidence.map(item=>item.cardId)),new Set(['m08','c06']));
 assert.ok(evidence.some(item=>item.cardId==='m08'&&item.kind==='orientation'));
 assert.ok(evidence.every(item=>item.evidenceId&&item.source&&item.text));
});

test('retrieval selects relationship context for relationship questions',()=>{
 const evidence=retrieveReadingEvidence({question:'我们之间的沟通和边界要怎么调整？',cards:[cards[0]]});
 assert.ok(evidence.some(item=>item.kind==='relationships'));
});

test('memory retrieval is opt-in and ranks user-confirmed context by the question',()=>{
 const evidence=retrieveMemoryEvidence({question:'做重要决定前我该如何安排自己？',memories:[
  {id:'m1',text:'做重要决定前，我需要先独处整理思绪。',enabled:true},
  {id:'m2',text:'我喜欢在周末散步。',enabled:true},
  {id:'m3',text:'这条记录不应发送。',enabled:false},
 ]});
 assert.equal(evidence[0].evidenceId,'memory:m1');
 assert.ok(!evidence.some(item=>item.evidenceId==='memory:m3'));
 assert.ok(evidence.every(item=>item.source==='memory'&&item.cardId===null));
});

test('structured output accepts only references from the retrieved evidence set',()=>{
 const evidence=retrieveReadingEvidence({question:'我每天学习两小时，如何保持？',cards:[cards[0]]});
 const valid=JSON.stringify({text:'把稳定节奏拆成可执行的小步。',references:[{evidenceId:evidence[0].evidenceId,cardId:'m08',position:'建议',claim:'稳定节奏'}],followUp:'你最容易在哪个时段中断？',uncertainty:'牌义是反思线索，不是事实证明。'});
 const parsed=parseReadingOutput(valid,{cards,evidence});
 assert.equal(parsed.text,'把稳定节奏拆成可执行的小步。');
 assert.equal(parsed.references[0].evidenceId,evidence[0].evidenceId);
 assert.equal(parsed.followUp,'你最容易在哪个时段中断？');
 assert.throws(()=>parseReadingOutput(JSON.stringify({text:'x',references:[{evidenceId:'fake',cardId:'m08',position:'建议'}]}),{cards,evidence}),/引用证据无效/);
});

test('first-reading output must cover every selected card with grounded evidence',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards});
 const refs=cards.map(card=>{const item=evidence.find(e=>e.cardId===card.id&&e.kind==='orientation');return {evidenceId:item.evidenceId,cardId:card.id,position:card.position,claim:'牌位线索'};});
 const valid=JSON.stringify({text:'逐张说明并综合关系。',references:refs,cardReadings:cards.map(card=>({cardId:card.id,position:card.position,reading:'结合牌位说明一个可观察的角度。',evidenceIds:[refs.find(ref=>ref.cardId===card.id).evidenceId]}))});
 assert.equal(parseReadingOutput(valid,{cards,evidence,requireCoverage:true}).cardReadings.length,2);
 const missing=JSON.stringify({text:'只解释一张牌。',references:[refs[0]],cardReadings:[{cardId:cards[0].id,position:cards[0].position,reading:'只解释第一张。',evidenceIds:[refs[0].evidenceId]}]});
 assert.throws(()=>parseReadingOutput(missing,{cards,evidence,requireCoverage:true}),/没有覆盖全部牌面/);
});

test('first structured reading requires a top-level reference for every card',()=>{
 const evidence=retrieveReadingEvidence({question:'我该怎样处理这段关系？',cards});
 const refs=cards.map(card=>{const item=evidence.find(e=>e.cardId===card.id&&e.kind==='orientation');return {evidenceId:item.evidenceId,cardId:card.id,position:card.position,claim:'牌位线索'};});
 const missingReference=JSON.stringify({text:'逐张说明并综合关系。',cardReadings:cards.map(card=>({cardId:card.id,position:card.position,reading:'结合牌位说明一个可观察的角度。',evidenceIds:[refs.find(ref=>ref.cardId===card.id).evidenceId]})),actions:[{text:'先记录一次具体沟通，再复盘结果。',evidenceIds:[refs[0].evidenceId]}],references:[refs[0]]});
 assert.throws(()=>parseReadingOutput(missingReference,{cards,evidence,requireCoverage:true,requireActions:true,requireReferences:true}),/引用没有覆盖全部牌面/);
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

test('high-stakes questions require an explicit reality-based boundary',()=>{
 const evidence=retrieveReadingEvidence({question:'这项投资要不要买？',cards:[cards[0]]});
 assert.equal(requiresProfessionalBoundary('这项投资要不要买？'),true);
 assert.equal(requiresProfessionalBoundary('这段关系如何沟通？'),false);
 const noBoundary=JSON.stringify({text:'可以放心买入。',references:[]});
 assert.throws(()=>parseReadingOutput(noBoundary,{cards:[cards[0]],evidence,requireUncertainty:true}),/高风险问题需要现实依据说明/);
 const grounded=JSON.stringify({text:'牌面只能作为反思线索。',uncertainty:'投资决定请依据风险承受能力、产品资料和持牌专业意见。'});
 assert.equal(parseReadingOutput(grounded,{cards:[cards[0]],evidence,requireUncertainty:true}).uncertainty,'投资决定请依据风险承受能力、产品资料和持牌专业意见。');
});

test('plain text provider responses stay backward compatible without inventing references',()=>{
 const parsed=parseReadingOutput('保持稳定练习。',{cards,evidence:[]});
 assert.deepEqual(parsed,{text:'保持稳定练习。',references:[],cardReadings:[],actions:[],needsClarification:false,clarification:'',followUp:'',uncertainty:''});
});
