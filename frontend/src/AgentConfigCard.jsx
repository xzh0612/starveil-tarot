import {useEffect,useState} from 'react';
import {Check,Sparkle,Trash} from '@phosphor-icons/react';
import {saveReadingConfig,clearReadingConfig} from './services';

/** One line of plain-language state, shared by the guide card and the settings row. */
export function agentConfigStatus(config){
 if(!config?.available)return '本机解读服务未连接，配置入口暂不可用。';
 if(config.source==='env')return '密钥来自启动时的环境变量，界面无法改写。';
 if(config.configured)return '已连接 · 密钥保存在本机 frontend/.env.local';
 if(config.source==='file')return '检测到 .env.local 里已有密钥，重启解读服务后生效。';
 return '尚未配置密钥，AI 解读还不能使用。';
}

/**
 * The one form behind both entry points. It owns the two inputs and the two
 * requests; the key lives in React state only while it is being typed and is
 * cleared the moment the server confirms it wrote the file.
 */
function AgentConfigForm({config,onSaved,dismissLabel,onDismiss}){
 const editable=config?.editable!==false;
 const [key,setKey]=useState(''),[model,setModel]=useState(config?.model||'');
 const [busy,setBusy]=useState(false),[problem,setProblem]=useState(''),[done,setDone]=useState('');
 useEffect(()=>{setModel(config?.model||'');},[config?.model]);
 const modelChanged=(model.trim()||'')!==(config?.model||'');
 const canSave=editable&&!busy&&(key.trim()!==''||modelChanged);
 async function submit(event){
  event.preventDefault();
  if(!canSave)return;
  setBusy(true);setProblem('');setDone('');
  try{
   const payload={};
   if(key.trim())payload.apiKey=key.trim();
   if(modelChanged)payload.model=model.trim();
   const next=await saveReadingConfig(payload);
   setKey('');setDone('密钥已保存，现在可以直接解读。');
   onSaved?.(next);
  }catch(error){setProblem(error.message);}
  finally{setBusy(false);}
 }
 async function forget(){
  if(busy)return;
  setBusy(true);setProblem('');setDone('');
  try{const next=await clearReadingConfig();setKey('');setDone('已清除本机密钥。');onSaved?.(next);}
  catch(error){setProblem(error.message);}
  finally{setBusy(false);}
 }
 return <form className="agent-config" onSubmit={submit} autoComplete="off">
  <label className="field">DeepSeek API 密钥<input type="password" name="starveil-deepseek-key" autoComplete="off" spellCheck={false} placeholder={config?.configured?'已保存，如需更换请重新粘贴':'sk-…'} value={key} onChange={e=>{setKey(e.target.value);setDone('');}} disabled={busy||!editable}/></label>
  <label className="field">模型<input type="text" name="starveil-deepseek-model" autoComplete="off" spellCheck={false} placeholder="deepseek-flash" value={model} onChange={e=>{setModel(e.target.value);setDone('');}} disabled={busy||!editable}/></label>
  {problem&&<p className="agent-config-problem">{problem}</p>}
  {done&&<p className="agent-config-done"><Check/> {done}</p>}
  {config?.restartRequired&&<p className="agent-config-note">文件里已有密钥但解读服务还没加载它，重启服务即可生效（`npm run dev:all`）。</p>}
  <div className="agent-config-actions">
   <button className="primary" type="submit" disabled={!canSave}>{busy?'正在保存…':'保存并启用'}</button>
   {(config?.configured||config?.source==='file')&&editable&&<button className="text-button" type="button" onClick={forget} disabled={busy}><Trash/> 清除密钥</button>}
   {onDismiss&&<button className="text-button" type="button" onClick={onDismiss} disabled={busy}>{dismissLabel}</button>}
  </div>
 </form>;
}

/** In-place guide card: shown inside the conversation until a key is saved. */
export function AgentKeyCard({config,onSaved,onDismiss}){
 return <section className="agent-config-card" aria-label="配置 DeepSeek 密钥">
  <header><Sparkle weight="thin"/><div><span className="eyebrow">CONNECT DEEPSEEK</span><h3>还差一步：接入你的密钥</h3></div></header>
  <p>星幕在本机调用 DeepSeek 解读。密钥只写进 <code>frontend/.env.local</code>，不会上传、不会回显，也不会进入浏览器存储。</p>
  <AgentConfigForm config={config} onSaved={onSaved} onDismiss={onDismiss} dismissLabel="稍后再说"/>
  <p className="fine-print">在 platform.deepseek.com 创建 API key 后粘贴到这里。</p>
 </section>;
}

/** Always-available row inside 偏好设置, with the current state spelled out. */
export function AgentSettingsSection({config,onSaved}){
 return <div className="model-info agent-config-section">
  <h3>AI 解读 · DeepSeek</h3>
  <p>{agentConfigStatus(config)}</p>
  {config?.available
   ? <AgentConfigForm config={config} onSaved={onSaved}/>
   : <p className="agent-config-note">启动本机解读服务后，这里就能直接配置密钥。</p>}
  {config?.source==='env'&&<p className="agent-config-note">想在这里改，请先取消 <code>DEEPSEEK_API_KEY</code> 环境变量。</p>}
 </div>;
}
