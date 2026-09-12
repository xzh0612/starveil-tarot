import {useEffect, useRef} from 'react';
import {ArrowLeft, ArrowUpRight, Shuffle} from '@phosphor-icons/react';
import {cardGuides} from './data/card-guides';
import references from './data/card-references.json';
import './card-guide.css';

export function CardGuide({card, reversed, onToggle, onBack, children}) {
 const guide = cardGuides[card.id];
 const reference = references[card.id];
 const root = useRef(null);
 useEffect(() => {
  const scroller = root.current?.closest('.panel-body');
  if(scroller) scroller.scrollTop = 0;
 }, [card.id]);
 return <div className="card-detail enriched-guide" ref={root}>
  <aside className="guide-portrait">
   {children}
   <button className="text-button" onClick={onToggle}>查看{reversed?'正位':'逆位'} <Shuffle/></button>
   <span className="guide-edition">RIDER–WAITE–SMITH · 1909</span>
   <small>固定牌面 · {card.group}<br/>原画 Pamela Colman Smith</small>
  </aside>
  <article>
   <button className="text-button" onClick={onBack}><ArrowLeft/> 全部牌面</button>
   <span className="eyebrow">{card.group} · 深入阅读</span>
   <h2>{card.key}</h2>
   <section className="guide-section">
    <h3><span>01</span> 看懂牌面</h3><p>{guide.symbolism}</p>
   </section>
   <section className="guide-section">
    <h3><span>02</span> 正位与逆位</h3>
    <div className="guide-orientations" role="group" aria-label="牌义方向">
     <button aria-pressed={!reversed} onClick={()=>reversed&&onToggle()}>正位 · 核心主题</button>
     <button aria-pressed={reversed} onClick={()=>!reversed&&onToggle()}>逆位 · 另一面</button>
    </div>
    <p className="guide-meaning" aria-live="polite">{reversed?guide.reversed:guide.upright}</p>
    <small>逆位需结合问题与牌位理解，不是把正位简单反过来。</small>
   </section>
   <section className="guide-section">
    <h3><span>03</span> 放进真实生活</h3>
    <div className="guide-contexts"><div><h4>关系与情感</h4><p>{guide.relationships}</p></div><div><h4>事业与行动</h4><p>{guide.work}</p></div></div>
    <small>以上为主题应用。选到逆位时，再结合上方的受阻、过度或调整方向阅读。</small>
   </section>
   <section className="guide-reflection"><span className="eyebrow">A QUESTION TO SIT WITH</span><h3>{guide.question}</h3></section>
   <details className="guide-method"><summary>如何结合牌阵，而不是孤立地看一张牌</summary>
    <p>先读牌位，再读牌义：在「现状」位，观察这一主题如何出现；在「阻碍」位，检查哪里过度、受限或被忽略；在「建议」位，把它转换为你能采取的行动。「未来趋势」只表示在当前条件下可探索的方向。</p>
    <p>相邻牌提供补充或张力，不构成固定公式。先写出问题中的事实，再比较哪些解释贴合；不为让牌义“说得通”而补造他人的想法。</p>
    <p>宫廷牌可以描述一种态度、角色或能力阶段，不必对应某个固定年龄、性别的人。不同传统对同一张牌的解读可能不同。</p>
   </details>
   <footer className="guide-sources">
    <h3>阅读依据与原典</h3>
    <p>中文为本图鉴的编辑性整理：图像与传统牌义参考 Waite 原书，现代情境结合开放资料与牌面象征展开，不是原书逐字翻译，也不代表唯一解释。</p>
    <div className="guide-source-links">
     <a href={reference.waiteUrl} target="_blank" rel="noreferrer">Waite · 传统牌义原典 <ArrowUpRight/></a>
     {card.group==='大阿卡纳'&&<a href="https://en.wikisource.org/wiki/The_Pictorial_Key_to_the_Tarot/Part_2" target="_blank" rel="noreferrer">Waite · 大阿卡纳图像象征 <ArrowUpRight/></a>}
     <a href={reference.modernUrl} target="_blank" rel="noreferrer">Corpora · 现代牌义资料 <ArrowUpRight/></a>
    </div>
    <details><summary>展开「{card.name}」的 Waite 英文原文</summary>
     <p className="guide-source-note">历史原文保留当时的占断用语，包含过时的身份刻板印象与确定性判断；本图鉴不将其作为现代人物判断、诊断或事实预测。</p>
     <blockquote lang="en">{reference.waite}</blockquote>
     {card.id==='c02'&&<p className="guide-source-note">本次引用的 Part 3 圣杯二条目未单列逆位；上方中文逆位属于现代编辑性解读。</p>}
    </details>
    <details><summary>展开现代资料的建设面与挑战面</summary>
     <p className="guide-source-note">数据说明署名 Mark McElroy，收录于 Corpora（CC0）。Light / Shadow 是建设面与挑战面，不直接等同正位 / 逆位；中文情境是本图鉴的进一步整理。</p>
     <h4>Light · 建设面（英文资料）</h4><ul lang="en">{reference.light.map(text=><li key={text}>{text}</li>)}</ul>
     <h4>Shadow · 挑战面（英文资料）</h4><ul lang="en">{reference.shadow.map(text=><li key={text}>{text}</li>)}</ul>
     <a href="https://github.com/dariusk/corpora#license" target="_blank" rel="noreferrer">查看 Corpora CC0 许可 <ArrowUpRight/></a>
    </details>
    <small>资料核对：2026.09.12 · 覆盖 22 张大阿卡纳与 56 张小阿卡纳</small>
   </footer>
  </article>
 </div>;
}
