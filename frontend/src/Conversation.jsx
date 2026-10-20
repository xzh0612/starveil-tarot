import {useEffect,useRef,useState} from 'react';
import {ArrowDown,ArrowRight,CaretDown,CaretLeft,CaretRight,Cards,Check,ClockCounterClockwise,Info,Microphone,MicrophoneSlash,PaperPlaneTilt,Warning} from '@phosphor-icons/react';
import {cardById,chosenCards,load,save} from './domain';
import {readingErrorHint,evidenceCoverageLabel,readingGoalLabel,referenceSourceLabel,saveReadingConfig} from './services';
import {formatRelativeTime,mergeTranscript} from './chat-utils';
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
/** 模型快速切换：只改 DEEPSEEK_MODEL，保存后对运行中的服务热生效。 */
function ModelMenu({config,onChanged,onToast}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false);
 if(!config?.available)return null;
 const current=config.model||'deepseek-flash';
 const known=[
  {id:'deepseek-flash',label:'DeepSeek Flash',desc:'更快 · 日常解读'},
  {id:'deepseek-chat',label:'DeepSeek Chat',desc:'更稳 · 长文与推理'},
 ];
 const options=known.some(option=>option.id===current)?known:[...known,{id:current,label:current,desc:'当前配置的模型'}];
 const locked=config.editable===false;
 async function pick(id){
  if(id===current){setOpen(false);return;}
  setBusy(true);
  try{
   const next=await saveReadingConfig({model:id});
   onChanged?.(next);
   onToast?.(`已切换到 ${id}。`);
  }catch(error){
   onToast?.(error?.message||'模型切换失败。');
  }finally{
   setBusy(false);setOpen(false);
  }
 }
 return <div className="chat-model">
  <button type="button" className="chat-model-trigger" onClick={()=>setOpen(value=>!value)} aria-haspopup="listbox" aria-expanded={open} disabled={busy||locked} title={locked?'模型由启动环境变量指定':`当前模型 ${current}`}>
   <span>{busy?'切换中…':`模型 · ${current}`}</span><CaretDown/>
  </button>
  {open&&<>
   <div className="chat-model-backdrop" onClick={()=>setOpen(false)}/>
   <div className="chat-model-menu" role="listbox" aria-label="选择解读模型">
    {options.map(option=><button type="button" key={option.id} role="option" aria-selected={option.id===current} className={option.id===current?'active':''} onClick={()=>pick(option.id)}><span><b>{option.label}</b><small>{option.desc}</small></span>{option.id===current&&<Check size={12} weight="bold"/>}</button>)}
    {locked&&<p className="chat-model-locked">由启动环境变量指定，界面不可改</p>}
   </div>
  </>}
 </div>;
}

/** 语音输入：使用浏览器 Web Speech API（Chrome / Edge 可用），识别结果接在已有文字后面。 */
function useVoiceInput({input,setInput,onToast,disabled}){
 const [listening,setListening]=useState(false);
 const recRef=useRef(null),baseRef=useRef('');
 const supported=typeof window!=='undefined'&&!!(window.SpeechRecognition||window.webkitSpeechRecognition);
 useEffect(()=>()=>{try{recRef.current?.abort();}catch{/* 页面卸载时忽略 */}},[]);
 function stop(){try{recRef.current?.stop();}catch{/* 已经结束 */}}
 function start(){
  if(disabled||listening)return;
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  let rec;
  try{rec=new Recognition();}catch{onToast?.('当前浏览器无法启动语音识别。');return;}
  rec.lang='zh-CN';rec.interimResults=true;rec.continuous=false;
  baseRef.current=input||'';
  rec.onresult=event=>{
   let finalText='',interim='';
   for(let i=event.resultIndex;i<event.results.length;i++){
    const result=event.results[i];
    if(result.isFinal)finalText+=result[0].transcript;
    else interim+=result[0].transcript;
   }
   setInput(mergeTranscript(baseRef.current,finalText)+interim);
  };
  rec.onerror=event=>{
   setListening(false);
   if(event.error==='not-allowed'||event.error==='service-not-allowed')onToast?.('没有麦克风权限，请在地址栏允许后重试。');
   else if(event.error!=='aborted')onToast?.('语音识别暂时不可用，请改用键盘输入。');
  };
  rec.onend=()=>{setListening(false);recRef.current=null;};
  recRef.current=rec;setListening(true);
  try{rec.start();}catch{setListening(false);onToast?.('语音识别启动失败，请重试。');}
 }
 return {supported,listening,start,stop};
}

/** 全屏左右栏的收起状态：记住上次选择，下次进来保持原样。 */
const RAIL_KEY='chatRails';
function loadRails(){const saved=load(RAIL_KEY,{});return {left:saved?.left===true,right:saved?.right===true};}
function saveRails(next){try{save(RAIL_KEY,next);}catch{/* 存储不可用时不影响使用 */}}

/** 全屏左栏：历史对话列表，点击直接切回那一次对话。 */
function HistorySidebar({history=[],currentId,onSelect,collapsed=false,onToggle}){
 const saved=Array.isArray(history)?history:[];
 const currentIsSaved=!!currentId&&saved.some(item=>item.id===currentId);
 if(collapsed)return <aside className="chat-history collapsed">
  <button type="button" className="chat-rail-expand" onClick={onToggle} title="展开历史对话" aria-label="展开历史对话" aria-expanded="false"><ClockCounterClockwise/><span>历史对话</span>{saved.length>0&&<small>{saved.length}</small>}</button>
 </aside>;
 return <aside className="chat-history">
  <header>
   <span className="chat-rail-title"><ClockCounterClockwise/> 历史对话</span>
   <span className="chat-rail-head-right"><small>{saved.length?`${saved.length} 条`:'空'}</small><button type="button" className="chat-rail-toggle" onClick={onToggle} title="收起历史对话" aria-label="收起历史对话" aria-expanded="true"><CaretLeft/></button></span>
  </header>
  <div className="chat-history-list">
   {currentId&&!currentIsSaved&&<div className="chat-history-item active current" aria-current="true"><b>当前对话</b><span>进行中</span></div>}
   {saved.length===0&&!currentId&&<p className="chat-rail-empty">保存过的对话会出现在这里。</p>}
   {saved.map(item=><button type="button" key={item.id} className={`chat-history-item ${item.id===currentId?'active':''}`} onClick={()=>onSelect?.(item)}><b>{item.question||'未命名对话'}</b><span>{[item.spread?.name,formatRelativeTime(item.date)].filter(Boolean).join(' · ')}</span>{Array.isArray(item.messages)&&item.messages.length?<small>{item.messages.length} 条消息</small>:null}</button>)}
  </div>
 </aside>;
}

/** 全屏右栏：本局抽到的牌，随会话切换而更新。 */
function CardsPanel({session,collapsed=false,onToggle}){
 const draws=session?chosenCards(session):[];
 const spread=session?.spread;
 if(collapsed)return <aside className="chat-cards collapsed">
  <button type="button" className="chat-rail-expand" onClick={onToggle} title="展开本局牌面" aria-label="展开本局牌面" aria-expanded="false"><Cards/><span>本局牌面</span>{draws.length>0&&<small>{draws.length}</small>}</button>
 </aside>;
 return <aside className="chat-cards">
  <header>
   <span className="chat-rail-title"><Cards/> 本局牌面</span>
   <span className="chat-rail-head-right"><small>{spread?.positions?.length?`${spread.positions.length} 张`:''}</small><button type="button" className="chat-rail-toggle" onClick={onToggle} title="收起本局牌面" aria-label="收起本局牌面" aria-expanded="true"><CaretRight/></button></span>
  </header>
  {session?.question&&<p className="chat-cards-question">{session.question}</p>}
  <div className="chat-cards-list">
   {draws.length===0&&<p className="chat-rail-empty">这一局还没有抽牌。</p>}
   {draws.map((draw,index)=>{
    const card=cardById[draw.id];
    return <article className="chat-card-item" key={`${draw.id}-${index}`}>
     <div className="chat-card-thumb"><img src={card?.image} alt={card?.name||''} className={draw.reversed?'reversed':''}/></div>
     <div className="chat-card-meta"><b>{card?.name||draw.id}</b><span>{draw.position}</span><small>{draw.reversed?'逆位':'正位'}{card?.key?` · ${card.key}`:''}</small></div>
    </article>;
   })}
  </div>
 </aside>;
}
/** 底部输入区：Enter 发送（避开中文输入法组词），Shift+Enter 换行，随内容增高。
 *  结构对齐 WorkBuddy：错误横幅贴在输入容器上方共享边线，容器内是编辑区 + 工具行。 */
function Composer({input,setInput,onSubmit,busy,session,onToggleMemory,error,errorCode,agentConfig,setKeyCard,onRetry,onModelChanged,onToast}){
 const taRef=useRef(null);
 const voice=useVoiceInput({input,setInput,onToast,disabled:busy});
 useEffect(()=>{const el=taRef.current;if(!el)return;el.style.height='auto';el.style.height=`${Math.min(el.scrollHeight,120)}px`;},[input]);
 function onKeyDown(event){
  if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();onSubmit(event);}
 }
 return <div className="chat-composer">
  {error&&<div className="chat-banner" role="alert"><Warning/><div><p>{error}</p>{errorCode&&<small className="error-hint">{readingErrorHint(errorCode)}</small>}<div className="chat-banner-actions">{agentConfig?.available&&['provider_not_configured','provider_auth'].includes(errorCode)&&<button className="text-button" onClick={()=>setKeyCard(true)}>配置密钥 <ArrowRight/></button>}<button className="text-button" onClick={onRetry}>保留原牌重试 <ArrowRight/></button></div></div></div>}
  <form className="chat-input-container" onSubmit={onSubmit}>
   <textarea ref={taRef} rows={1} aria-label="和女巫对话" placeholder={voice.listening?'正在听你说…':session?.messages.length?'继续聊聊这次牌局…':'牌已翻开，想先从哪里说起？'} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={onKeyDown} disabled={busy}/>
   <div className="chat-input-toolbar">
    <div className="chat-input-tools">
     <span className="chat-input-hint">{voice.listening?'正在聆听 · 再点一次结束':`Enter 发送 · Shift+Enter 换行`}</span>
     <button type="button" className={session?.usePersonalMemory?'on':''} onClick={onToggleMemory} disabled={busy}>本局知识库 · {session?.usePersonalMemory?'开':'关'}</button>
     <ModelMenu config={agentConfig} onChanged={onModelChanged} onToast={onToast}/>
    </div>
    <div className="chat-input-actions">
     {voice.supported&&<button type="button" className={`chat-mic ${voice.listening?'listening':''}`} aria-label={voice.listening?'停止语音输入':'语音输入'} aria-pressed={voice.listening} title={voice.listening?'停止语音输入':'语音输入'} onClick={()=>voice.listening?voice.stop():voice.start()} disabled={busy}>{voice.listening?<MicrophoneSlash/>:<Microphone/>}</button>}
     <button className="chat-send" type="submit" aria-label="发送问题" disabled={busy||!input.trim()}><PaperPlaneTilt/></button>
    </div>
   </div>
  </form>
  <p className="chat-disclaimer">解读用于自我反思 · 重要决定请咨询专业意见</p>
 </div>;
}
/** 对话抽屉的主体：徽标与密钥卡在最上，时间线居中滚动，输入框固定在底部。
 *  full=true 时改为三栏：历史对话 / 聊天 / 本局牌面。 */
export function ConversationThread({session,busy,error,errorCode,agentConfig,keyCard,setKeyCard,onKeySaved,input,setInput,onSubmit,onFeedback,onRetry,onToast,onPreset,onToggleMemory,motion,full=false,history=[],onSelectHistory,onModelChanged}){
 const threadRef=useRef(null),endRef=useRef(null);
 const [atBottom,setAtBottom]=useState(true);
 const [rails,setRails]=useState(loadRails);
 useEffect(()=>{saveRails(rails);},[rails]);
 const toggleRail=side=>setRails(current=>({...current,[side]:!current[side]}));
 const messages=session?.messages??[];
 useEffect(()=>{if(!messages.length||!atBottom)return;endRef.current?.scrollIntoView({block:'end',behavior:motion?'smooth':'instant'});},[messages.length,busy,atBottom,motion]);
 function onScroll(){const el=threadRef.current;if(!el)return;setAtBottom(el.scrollHeight-el.scrollTop-el.clientHeight<90);}
 function jump(){endRef.current?.scrollIntoView({block:'end',behavior:motion?'smooth':'instant'});}
 const main= <>
  <div className="chat-thread-wrap">
   <div className="chat-thread" ref={threadRef} onScroll={onScroll}>
    <div className="reading-badge"><Info/> {!import.meta.env.VITE_READING_ENDPOINT?'本地牌义示例 · AI 接口尚未连接':agentConfig.available&&!agentConfig.configured?'尚未配置 DeepSeek 密钥 · 在下方填入即可解读':'DeepSeek · AI 对话解读'}</div>
    {agentConfig.available&&(!agentConfig.configured||keyCard)&&<AgentKeyCard config={agentConfig} onSaved={onKeySaved} onDismiss={()=>setKeyCard(false)}/>}
    {messages.length===0&&!busy&&<p className="chat-empty">牌已经翻开。可以从任意一张问起，也可以直接聊聊整体——比如「这三张牌合起来在说什么？」</p>}
    {messages.map((m,i)=>m.role==='user'
     ?<div className="turn-user" key={i}><p>{m.text}</p></div>
     :<AssistantTurn key={i} m={m} index={i} onFeedback={onFeedback} onToast={onToast} onRetry={onRetry} onPreset={onPreset}/>)}
    {busy&&<div className="turn"><span className="turn-avatar" aria-hidden="true">N</span><div className="turn-body"><p className="chat-status"><span>正在检索牌义证据…</span></p></div></div>}
    <div ref={endRef}/>
   </div>
   {!atBottom&&<button className="chat-jump" type="button" aria-label="回到最新消息" onClick={jump}><ArrowDown/></button>}
  </div>
  <Composer input={input} setInput={setInput} onSubmit={onSubmit} busy={busy} session={session} onToggleMemory={onToggleMemory} error={error} errorCode={errorCode} agentConfig={agentConfig} setKeyCard={setKeyCard} onRetry={onRetry} onModelChanged={onModelChanged} onToast={onToast}/>
 </>;
 if(!full)return main;
 return <div className={`chat-full ${rails.left?'left-collapsed':''} ${rails.right?'right-collapsed':''}`}>
  <HistorySidebar history={history} currentId={session?.id} onSelect={onSelectHistory} collapsed={rails.left} onToggle={()=>toggleRail('left')}/>
  <div className="chat-main">{main}</div>
  <CardsPanel session={session} collapsed={rails.right} onToggle={()=>toggleRail('right')}/>
 </div>;
}
