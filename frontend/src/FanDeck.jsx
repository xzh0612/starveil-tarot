import {useEffect,useRef,useState} from 'react';
import {clampFan,fanLayout} from './fan-layout';

export function FanDeck({session,busy,complete,onDraw,motion=true}){
 const host=useRef(null),drag=useRef(null),raf=useRef(0),position=useRef(38.5),velocity=useRef(0);
 const [center,setCenter]=useState(38.5),[width,setWidth]=useState(900),[dragging,setDragging]=useState(false);
 const moveTo=value=>{position.current=clampFan(value,session.deck.length);setCenter(position.current);};
 const stop=()=>cancelAnimationFrame(raf.current);
 useEffect(()=>{const el=host.current;const observer=new ResizeObserver(()=>setWidth(el.clientWidth));observer.observe(el);const wheel=e=>{e.preventDefault();cancelAnimationFrame(raf.current);moveTo(position.current+(Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY)/45);};el.addEventListener('wheel',wheel,{passive:false});return()=>{observer.disconnect();el.removeEventListener('wheel',wheel);cancelAnimationFrame(raf.current);};},[]);
 const down=e=>{if(e.button!==0)return;stop();const card=e.target.closest('[data-index]');drag.current={x:e.clientX,last:e.clientX,at:performance.now(),moved:false,button:card};velocity.current=0;host.current.setPointerCapture(e.pointerId);};
 const move=e=>{const d=drag.current;if(!d)return;const dx=e.clientX-d.last,now=performance.now();if(Math.abs(e.clientX-d.x)>6)d.moved=true;if(d.moved){setDragging(true);moveTo(position.current-dx/(width<600?18:27));velocity.current=-dx/Math.max(8,now-d.at)/(width<600?18:27)*16;}d.last=e.clientX;d.at=now;};
 const end=e=>{const d=drag.current;if(!d)return;drag.current=null;setDragging(false);if(host.current.hasPointerCapture(e.pointerId))host.current.releasePointerCapture(e.pointerId);
  if(e.type==='pointercancel'){velocity.current=0;return;}
  if(!d.moved&&d.button&&!d.button.disabled){onDraw(Number(d.button.dataset.index),{currentTarget:d.button});return;}
  if(d.moved&&motion){if(performance.now()-d.at>80)velocity.current=0;let last=performance.now();const coast=()=>{const now=performance.now(),factor=Math.min(3,(now-last)/16.67);last=now;velocity.current*=Math.pow(.9,factor);const before=position.current;moveTo(before+velocity.current*factor);if(Math.abs(velocity.current)>.008&&position.current!==before)raf.current=requestAnimationFrame(coast);};raf.current=requestAnimationFrame(coast);}
 };
 return <div className="fan-deck">
  <div ref={host} className={`fan-surface ${dragging?'dragging':''}`} role="group" aria-label="弧形牌带，共 78 张，可左右拖动" onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
   {session.deck.map((card,i)=>{const p=fanLayout(i,center,width),taken=session.selected.includes(i);return <button key={i} type="button" data-index={i} className={`fan-card ${taken?'taken':''}`} disabled={taken||busy||complete} aria-label={`选择第 ${i+1} 张牌`} style={{'--x':`${p.x}px`,'--y':`${p.y}px`,'--angle':`${p.angle}deg`,zIndex:i+1,visibility:p.visible?'visible':'hidden'}} onFocus={()=>{if(Math.abs(i-position.current)>width/(p.step*2)-3)moveTo(i);}} onClick={e=>{if(e.detail===0)onDraw(i,e);}}><span><img draggable="false" src="/assets/card-back.png" alt=""/><small>{String(i+1).padStart(2,'0')}</small></span></button>;})}
  </div>
  <div className="fan-navigation"><button aria-label="向左浏览牌带" onClick={()=>{stop();moveTo(center-8);}} disabled={center<=0}>←</button><span>左右推牌 · 停留抬起 · 轻触抽取</span><button aria-label="向右浏览牌带" onClick={()=>{stop();moveTo(center+8);}} disabled={center>=77}>→</button></div>
  <label className="fan-range"><span>01</span><input aria-label="浏览全部 78 张牌" type="range" min="0" max="77" step="0.1" value={center} onChange={e=>{stop();moveTo(Number(e.target.value));}}/><span>78</span></label>
 </div>;
}
