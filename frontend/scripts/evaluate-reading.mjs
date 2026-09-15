import {buildReadingMessages} from '../server/readings.mjs';
import {evaluatePromptContract,evaluateReadingFixture} from '../server/reading-eval.mjs';
import {retrieveReadingEvidence} from '../server/reading-rag.mjs';

const question='我们之间的沟通和边界要怎么调整？';
const cards=[
 {id:'m08',reversed:false,position:'建议'},
 {id:'c06',reversed:true,position:'关系挑战'},
];
const evidence=retrieveReadingEvidence({question,cards});
const output=JSON.stringify({
 text:'先把感受与事实分开记录，再约一次有边界的沟通，观察对方是否愿意回应，并在一周后复盘结果。',
 cardReadings:cards.map(card=>{
  const item=evidence.find(candidate=>candidate.cardId===card.id&&candidate.kind==='orientation');
  return {cardId:card.id,position:card.position,reading:'结合牌位观察一个可验证的角度，并给出下一步。',evidenceIds:[item.evidenceId]};
 }),
 references:cards.map(card=>{
  const item=evidence.find(candidate=>candidate.cardId===card.id&&candidate.kind==='orientation');
  return {evidenceId:item.evidenceId,cardId:card.id,position:card.position,claim:'牌位线索'};
 }),
 followUp:'你希望先讨论哪一次沟通？',
 uncertainty:'牌面不能确认对方的真实想法。',
});

const messages=buildReadingMessages({question,cards,messages:[]});
const report={
 prompt:evaluatePromptContract(messages),
 reading:evaluateReadingFixture({question,cards,output,requiredKinds:['relationships']}),
};
const compact={
 prompt:report.prompt,
 reading:{ok:report.reading.ok,score:report.reading.score,issues:report.reading.issues},
};
console.log(JSON.stringify(compact,null,2));
if(!report.prompt.ok||!report.reading.ok)process.exitCode=1;
