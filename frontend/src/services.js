import {cardById} from './domain.js';
import {witchClips} from './witch-animation.js';
const env=import.meta.env??{};
const READING_FALLBACK_ERROR='解读服务暂时未连接。牌面已保留，请稍后重试。';
const READING_ERROR_HINTS={
 missing_uncertainty:'首轮回答缺少解读边界，正在保护你的判断空间。',
 missing_reality_boundary:'高风险问题需要现实资料或专业意见核验，原牌局仍然保留。',
 missing_reference_coverage:'回答没有覆盖全部牌面，原牌局仍然保留。',
 missing_reference_anchor:'回答没有为每张牌绑定核心牌义，原牌局仍然保留。',
 invalid_synthesis_evidence:'合读部分的牌义依据未通过核验，原牌局仍然保留。',
 missing_synthesis_anchor:'合读部分缺少每张牌的核心牌义依据，原牌局仍然保留。',
 synthesis_support:'合读部分没有得到证据支持，原牌局仍然保留。',
 missing_card_readings:'回答没有逐张解释牌面，原牌局仍然保留。',
 missing_card_anchor:'某张牌的逐牌解释缺少核心牌义依据，原牌局仍然保留。',
 card_reading_support:'某张牌的逐牌解释没有得到对应证据支持，原牌局仍然保留。',
 overconfident_claim:'回答包含牌面无法确认的绝对预测，原牌局仍然保留。',
 action_concreteness:'行动建议不够可执行，请稍后重试原牌局。',
 action_reason:'行动建议缺少与牌面相关的理由，原牌局仍然保留。',
 action_reason_support:'行动理由与引用的牌面证据不匹配，原牌局仍然保留。',
 missing_actions:'回答没有给出可验证的下一步，原牌局仍然保留。',
 invalid_response:'服务返回格式不完整，原牌局仍然保留。',
 provider_not_configured:'本机后端还没有配置 DeepSeek 密钥，请先完成后端配置。',
 provider_auth:'DeepSeek 密钥未通过验证，请检查后端配置。',
 provider_balance:'DeepSeek 账户余额不足，请充值后重试。',
 provider_busy:'DeepSeek 当前繁忙，请稍后重试。',
 provider_empty:'DeepSeek 没有返回有效内容，可以保留原牌重试。',
 provider_timeout:'解读等待超时，原牌局仍然保留，可以稍后重试。',
 provider_unavailable:'暂时无法连接 DeepSeek，原牌局仍然保留。',
 rate_limited:'请求较频繁，请稍等片刻再试。'
};

export function readingErrorHint(code){
 return READING_ERROR_HINTS[code]||'这次解读没有通过服务端核验，原牌局仍然保留。';
}
const COVERAGE_LABELS={complete:'完整覆盖牌面与当前主题',anchor_only:'以核心牌义为主，应用语义较少',incomplete:'核心牌义证据不完整'};
export function evidenceCoverageLabel(status){
 return COVERAGE_LABELS[status]||'覆盖情况待核验';
}

/** Parse the private reading endpoint without leaking raw upstream bodies. */
export async function parseReadingResponse(response){
 const raw=await response.json().catch(()=>null);
 const data=raw&&typeof raw==='object'?raw:{};
 if(!response.ok){
  const error=new Error(typeof data.error==='string'&&data.error?data.error:READING_FALLBACK_ERROR);
  if(typeof data.code==='string'&&/^[a-z0-9_]{1,64}$/.test(data.code))error.code=data.code;
  error.status=response.status;
  throw error;
 }
 if(typeof data.text!=='string'){
  const error=new Error('解读服务返回格式不正确。');
  error.code='invalid_response';
  error.status=response.status;
  throw error;
 }
 return data;
}
/** Replace this adapter with a server endpoint; never put provider secrets in Vite env.
 * POST /api/readings/interpret {sessionId, question, deckVersion, spread?, cards, messages, memories?}
 * -> {text, source:'ai', needsClarification?, clarification?, cardReadings?, synthesis?:{text, evidenceIds}, actions?, references:[{evidenceId, cardId, position, claim, kind, tier, source, sourceLabel, retrievalReasons}], followUp?, uncertainty?}
 */
export async function interpret({sessionId,question,spread,cards,messages=[],memories=[],signal}){
 const endpoint=env.VITE_READING_ENDPOINT;
 if(endpoint){
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId,question,spread,cards,messages,memories,deckVersion:'rws-1909-v1'}),signal});
  return parseReadingResponse(response);
 }
 await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,900);signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));},{once:true});});
 const intro=messages.length?'这次追问沿用刚才的牌局，不重新抽牌。以下仍是本地牌义示例，尚未接入理解自由对话的 AI。':'先把牌当成一面镜子，看看哪些主题与你的现实相符。以下为本地牌义示例，尚未接入 AI。';
 return {source:'demo',text:`${intro}\n\n${cards.map((draw,i)=>{const c=cardById[draw.id];return `${i+1}. ${draw.position} · ${c.name}（${draw.reversed?'逆位':'正位'}）\n${draw.reversed?c.reversed:c.upright}\n反思：关于「${question}」，有哪些已经发生的事实支持或不支持这一主题？`;}).join('\n\n')}\n\n可以采取的下一步\n写下一项你能验证的事实、一项你可以控制的小行动，以及一个复盘日期。未来趋势不是确定结果，他人的感受需要通过现实沟通确认。`};
}
export const witchModelConfig={url:env.VITE_WITCH_MODEL_URL||'/models/witch-v2.glb?v=2',clips:witchClips};
