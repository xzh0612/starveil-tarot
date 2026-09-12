import {useEffect,useRef} from 'react';

export function useBackgroundMusic({enabled,volume=.35,ducked=false,onError}){
 const audio=useRef(null),state=useRef({}),fade=useRef(0);state.current={enabled,volume,ducked,onError};
 useEffect(()=>{
  const player=new Audio('/audio/moonlit-study.mp3');player.loop=true;player.preload='none';player.volume=0;player.hidden=true;player.dataset.bgm='moonlit-study';document.body.appendChild(player);audio.current=player;
  let disposed=false;
  const ramp=()=>{
   cancelAnimationFrame(fade.current);
   const tick=()=>{if(disposed)return;const s=state.current,target=s.enabled&&!document.hidden?Math.max(0,Math.min(1,s.volume))*(s.ducked?.6:1):0;
    player.volume+= (target-player.volume)*.07;
    if(Math.abs(player.volume-target)<.003){player.volume=target;if(target===0)player.pause();return;}
    fade.current=requestAnimationFrame(tick);
   };tick();
  };
  const play=()=>{if(!state.current.enabled||document.hidden)return;if(!player.paused){ramp();return;}player.volume=0;player.play().then(()=>{if(!disposed)ramp();}).catch(e=>{if(e.name!=='NotAllowedError'&&e.name!=='AbortError'&&!disposed)state.current.onError?.('背景音乐暂时无法播放，请稍后重新开启。');});};
  const sync=()=>{if(document.hidden){cancelAnimationFrame(fade.current);player.pause();player.volume=0;}else if(state.current.enabled)play();else ramp();};
  player.addEventListener('error',()=>{if(!disposed)state.current.onError?.('背景音乐加载失败，请刷新后重试。');});
  document.addEventListener('pointerdown',play);document.addEventListener('keydown',play);document.addEventListener('visibilitychange',sync);
  audio.current.sync=sync;
  return()=>{disposed=true;cancelAnimationFrame(fade.current);document.removeEventListener('pointerdown',play);document.removeEventListener('keydown',play);document.removeEventListener('visibilitychange',sync);player.pause();player.removeAttribute('src');player.load();player.remove();audio.current=null;};
 },[]);
 useEffect(()=>{audio.current?.sync?.();},[enabled,volume,ducked]);
}
