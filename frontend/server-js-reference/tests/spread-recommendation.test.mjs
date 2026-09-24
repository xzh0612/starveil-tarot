import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spreads} from '../../src/domain.js';
import {recommendLocalSpreads} from '../../src/spread-recommendation.js';
import {parseRecommendations} from '../spread-recommendations.mjs';

test('local recommendations prioritize relationship questions with a useful reason',()=>{
 const result=recommendLocalSpreads('我和她还有机会继续发展吗？');
 assert.ok(result.length>=2&&result.length<=3);
 assert.equal(result[0].id,'love');
 assert.ok(result[0].reason.length>=20);
 assert.ok(spreads.some(s=>s.id===result[0].id));
});

test('local recommendations prioritize career questions and remain deterministic',()=>{
 const question='我该不该换工作，下一步职业方向是什么？';
 const first=recommendLocalSpreads(question),second=recommendLocalSpreads(question);
 assert.deepEqual(first,second);
 assert.equal(first[0].id,'career');
 assert.equal(new Set(first.map(item=>item.id)).size,first.length);
});

test('local recommendations use a broad reflective spread for an open question',()=>{
 const result=recommendLocalSpreads('最近有点迷茫，想知道现在该如何整理自己');
 assert.ok(['three','one','time'].includes(result[0].id));
 assert.ok(result.every(item=>item.reason&&item.reason.length<=300));
});

test('empty or whitespace questions return no recommendations',()=>{
 assert.deepEqual(recommendLocalSpreads('   '),[]);
 assert.deepEqual(recommendLocalSpreads(''),[]);
});

test('AI recommendation reasons must be grounded in catalog positions',()=>{
 const valid=JSON.stringify({recommendations:[
  {id:'choice',reason:'把两条选择的机会和挑战并列起来，适合比较条件与代价。'},
  {id:'career',reason:'从优势、阻碍和下一步逐层梳理职业方向。'}
 ]});
 assert.equal(parseRecommendations(valid,'两个工作机会该如何比较？')[0].id,'choice');

 const generic=JSON.stringify({recommendations:[
  {id:'choice',reason:'这个牌阵很适合你，值得优先考虑。'},
  {id:'career',reason:'这个牌阵也很适合你，可以试试看。'}
 ]});
 assert.throws(()=>parseRecommendations(generic),/牌阵推荐理由/);

 const offTopic=JSON.stringify({recommendations:[
  {id:'choice',reason:'从现状与两条道路的挑战中观察代价与变化。'},
  {id:'career',reason:'关注你的优势、阻碍和下一步。'}
 ]});
 assert.throws(()=>parseRecommendations(offTopic,'两个工作机会该如何比较？'),/问题不相关/);
});
