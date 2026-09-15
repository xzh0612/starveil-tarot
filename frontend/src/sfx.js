// 星幕动作音效 —— 全部由 WebAudio 实时合成，无外部音频请求（与 BGM 同一原则）。
let ctx=null,enabled=false,errorHandler=null,noise=null;
function ac(){
 try{
  ctx??=new (window.AudioContext||window.webkitAudioContext)();
  if(ctx.state==='suspended')ctx.resume();
  return ctx;
 }catch{errorHandler?.();return null;}
}
export function setSfxEnabled(v){enabled=v;}
export function setSfxErrorHandler(fn){errorHandler=fn;}
function noiseBuffer(a){
 if(noise)return noise;
 const b=a.createBuffer(1,a.sampleRate,a.sampleRate),d=b.getChannelData(0);
 for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
 noise=b;return b;
}
function tone(a,{type='sine',from,to,dur,gain=.06,delay=0}){
 const t=a.currentTime+delay,o=a.createOscillator(),g=a.createGain();
 o.type=type;o.frequency.setValueAtTime(from,t);
 if(to)o.frequency.exponentialRampToValueAtTime(Math.max(to,1),t+dur);
 g.gain.setValueAtTime(.0001,t);
 g.gain.exponentialRampToValueAtTime(gain,t+.012);
 g.gain.exponentialRampToValueAtTime(.0001,t+dur);
 o.connect(g).connect(a.destination);o.start(t);o.stop(t+dur+.05);
}
function swish(a,{dur=.3,gain=.08,f=1400,q=.8,delay=0,slide=.5}){
 const t=a.currentTime+delay,s=a.createBufferSource(),bp=a.createBiquadFilter(),g=a.createGain();
 s.buffer=noiseBuffer(a);s.loop=true;
 bp.type='bandpass';bp.frequency.setValueAtTime(f,t);
 bp.frequency.exponentialRampToValueAtTime(Math.max(f*slide,60),t+dur);
 bp.Q.value=q;
 g.gain.setValueAtTime(.0001,t);
 g.gain.exponentialRampToValueAtTime(gain,t+dur*.3);
 g.gain.exponentialRampToValueAtTime(.0001,t+dur);
 s.connect(bp).connect(g).connect(a.destination);s.start(t);s.stop(t+dur+.05);
}
function burst(a,{dur=.05,gain=.08,f=2400,q=8,delay=0}){
 const t=a.currentTime+delay,s=a.createBufferSource(),bp=a.createBiquadFilter(),g=a.createGain();
 s.buffer=noiseBuffer(a);s.loop=true;bp.type='bandpass';bp.frequency.value=f;bp.Q.value=q;
 g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(gain,t+.004);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
 s.connect(bp).connect(g).connect(a.destination);s.start(t);s.stop(t+dur+.02);
}
function chirp(a,{from,to,dur,gain=.05,delay=0,f=520,q=2.5}){
 const t=a.currentTime+delay,o=a.createOscillator(),bp=a.createBiquadFilter(),g=a.createGain();
 o.type='sawtooth';o.frequency.setValueAtTime(from,t);o.frequency.exponentialRampToValueAtTime(to,t+dur);
 bp.type='bandpass';bp.frequency.value=f;bp.Q.value=q;
 g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(gain,t+dur*.2);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
 o.connect(bp).connect(g).connect(a.destination);o.start(t);o.stop(t+dur+.02);
}
function chime(a,{f,dur=1.4,gain=.04,delay=0}){ // 玻璃水晶铃音：失谐双音 + 高泛音 + 回声余韵
 tone(a,{type:'sine',from:f*1.002,dur,gain,delay});
 tone(a,{type:'sine',from:f*.998,dur,gain:gain*.7,delay});
 tone(a,{type:'sine',from:f*2.01,dur:dur*.6,gain:gain*.25,delay});
 tone(a,{type:'sine',from:f,dur:dur*.8,gain:gain*.3,delay:delay+.22});
}
const recipes={
 door(a){ // 原神风推门：低音冲击 → 气流上升 → 竖琴琶音 → 水晶铃音散开
  // [1] 影院级低音冲击（boom）：越低越"重"
  tone(a,{type:'sine',from:72,to:44,dur:.7,gain:.11});
  tone(a,{type:'sine',from:36,dur:.9,gain:.05});
  // [2] 气流上升（riser）：slide 越大冲得越高
  swish(a,{dur:.9,gain:.045,f:300,q:1,slide:3});
  // [3] 竖琴琶音（上行 D 大调五声）：音符/间隔可改
  [587.33,880,1174.7,1480,1760].forEach((f,i)=>tone(a,{type:'triangle',from:f,dur:.4,gain:.045-i*.006,delay:.18+i*.085}));
  // [4] 水晶铃音散开：f=音高，delay=入场时机，gain 默认 .04
  chime(a,{f:987.77,delay:.45});
  chime(a,{f:1318.5,delay:.58});
  chime(a,{f:1480,delay:.72});
  chime(a,{f:1975.5,delay:.88,gain:.035});
 },
 shuffle(a){ // 洗牌：连续的牌面沙沙声
  for(let i=0;i<7;i++)swish(a,{dur:.16+Math.random()*.1,gain:.05+Math.random()*.03,f:1600+Math.random()*900,q:1.4,slide:.6,delay:i*.11});
 },
 draw(a){ // 抽牌/发牌：一声干脆的滑牌 + 落定轻响
  swish(a,{dur:.22,gain:.11,f:2200,q:1,slide:.35});
  tone(a,{type:'triangle',from:620,to:330,dur:.12,gain:.045,delay:.14});
 },
 reveal(a){ // 翻牌：星光铃音
  tone(a,{type:'sine',from:784,dur:1.1,gain:.05});
  tone(a,{type:'sine',from:1174.7,dur:.9,gain:.032,delay:.07});
  tone(a,{type:'sine',from:2093,dur:.5,gain:.014,delay:.14});
 },
 complete(a){ // 选齐牌：三音上行
  [293.66,440,587.33].forEach((f,i)=>tone(a,{type:'sine',from:f,dur:.7,gain:.04,delay:i*.12}));
 },
 send(a){ // 发送问题：轻柔气泡
  tone(a,{type:'sine',from:480,to:900,dur:.12,gain:.05});
 },
 thinking(a){ // 解读开始：柔缓的呼吸式起伏
  tone(a,{type:'sine',from:220,dur:1.4,gain:.03});
  tone(a,{type:'sine',from:330,dur:1.2,gain:.02,delay:.2});
 },
 save(a){ // 保存档案：合上书页
  tone(a,{type:'sine',from:150,to:62,dur:.18,gain:.09});
  swish(a,{dur:.3,gain:.045,f:2600,q:1.2,slide:.4,delay:.05});
 },
 tick(a){ // 打开面板：极轻的一声触碰
  tone(a,{type:'triangle',from:900,dur:.06,gain:.02});
 },
};
export function playSfx(name){
 if(!enabled||!recipes[name])return;
 const a=ac();if(!a)return;
 try{recipes[name](a);}catch{errorHandler?.();}
}
