import {cardById} from './domain.js';
import {witchClips} from './witch-animation.js';
/** Replace this adapter with a server endpoint; never put provider secrets in Vite env.
 * POST /api/readings/interpret {sessionId, question, deckVersion, spread?, cards, messages, memories?}
 * -> {text, source:'ai', needsClarification?, clarification?, cardReadings?, synthesis?:{text, evidenceIds}, actions?, references:[{evidenceId, cardId, position, claim, kind, tier, source, sourceLabel, retrievalReasons}], followUp?, uncertainty?}
 */
export async function interpret({sessionId,question,spread,cards,messages=[],memories=[],signal}){
 const endpoint=import.meta.env.VITE_READING_ENDPOINT;
 if(endpoint){
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId,question,spread,cards,messages,memories,deckVersion:'rws-1909-v1'}),signal});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(data.error||'解读服务暂时未连接。牌面已保留，请稍后重试。');}
  const data=await response.json();if(typeof data.text!=='string')throw Error('解读服务返回格式不正确。');return data;
 }
 await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,900);signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));},{once:true});});
 const intro=messages.length?'这次追问沿用刚才的牌局，不重新抽牌。以下仍是本地牌义示例，尚未接入理解自由对话的 AI。':'先把牌当成一面镜子，看看哪些主题与你的现实相符。以下为本地牌义示例，尚未接入 AI。';
 return {source:'demo',text:`${intro}\n\n${cards.map((draw,i)=>{const c=cardById[draw.id];return `${i+1}. ${draw.position} · ${c.name}（${draw.reversed?'逆位':'正位'}）\n${draw.reversed?c.reversed:c.upright}\n反思：关于「${question}」，有哪些已经发生的事实支持或不支持这一主题？`;}).join('\n\n')}\n\n可以采取的下一步\n写下一项你能验证的事实、一项你可以控制的小行动，以及一个复盘日期。未来趋势不是确定结果，他人的感受需要通过现实沟通确认。`};
}
export const witchModelConfig={url:import.meta.env.VITE_WITCH_MODEL_URL||'/models/witch-v2.glb?v=2',clips:witchClips};
