import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseReadingResponse,readingErrorHint,evidenceCoverageLabel,readingGoalLabel,referenceSourceLabel,agentConfigEndpoint,readingConfig,saveReadingConfig,clearReadingConfig} from '../src/services.js';

test('reading error hints turn stable validation codes into calm UI copy',()=>{
 assert.match(readingErrorHint('invalid_synthesis_evidence'),/合读部分的牌义依据未通过核验/);
 assert.match(readingErrorHint('missing_synthesis_anchor'),/核心牌义依据/);
 assert.match(readingErrorHint('synthesis_support'),/合读部分没有得到证据支持/);
 assert.match(readingErrorHint('text_support'),/正文没有得到本局证据支持/);
 assert.match(readingErrorHint('coverage_boundary'),/应用证据不足/);
 assert.match(readingErrorHint('missing_goal_reference_coverage'),/预测或比较依据/);
 assert.match(readingErrorHint('action_goal_evidence'),/当前目标的应用证据/);
 assert.match(readingErrorHint('goal_alignment'),/建议、预测、解释或比较目标/);
 assert.match(readingErrorHint('followup_question'),/聚焦成一个具体问题/);
 assert.match(readingErrorHint('action_text_support'),/行动建议本身/);
 assert.match(readingErrorHint('card_reading_support'),/逐牌解释/);
 assert.match(readingErrorHint('overconfident_claim'),/绝对预测/);
 assert.match(readingErrorHint('timing_claim'),/观察窗口|现实核验/);
 assert.match(readingErrorHint('action_concreteness'),/可执行/);
 assert.match(readingErrorHint('action_reason'),/牌面相关的理由/);
 assert.match(readingErrorHint('action_reason_support'),/证据不匹配/);
 assert.match(readingErrorHint('followup_text_support'),/追问正文/);
 assert.match(readingErrorHint('missing_reality_boundary'),/现实资料或专业意见/);
 assert.match(readingErrorHint('open_goal_prediction'),/没有指定预测目标|核心牌面线索/);
 assert.match(readingErrorHint('provider_auth'),/密钥未通过验证/);
 assert.match(readingErrorHint('unknown_code'),/没有通过服务端核验/);
 assert.equal(readingGoalLabel('forecast'),'预测');
 assert.equal(readingGoalLabel('unknown'),'unknown');
 assert.equal(referenceSourceLabel('personal_memory'),'你的知识库');
 assert.equal(referenceSourceLabel('fixed_card_meaning'),'固定牌义');
 assert.equal(referenceSourceLabel(undefined,'personal'),'你的知识库');
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

test('the settings endpoint is derived from the reading endpoint',()=>{
 assert.equal(agentConfigEndpoint('/api/readings/interpret'),'/api/readings/config');
 assert.equal(agentConfigEndpoint('/custom/base/interpret'),'/custom/base/config');
 assert.equal(agentConfigEndpoint(undefined),'');
});

test('reading config reports unavailable instead of throwing when no agent answers',async()=>{
 assert.deepEqual(await readingConfig({endpoint:''}),{available:false});
 const original=globalThis.fetch;
 globalThis.fetch=async()=>{throw new TypeError('fetch failed');};
 try{assert.deepEqual(await readingConfig({endpoint:'/api/readings/config'}),{available:false});}
 finally{globalThis.fetch=original;}
});

test('reading config treats a 404 or 5xx agent as unavailable',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async()=>new Response('not found',{status:404});
  assert.deepEqual(await readingConfig({endpoint:'/api/readings/config'}),{available:false});
  globalThis.fetch=async()=>new Response('proxy error',{status:500});
  assert.deepEqual(await readingConfig({endpoint:'/api/readings/config'}),{available:false});
 }finally{globalThis.fetch=original;}
});

test('reading config surfaces the agent state without ever returning the key',async()=>{
 const original=globalThis.fetch;let seen=null;
 globalThis.fetch=async(url,init)=>{seen={url,init};return Response.json({configured:true,model:'deepseek-flash',source:'file',editable:true,restartRequired:false});};
 try{
  const config=await readingConfig({endpoint:'/api/readings/config'});
  assert.deepEqual(config,{available:true,configured:true,model:'deepseek-flash',source:'file',editable:true,restartRequired:false});
  assert.deepEqual(Object.keys(config).filter(k=>/key|secret|token/i.test(k)),[]);
  assert.equal(seen.url,'/api/readings/config');
  assert.equal(seen.init.method,'GET');
 }finally{globalThis.fetch=original;}
});

test('a refused host is reported as available with an explanation',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({error:'配置文件只接受本机地址访问。',code:'config_host_not_allowed'},{status:403});
 try{
  const config=await readingConfig({endpoint:'/api/readings/config'});
  assert.equal(config.available,true);
  assert.equal(config.configured,false);
  assert.equal(config.editable,false);
  assert.equal(config.code,'config_host_not_allowed');
 }finally{globalThis.fetch=original;}
});

test('saving sends only the provided fields and keeps the server message on failure',async()=>{
 const original=globalThis.fetch;const calls=[];
 globalThis.fetch=async(url,init)=>{calls.push({url,init});return Response.json({configured:true,model:'deepseek-flash',source:'file',editable:true,restartRequired:false});};
 try{
  const saved=await saveReadingConfig({apiKey:'sk-live-123'},{endpoint:'/api/readings/config'});
  assert.equal(saved.configured,true);
  assert.equal(calls[0].init.method,'POST');
  assert.equal(calls[0].init.headers['Content-Type'],'application/json');
  assert.deepEqual(JSON.parse(calls[0].init.body),{apiKey:'sk-live-123'});
 }finally{globalThis.fetch=original;}

 globalThis.fetch=async()=>Response.json({error:'当前密钥由启动时的环境变量提供。',code:'config_env_locked'},{status:409});
 try{
  await assert.rejects(saveReadingConfig({apiKey:'sk-live-123'},{endpoint:'/api/readings/config'}),error=>{
   assert.equal(error.message,'当前密钥由启动时的环境变量提供。');
   assert.equal(error.code,'config_env_locked');
   assert.equal(error.status,409);
   return true;
  });
 }finally{globalThis.fetch=original;}
});

test('clearing a key uses DELETE and reports the new state',async()=>{
 const original=globalThis.fetch;let method='';
 globalThis.fetch=async(url,init)=>{method=init.method;return Response.json({configured:false,model:'deepseek-flash',source:'none',editable:true,restartRequired:false});};
 try{
  const cleared=await clearReadingConfig({endpoint:'/api/readings/config'});
  assert.equal(method,'DELETE');
  assert.equal(cleared.configured,false);
  assert.equal(cleared.source,'none');
 }finally{globalThis.fetch=original;}
});
