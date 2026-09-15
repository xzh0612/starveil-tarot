import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseReadingResponse,readingErrorHint,evidenceCoverageLabel} from '../src/services.js';

test('reading error hints turn stable validation codes into calm UI copy',()=>{
 assert.match(readingErrorHint('invalid_synthesis_evidence'),/合读部分的牌义依据未通过核验/);
 assert.match(readingErrorHint('synthesis_support'),/合读部分没有得到证据支持/);
 assert.match(readingErrorHint('card_reading_support'),/逐牌解释/);
 assert.match(readingErrorHint('overconfident_claim'),/绝对预测/);
 assert.match(readingErrorHint('action_concreteness'),/可执行/);
 assert.match(readingErrorHint('missing_reality_boundary'),/现实资料或专业意见/);
 assert.match(readingErrorHint('provider_auth'),/密钥未通过验证/);
 assert.match(readingErrorHint('unknown_code'),/没有通过服务端核验/);
});

test('evidence coverage diagnostics have explicit user-facing labels',()=>{
 assert.match(evidenceCoverageLabel('complete'),/完整覆盖/);
 assert.match(evidenceCoverageLabel('anchor_only'),/核心牌义为主/);
 assert.match(evidenceCoverageLabel('unknown'),/待核验/);
});

test('reading response preserves the server validation code on failure',async()=>{
 const response=Response.json({error:'综合解读引用无效，请重试。',code:'invalid_synthesis_evidence'},{status:502});
 await assert.rejects(parseReadingResponse(response),error=>{
  assert.equal(error.message,'综合解读引用无效，请重试。');
  assert.equal(error.code,'invalid_synthesis_evidence');
  assert.equal(error.status,502);
  return true;
 });
});

test('reading response uses a safe fallback when the server body is not JSON',async()=>{
 const response=new Response('upstream secret',{status:502});
 await assert.rejects(parseReadingResponse(response),error=>{
  assert.equal(error.message,'解读服务暂时未连接。牌面已保留，请稍后重试。');
  assert.equal(error.code,undefined);
  assert.equal(error.status,502);
  return true;
 });
});

test('reading response rejects a successful body without text',async()=>{
 const response=Response.json({source:'ai'},{status:200});
 await assert.rejects(parseReadingResponse(response),error=>{
  assert.equal(error.message,'解读服务返回格式不正确。');
  assert.equal(error.code,'invalid_response');
  assert.equal(error.status,200);
  return true;
 });
});
