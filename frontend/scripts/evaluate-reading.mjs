import {buildReadingMessages} from '../server/readings.mjs';
import {evaluateFollowupFixture,evaluatePromptContract,evaluateReadingFixture,evaluateRetrievalSuite} from '../server/reading-eval.mjs';
import {retrieveReadingEvidence} from '../server/reading-rag.mjs';

const question='我们之间的沟通和边界要怎么调整？';
const cards=[
 {id:'m08',reversed:false,position:'建议'},
 {id:'c06',reversed:true,position:'关系挑战'},
];
const retrievalCases=[
 {name:'relationship',question:'我们之间的沟通和边界要怎么调整？',cards,requiredKinds:['orientation','symbolism','relationships']},
 {name:'career',question:'我该如何规划这次转行和下一步行动？',cards:[cards[0]],requiredKinds:['orientation','symbolism','work']},
 {name:'choice',question:'两个机会应该如何比较，哪个更适合我？',cards:[cards[0]],requiredKinds:['orientation','symbolism']},
 {name:'future',question:'接下来三个月的发展趋势是什么？',cards:[cards[0]],requiredKinds:['orientation','symbolism']},
 {name:'possibility',question:'我们能不能复合？',cards:[cards[0]],requiredKinds:['orientation','symbolism','waite']},
 {name:'colloquial-state',question:'他对我是什么感觉？',cards:[cards[0]],requiredKinds:['orientation','symbolism','waite'],requiredGoals:['forecast'],expectedGoals:['forecast']},
 {name:'path-comparison',question:'留在这里还是离开？',cards:[cards[0]],requiredKinds:['orientation','symbolism','reflection'],requiredGoals:['comparison'],expectedGoals:['comparison']},
 {name:'growth-forecast',question:'这段关系会怎么发展？',cards,requiredKinds:['orientation','symbolism','waite','relationships'],requiredGoals:['forecast'],expectedGoals:['forecast']},
 {name:'mixed-growth-action',question:'这段关系会怎么发展，我该怎么做？',cards,requiredKinds:['orientation','symbolism','waite','relationships'],requiredGoals:['advice','forecast'],expectedGoals:['advice','forecast']},
 {name:'card-explanation',question:'我只是想了解这张牌',cards:[cards[0]],requiredKinds:['orientation','symbolism','waite'],requiredGoals:['explanation'],expectedGoals:['explanation']},
 {name:'reflection',question:'我为什么总是感到迷茫和内耗？',cards:[cards[0]],requiredKinds:['orientation','symbolism','reflection']},
 {name:'position-semantics',question:'我正在整理工作方向。',cards:[{id:'m08',reversed:false,position:'阻碍'}],requiredKinds:['orientation','symbolism','work'],requiredPositionKinds:['work']},
];
const evidence=retrieveReadingEvidence({question,cards});
const output=JSON.stringify({
 text:'先在沟通中比较记忆和当前事实，再平静说出感受和边界，并观察当下互动是否健康。',
 synthesis:{text:'稳定、温柔而明确的方式与克制情绪相连，也要比较记忆和当前事实。',evidenceIds:cards.map(card=>evidence.find(candidate=>candidate.cardId===card.id&&candidate.kind==='orientation').evidenceId)},
 cardReadings:cards.map(card=>{
  const item=evidence.find(candidate=>candidate.cardId===card.id&&candidate.kind==='orientation');
  const reading=card.id==='m08'?'用稳定、温柔而明确的方式面对情绪，并练习克制。':'比较记忆和当前事实，再不因熟悉就忽略已经发生的变化。';
  const position=evidence.find(candidate=>candidate.cardId===card.id&&candidate.retrievalReasons?.includes('position_match'));
  return {cardId:card.id,position:card.position,reading,evidenceIds:[item.evidenceId,...(position?[position.evidenceId]:[])]};
 }),
 actions:[{text:'今天记录一次感受和底线，并练习克制情绪。',reason:'依据稳定、温柔而明确的方式，把情绪交给克制。',evidenceIds:[evidence.find(item=>item.kind==='orientation').evidenceId,evidence.find(item=>item.cardId==='m08'&&item.kind==='relationships').evidenceId]}],
 references:cards.map(card=>{
  const item=evidence.find(candidate=>candidate.cardId===card.id&&candidate.kind==='orientation');
  const application=evidence.find(candidate=>candidate.cardId===card.id&&candidate.kind==='relationships');
  return [
   {evidenceId:item.evidenceId,cardId:card.id,position:card.position,claim:item.text.slice(0,4)},
   ...(application?[{evidenceId:application.evidenceId,cardId:card.id,position:card.position,claim:application.text.slice(0,4)}]:[]),
  ];
 }).flat(),
 followUp:'你希望先讨论哪一次沟通？',
 uncertainty:'牌面不能确认对方的真实想法。',
});

const messages=buildReadingMessages({question,cards,messages:[]});
const report={
 prompt:evaluatePromptContract(messages),
 retrieval:evaluateRetrievalSuite(retrievalCases),
 reading:evaluateReadingFixture({question,cards,output,requiredKinds:['relationships']}),
 followUp:evaluateFollowupFixture({question:'我之后会怎样发展？',cards:[{id:'m08',reversed:false,position:'建议'}],output:JSON.stringify({text:'保持稳定、温柔而明确。',references:[{evidenceId:'m08:orientation',cardId:'m08',position:'建议',claim:'稳定节奏'},{evidenceId:'m08:waite',cardId:'m08',position:'建议',claim:'Fortitude'}]})}),
};
const compact={
 prompt:report.prompt,
 retrieval:{ok:report.retrieval.ok,score:report.retrieval.score,failed:report.retrieval.failed},
 reading:{ok:report.reading.ok,score:report.reading.score,issues:report.reading.issues},
 followUp:{ok:report.followUp.ok,score:report.followUp.score,issues:report.followUp.issues},
};
console.log(JSON.stringify(compact,null,2));
if(!report.prompt.ok||!report.retrieval.ok||!report.reading.ok||!report.followUp.ok)process.exitCode=1;
