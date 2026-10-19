import {useEffect,useRef,useState} from 'react';
import {ArrowDown,ArrowRight,CaretRight,Check,Info,PaperPlaneTilt,Warning} from '@phosphor-icons/react';
import {cardById} from './domain';
import {readingErrorHint,evidenceCoverageLabel,readingGoalLabel,referenceSourceLabel} from './services';
import {AgentKeyCard} from './AgentConfigCard';

const EVIDENCE_LABELS={orientation:'正逆位牌义',symbolism:'图像象征',relationships:'关系与情感',work:'事业与行动',reflection:'反思问题',waite:'Waite 原典',modern:'现代开放资料'};
function evidenceLabel(evidenceId){return EVIDENCE_LABELS[evidenceId?.split(':').pop()]||'固定牌义证据';}
function MemoryExcerptMarker({item}){return item?.memoryExcerpted?<span className="memory-excerpt-marker">记忆片段</span>:null;}
function EvidenceSummary({items,className=''}){
 if(!Array.isArray(items)||!items.length)return null;
 return <div className={`inline-evidence ${className}`}><span>依据</span>{items.map((item,index)=><span key={item.evidenceId||index} className={`evidence-source evidence-source-${item.sourceType||'other'}`}>{referenceSourceLabel(item.sourceType,item.tier)} <MemoryExcerptMarker item={item}/>{item.evidenceExcerpt?` · ${item.evidenceExcerpt}`:''}{index<items.length-1?'；':''}</span>)}</div>;
}
/** 统一的行式折叠：标题一行，展开后是内容体，抽屉与档案页共用。 */
export function TraceRow({title,open=false,tone='',children}){
 return <details className={`trace-row ${tone}`} open={open}><summary><CaretRight weight="fill"/><span>{title}</span></summary><div className="trace-row-body">{children}</div></details>;
}
function CardReadingRow({message}){
 const readings=Array.isArray(message?.cardReadings)?message.cardReadings:[];
 if(!readings.length)return null;
 return <TraceRow title={`逐牌解读 · ${readings.length} 张`}><div className="card-reading-list">{readings.map((reading,index)=><article key={`${reading.cardId}-${index}`}><header><b>{cardById[reading.cardId]?.name||reading.cardId}</b><span>{reading.position} · {reading.orientation||'方向已锁定'}</span></header><p>{reading.reading}</p>{reading.evidence?.length?<EvidenceSummary items={reading.evidence}/>:<small>依据 · {(reading.evidenceIds??[]).map(evidenceLabel).join('、')}</small>}</article>)}</div></TraceRow>;
}
function GoalSectionRow({message}){
 const sections=Array.isArray(message?.goalSections)?message.goalSections:[];
 if(!sections.length)return null;
 return <TraceRow title={`按目标拆解 · ${sections.length} 项`} open={sections.length>1}><div className="goal-section-list">{sections.map((section,index)=><article key={`${section.goal}-${index}`}><header><b>{readingGoalLabel(section.goal)}</b></header><p>{section.text}</p>{section.evidence?.length?<EvidenceSummary items={section.evidence}/>:<small>依据 · {(section.evidenceIds??[]).map(evidenceLabel).join('、')}</small>}</article>)}</div></TraceRow>;
}
function ReferencesRow({message}){
 const refs=Array.isArray(message?.references)?message.references:[];
 if(!refs.length)return null;
 return <TraceRow title={`查看依据 · ${refs.length} 条`}><div className="evidence-list">{refs.map((ref,j)=><div className="evidence-item" key={`${ref.evidenceId||ref.cardId}-${j}`}><b>{cardById[ref.cardId]?.name||ref.sourceLabel||'本局依据'} · {ref.position||'本局牌位'}</b><small><span className={`evidence-source evidence-source-${ref.sourceType||'other'}`}>来源 · {referenceSourceLabel(ref.sourceType,ref.tier)} <MemoryExcerptMarker item={ref}/></span>{ref.sourceLabel?` · ${ref.sourceLabel}`:ref.sourceType?` · ${evidenceLabel(ref.evidenceId)}`:''}{ref.tier?` · ${ref.tier}`:''}{ref.claim?` · ${ref.claim}`:''}{ref.url&&<a href={ref.url} target="_blank" rel="noreferrer">查看来源 ↗</a>}</small>{ref.evidenceExcerpt&&<blockquote className="evidence-excerpt">“{ref.evidenceExcerpt}”</blockquote>}</div>)}</div></TraceRow>;
}
/** 解读谱系：按目标折叠，档案页与对话流共用同一份标记。 */
export function ReadingTrace({message}){
 const knowledge=message?.knowledgeMeta,routing=message?.retrievalMeta,budget=message?.promptBudget,evidence=message?.evidenceMeta,evidencePlan=message?.evidencePlan,safety=message?.safetyMeta;
 if(!knowledge&&!routing&&!budget&&!evidence&&!safety)return null;
 const themes=Array.isArray(routing?.themes)&&routing.themes.length?routing.themes.join(' · '):'未识别主题';
 const goals=Array.isArray(routing?.goals)&&routing.goals.length?routing.goals.map(readingGoalLabel).join(' · '):'开放目标';
 const confidence={focused:'聚焦',mixed:'混合',open:'开放'}[routing?.confidence]||'待核验';
 const plannedCards=Array.isArray(evidencePlan?.perCard)&&evidencePlan.perCard.length?evidencePlan.perCard.map(item=>`${cardById[item.cardId]?.name||item.cardId} · ${item.anchorEvidenceIds?.length??0} 核心`).join('；'):'未生成';
 const boundary=safety?.requiresProfessionalBoundary?'高风险 · 需要现实核验':safety?.requiresPerspectiveBoundary?'内心不可验证 · 需要现实互动':'常规现实边界',memoryState=message?.memoryMeta?.enabled?'本局已启用':'本局未启用';
 return <TraceRow title={`解读谱系 · ${knowledge?.ragVersion||'本地规则'}`}><div className="trace-grid"><span>主题</span><b>{themes}</b><span>回答目标</span><b>{goals}</b><span>路由置信</span><b>{confidence}</b><span>证据覆盖</span><b>{evidence?.coverageStatus?evidenceCoverageLabel(evidence.coverageStatus):'待核验'} · {budget?.evidenceItems??0} 条</b><span>证据规划</span><b>{plannedCards}</b><span>记忆上下文</span><b>{memoryState} · {budget?.memoryItems??0} 条 · {budget?.memoryExcerptedItems??0} 条为片段</b><span>Prompt 版本</span><b>{knowledge?.promptVersion||'本地规则'}</b><span>现实边界</span><b>{boundary}</b></div></TraceRow>;
}
/** 一条助手回复：步骤行（检索→路由→覆盖）在正文前，元数据折叠行在正文后。 */
function AssistantTurn({m,index,onFeedback,onToast,onRetry,onPreset}){
 const steps=[];
 if(m.promptBudget?.evidenceItems)steps.push(`检索证据 · ${m.promptBudget.evidenceItems} 条`);
 const goals=Array.isArray(m.retrievalMeta?.goals)&&m.retrievalMeta.goals.length?m.retrievalMeta.goals.map(readingGoalLabel).join(' / '):(m.retrievalMeta?'开放目标':'');
 if(goals)steps.push(`回答目标 · ${goals}`);
 if(m.evidenceMeta?.coverageStatus)steps.push(`证据覆盖 · ${evidenceCoverageLabel(m.evidenceMeta.coverageStatus)}`);
 const limited=Array.isArray(m.evidenceMeta?.missingGoalCoverage)&&m.evidenceMeta.missingGoalCoverage.length>0;
 async function copy(){try{await navigator.clipboard.writeText(m.text);onToast('已复制这段解读。');}catch{onToast('复制失败，请手动选择文本复制。');}}
 return <div className="turn">
  <span className="turn-avatar" aria-hidden="true">N</span>
  <div className="turn-body">
   <span className="turn-name"><b>NYX · 守夜人</b>{m.model?` · ${m.model}`:''}{m.source==='demo'?' · 本地示例':''}</span>
   {(steps.length>0||limited)&&<div className="step-rows">
    {steps.map((step,i)=><span className="step-row" key={i}><Check size={11} weight="bold"/>{step}</span>)}
    {limited&&<span className="step-row warning"><Warning size={11} weight="bold"/>目标依据有限 · {m.evidenceMeta.missingGoalCoverage.map(readingGoalLabel).join('、')}</span>}
   </div>}
   <p className="turn-text">{m.text}</p>
   <GoalSectionRow message={m}/>
   <CardReadingRow message={m}/>
   {m.synthesis?.text&&<div className="message-synthesis"><span>合读牌势</span><p>{m.synthesis.text}</p><EvidenceSummary items={m.synthesis.evidence} className="synthesis-evidence"/></div>}
   {m.needsClarification&&m.clarification&&<div className="message-clarification"><span>先确认一件事</span><b>{m.clarification}</b><button type="button" onClick={()=>onPreset(m.clarification)}>回答这个问题 <ArrowRight/></button></div>}
   {m.actions?.length>0&&<div className="message-actions"><span>可以先做</span><ol>{m.actions.map((action,j)=><li key={j}><b>{action.text}</b>{action.reason&&<small>{action.reason}</small>}{action.evidence?.length>0&&<small className="action-evidence">依据 · {action.evidence.map((item,k)=><span key={item.evidenceId||k} className={`evidence-source evidence-source-${item.sourceType||'other'}`}>{referenceSourceLabel(item.sourceType,item.tier)} <MemoryExcerptMarker item={item}/>{item.evidenceExcerpt?` · ${item.evidenceExcerpt}`:''}{k<action.evidence.length-1?'；':''}</span>)}</small>}</li>)}</ol></div>}
   <ReferencesRow message={m}/>
   <ReadingTrace message={m}/>
   {m.uncertainty&&<p className="message-uncertainty"><Info/> 解读边界：{m.uncertainty}</p>}
   {m.followUp&&<button type="button" className="message-followup" onClick={()=>onPreset(m.followUp)}>继续问：{m.followUp}<ArrowRight/></button>}
   <div className="turn-toolbar">
    <button type="button" onClick={copy}>复制</button>
    <button type="button" onClick={onRetry}>重新解读</button>
    <button type="button" className={m.feedback==='helpful'?'selected':''} aria-pressed={m.feedback==='helpful'} onClick={()=>onFeedback(index,'helpful')}>有帮助</button>
    <button type="button" className={m.feedback==='review'?'selected':''} aria-pressed={m.feedback==='review'} onClick={()=>onFeedback(index,'review')}>需要复核</button>
    <small>反馈仅保存在当前浏览器</small>
   </div>
  </div>
 </div>;
}
/** 底部输入框：Enter 发送（避开中文输入法组词），Shift+Enter 换行，随内容增高。 */
function Composer({input,setInput,onSubmit,busy,session,onToggleMemory}){
 const taRef=useRef(null);
 useEffect(()=>{const el=taRef.current;if(!el)return;el.style.height='auto';el.style.height=`${Math.min(el.scrollHeight,120)}px`;},[input]);
 function onKeyDown(event){
  if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();onSubmit(event);}
 }
 return <div className="chat-composer">
  <form onSubmit={onSubmit}>
   <textarea ref={taRef} rows={1} aria-label="和女巫对话" placeholder={session?.messages.length?'继续聊聊这次牌局…':'牌已翻开，想先从哪里说起？'} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={onKeyDown} disabled={busy}/>
   <button className="chat-send" type="submit" aria-label="发送问题" disabled={busy||!input.trim()}><PaperPlaneTilt/></button>
  </form>
  <div className="chat-composer-meta">
   <span>Enter 发送 · Shift+Enter 换行</span>
   <button type="button" className={session?.usePersonalMemory?'on':''} onClick={onToggleMemory} disabled={busy}>本局使用知识库 · {session?.usePersonalMemory?'开':'关'}</button>
  </div>
  <p className="chat-disclaimer">解读用于自我反思 · 重要决定请咨询专业意见</p>
 </div>;
}
/** 对话抽屉的主体：徽标与密钥卡在最上，时间线居中滚动，输入框固定在底部。 */
export function ConversationThread({session,busy,error,errorCode,agentConfig,keyCard,setKeyCard,onKeySaved,input,setInput,onSubmit,onFeedback,onRetry,onToast,onPreset,onToggleMemory,motion}){
 const threadRef=useRef(null),endRef=useRef(null);
 const [atBottom,setAtBottom]=useState(true);
 const messages=session?.messages??[];
 useEffect(()=>{if(!messages.length||!atBottom)return;endRef.current?.scrollIntoView({block:'end',behavior:motion?'smooth':'instant'});},[messages.length,busy,atBottom,motion]);
 function onScroll(){const el=threadRef.current;if(!el)return;setAtBottom(el.scrollHeight-el.scrollTop-el.clientHeight<90);}
 function jump(){endRef.current?.scrollIntoView({block:'end',behavior:motion?'smooth':'instant'});}
 return <>
  <div className="chat-thread-wrap">
   <div className="chat-thread" ref={threadRef} onScroll={onScroll}>
    <div className="reading-badge"><Info/> {!import.meta.env.VITE_READING_ENDPOINT?'本地牌义示例 · AI 接口尚未连接':agentConfig.available&&!agentConfig.configured?'尚未配置 DeepSeek 密钥 · 在下方填入即可解读':'DeepSeek · AI 对话解读'}</div>
    {agentConfig.available&&(!agentConfig.configured||keyCard)&&<AgentKeyCard config={agentConfig} onSaved={onKeySaved} onDismiss={()=>setKeyCard(false)}/>}
    {messages.length===0&&!busy&&<p className="chat-empty">牌已经翻开。可以从任意一张问起，也可以直接聊聊整体——比如「这三张牌合起来在说什么？」</p>}
    {messages.map((m,i)=>m.role==='user'
     ?<div className="turn-user" key={i}><p>{m.text}</p></div>
     :<AssistantTurn key={i} m={m} index={i} onFeedback={onFeedback} onToast={onToast} onRetry={onRetry} onPreset={onPreset}/>)}
    {busy&&<div className="turn"><span className="turn-avatar" aria-hidden="true">N</span><div className="turn-body"><p className="chat-status"><span>正在检索牌义证据…</span></p></div></div>}
    {error&&<div role="alert" className="error"><p>{error}</p>{errorCode&&<small className="error-hint">{readingErrorHint(errorCode)}</small>}{agentConfig.available&&['provider_not_configured','provider_auth'].includes(errorCode)&&<button className="text-button" onClick={()=>setKeyCard(true)}>配置密钥 <ArrowRight/></button>}<button className="text-button" onClick={onRetry}>保留原牌重试 <ArrowRight/></button></div>}
    <div ref={endRef}/>
   </div>
   {!atBottom&&<button className="chat-jump" type="button" aria-label="回到最新消息" onClick={jump}><ArrowDown/></button>}
  </div>
  <Composer input={input} setInput={setInput} onSubmit={onSubmit} busy={busy} session={session} onToggleMemory={onToggleMemory}/>
 </>;
}
