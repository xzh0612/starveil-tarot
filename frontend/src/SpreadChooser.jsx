import {useEffect,useState} from 'react';
import {spreads} from './domain';
import {recommendLocalSpreads} from './spread-recommendation';
import './spread-chooser.css';

export function SpreadChooser({question,onQuestionChange,onConfirm}){
 const [result,setResult]=useState(null),[pending,setPending]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[retry,setRetry]=useState(0),[all,setAll]=useState(false),[selected,setSelected]=useState(null),[custom,setCustom]=useState(['现状','阻碍','建议']);
 const query=question.trim();
 useEffect(()=>{
  setSelected(null);setResult(null);setError('');setNotice('');setPending(!!query);if(!query)return;
  let live=true;const controller=new AbortController();
  const timer=setTimeout(async()=>{try{
   const response=await fetch('/api/spreads/recommend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:query}),signal:controller.signal});
   const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||'暂时无法推荐牌阵，请重试或自行选择。');
   if(!Array.isArray(data.recommendations)||data.recommendations.length<2||data.recommendations.some(r=>!spreads.some(s=>s.id===r.id)||typeof r.reason!=='string'))throw Error('推荐内容暂时不可用，请重试。');
   if(live)setResult({question:query,items:data.recommendations,source:'ai'});
  }catch(e){if(live&&e.name!=='AbortError'){setResult({question:query,items:recommendLocalSpreads(query),source:'local'});setNotice('在线推荐暂不可用，已切换到本地推荐。');}}finally{if(live)setPending(false);}},650);
  return()=>{live=false;clearTimeout(timer);controller.abort();};
 },[query,retry]);
 const change=value=>{if(value.trim()!==query){setSelected(null);setResult(null);setError('');setNotice('');}onQuestionChange(value);};
 const items=result?.question===query?result.items:[];
 const option=(spread,reason,index)=> <button type="button" key={spread.id} aria-pressed={selected?.id===spread.id} className={`spread-option ${selected?.id===spread.id?'selected':''}`} onClick={()=>setSelected(spread)}><span className="spread-number">{String(spread.positions.length).padStart(2,'0')}</span><div>{reason&&<span className="recommend-label">{index===0?'优先推荐':'另一种观察角度'}</span>}<h3>{spread.name}</h3><p>{reason||spread.description}</p><small className="spread-positions">{spread.positions.join(' · ')}</small></div><span className="spread-radio" aria-hidden="true">{selected?.id===spread.id?'✓':''}</span></button>;
 return <div className="spread-chooser">
  <label className="field">你想探索的问题<textarea rows={2} value={question} onChange={e=>change(e.target.value)} placeholder="先说说你的问题，我会推荐适合的牌阵。" maxLength={500}/></label>
  {!query&&<p className="recommend-empty">写下问题后，我会推荐几个不同角度的牌阵，再由你选择。</p>}
  {pending&&<div className="recommend-loading" role="status"><span/>正在为这个问题挑选牌阵…<small>你也可以直接查看全部牌阵。</small></div>}
  {error&&<div className="error" role="alert">{error}<button className="text-button" onClick={()=>setRetry(n=>n+1)}>重新推荐 →</button></div>}
  {notice&&<p className="recommend-notice" role="status">{notice}</p>}
  {items.length>0&&<section aria-label="为你的问题推荐的牌阵"><div className="recommend-heading"><span className="eyebrow">为这个问题，推荐 {items.length} 个牌阵</span><small>{result?.source==='local'?'本地规则 · 结果稳定可复现':'先选一个，再开始抽牌'}</small></div><div className="recommended-spreads">{items.map((r,i)=>option(spreads.find(s=>s.id===r.id),r.reason,i))}</div></section>}
  <button className="text-button all-spreads-toggle" aria-expanded={all} onClick={()=>setAll(v=>!v)}>{all?'收起全部牌阵 ↑':'我想自己选 · 查看全部牌阵 →'}</button>
  {all&&<section aria-label="全部牌阵"><div className="spread-grid">{spreads.map(s=>option(s))}</div><details className="custom-spread"><summary>自定义牌阵 · 最多 12 张</summary><div className="custom-fields">{custom.map((p,i)=><label key={i}>{i+1}<input aria-label={`自定义牌位 ${i+1}`} value={p} maxLength={80} onChange={e=>{setSelected(null);setCustom(a=>a.map((v,j)=>j===i?e.target.value:v));}}/><button aria-label={`删除牌位 ${i+1}`} disabled={custom.length===1} onClick={()=>{setSelected(null);setCustom(a=>a.filter((_,j)=>j!==i));}}>×</button></label>)}</div><button className="text-button" disabled={custom.length===12} onClick={()=>{setSelected(null);setCustom(a=>[...a,`牌位 ${a.length+1}`]);}}>＋ 添加牌位</button><button className="text-button" disabled={custom.some(p=>!p.trim())} onClick={()=>setSelected({id:'custom',name:'我的牌阵',description:'自定义',positions:custom.map(p=>p.trim())})}>使用此牌阵 ✓</button></details></section>}
  <div className="panel-bottom"><div><b>{selected?`${selected.name} · ${selected.positions.length} 张`:'请选择一个牌阵'}</b><small>{selected?selected.positions.join(' / '):'牌数与观察角度由你决定'}</small></div><button className="primary" disabled={!query||!selected} onClick={()=>onConfirm(selected)}>确认，开始洗牌 →</button></div>
 </div>;
}
