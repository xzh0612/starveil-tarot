import {test} from 'node:test';
import assert from 'node:assert/strict';
import {retrieveReadingEvidence,parseReadingOutput} from '../server/reading-rag.mjs';

const cards=[
 {id:'m08',reversed:false,position:'建议'},
 {id:'c06',reversed:true,position:'关系挑战'},
];

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

test('structured output accepts only references from the retrieved evidence set',()=>{
 const evidence=retrieveReadingEvidence({question:'我每天学习两小时，如何保持？',cards:[cards[0]]});
 const valid=JSON.stringify({text:'把稳定节奏拆成可执行的小步。',references:[{evidenceId:evidence[0].evidenceId,cardId:'m08',position:'建议',claim:'稳定节奏'}],followUp:'你最容易在哪个时段中断？',uncertainty:'牌义是反思线索，不是事实证明。'});
 const parsed=parseReadingOutput(valid,{cards,evidence});
 assert.equal(parsed.text,'把稳定节奏拆成可执行的小步。');
 assert.equal(parsed.references[0].evidenceId,evidence[0].evidenceId);
 assert.equal(parsed.followUp,'你最容易在哪个时段中断？');
 assert.throws(()=>parseReadingOutput(JSON.stringify({text:'x',references:[{evidenceId:'fake',cardId:'m08',position:'建议'}]}),{cards,evidence}),/引用证据无效/);
});

test('plain text provider responses stay backward compatible without inventing references',()=>{
 const parsed=parseReadingOutput('保持稳定练习。',{cards,evidence:[]});
 assert.deepEqual(parsed,{text:'保持稳定练习。',references:[],followUp:'',uncertainty:''});
});
