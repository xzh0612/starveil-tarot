import {buildReadingMessages} from '../server/readings.mjs';
import {evaluatePromptContract,evaluateReadingFixture,evaluateRetrievalSuite} from '../server/reading-eval.mjs';
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
 {name:'reflection',question:'我为什么总是感到迷茫和内耗？',cards:[cards[0]],requiredKinds:['orientation','symbolism','reflection']},
];
const evidence=retrieveReadingEvidence({question,cards});
const output=JSON.stringify({
 text:'先把感受与事实分开记录，再约一次有边界的沟通，观察对方是否愿意回应，并在一周后复盘结果。',
 synthesis:{text:'两张牌共同把关系焦点落在稳定、明确的表达，以及比较记忆和当前事实上。',evidenceIds:cards.map(card=>evidence.find(candidate=>candidate.cardId===card.id&&candidate.kind==='orientation').evidenceId)},
 cardReadings:cards.map(card=>{
  const item=evidence.find(candidate=>candidate.cardId===card.id&&candidate.kind==='orientation');
  const reading=card.id==='m08'?'结合稳定而明确的提示，观察一个可验证的角度，并给出下一步。':'比较记忆和当前事实，再观察一个可验证的角度，并给出下一步。';
  return {cardId:card.id,position:card.position,reading,evidenceIds:[item.evidenceId]};
 }),
 actions:[{text:'记录一次具体沟通中的事实与感受，并在一周后复盘。',reason:'依据牌面稳定、明确的行动线索，把抽象担忧变成可观察材料。',evidenceIds:[evidence.find(item=>item.kind==='orientation').evidenceId,evidence.find(item=>item.kind==='relationships').evidenceId]}],
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
};
const compact={
 prompt:report.prompt,
 retrieval:{ok:report.retrieval.ok,score:report.retrieval.score,failed:report.retrieval.failed},
 reading:{ok:report.reading.ok,score:report.reading.score,issues:report.reading.issues},
};
console.log(JSON.stringify(compact,null,2));
if(!report.prompt.ok||!report.retrieval.ok||!report.reading.ok)process.exitCode=1;
