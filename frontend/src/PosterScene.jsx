import {useEffect,useRef} from 'react';
import * as THREE from 'three';
import {seatedPose} from './witch-staging';

// Live-poster adapter. Original GLB renderer remains in LegacyScene.jsx.
export const posterAssets={visitor:'/assets/witch-room-v5.png',table:'/assets/witch-room-down-v5.png'};
export function Scene({view,action,motion,particles,onStatus,panel=null}){
 const host=useRef(null),state=useRef({});state.current={view,action,motion,particles,panel};
 useEffect(()=>{
  const el=host.current;let renderer,frame,disposed=false;
  try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:false,powerPreference:'low-power'});}catch{onStatus('静态场景模式 · 当前设备未能启用动态特效');return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0,0);el.appendChild(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,0,2);camera.position.z=1;
  const uniforms={visitor:{value:null},table:{value:null},time:{value:0},pose:{value:0},cover:{value:new THREE.Vector2(1,1)},pointer:{value:new THREE.Vector2()},sparkles:{value:1},motion:{value:1}};
  const material=new THREE.ShaderMaterial({uniforms,depthTest:false,depthWrite:false,vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,  fragmentShader:`
   precision highp float;
   varying vec2 vUv;uniform sampler2D visitor,table;uniform float time,pose,sparkles,motion;uniform vec2 cover,pointer;
   float ellipse(vec2 p,vec2 c,vec2 r){return 1.-smoothstep(.5,1.,length((p-c)/r));}
   float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
   float fbm(vec2 p){float v=0.,a=.5;for(int k=0;k<4;k++){v+=a*vnoise(p);p=p*2.07+vec2(11.3,7.1);a*=.55;}return v;}
   // Isolated dancing flame: additive light only, never displaces background pixels.
   float flame(vec2 uv,vec2 c,float sd){
    vec2 jit=vec2(vnoise(vec2(time*3.4,sd*7.))-.5,vnoise(vec2(time*2.6,sd*13.+5.))-.5)*.018;
    vec2 p=(uv-c-jit*vec2(1.,.6))*vec2(1.,1.5);
    float core=exp(-dot(p,p)/.00034)*(.75+.55*vnoise(vec2(time*5.3,sd*3.+2.)));
    vec2 hp=(uv-c)*vec2(1.4,1.);
    float halo=exp(-dot(hp,hp)/.0011)*(.55+.3*sin(time*3.3+sd*2.1));
    float tip=exp(-dot(p+vec2(0.,.005),p+vec2(0.,.005))/.00010)*.8;
    return core+halo*.55+tip;
   }
   void main(){
    vec2 uv=(vUv-.5)*cover+.5;
    // Face, tabletop and resting hands stay still. Coordinates are bottom-up.
    float face=ellipse(uv,vec2(.567,.76),vec2(.083,.15));
    float hair=ellipse(uv,vec2(.425,.55),vec2(.12,.24))+ellipse(uv,vec2(.665,.53),vec2(.105,.23));
    float cloth=ellipse(uv,vec2(.365,.41),vec2(.075,.055))+ellipse(uv,vec2(.677,.44),vec2(.064,.12));
    float movable=clamp(hair+cloth,0.,1.)*(1.-face)*smoothstep(.347,.40,uv.y);
    vec2 flow=vec2(sin(time*.8+uv.y*17.)*.0017,cos(time*.65+uv.x*19.)*.0009)*movable*motion;
    uv+=flow+pointer*.0007*motion*movable;
    vec3 base=texture2D(visitor,uv).rgb;
    // Blend only the head, keeping room and hands perfectly stationary.
    float head=ellipse(uv,vec2(.567,.755),vec2(.094,.16));
    base=mix(base,texture2D(table,uv).rgb,pose*head);
    float shimmer=pow(max(0.,sin(uv.y*42.-time*.75+uv.x*18.)),18.)*cloth*motion;
    base+=vec3(.08,.035,.12)*shimmer;
    float candle=(ellipse(uv,vec2(.04,.72),vec2(.06,.24))+ellipse(uv,vec2(.978,.57),vec2(.06,.19)));
    base+=vec3(.026,.013,.003)*candle*(sin(time*4.5)+sin(time*7.7)*.4)*motion;
    // Dancing candle flames: isolated additive light, background pixels never move.
    float f1=flame(uv,vec2(.037,.715),1.);
    float f2=flame(uv,vec2(.968,.595),2.);
    base+=(f1+f2*1.1)*vec3(.70,.46,.16)*motion;
    // Golden light band orbiting the armillary rings, and its smaller twin top right.
    vec2 ap=(uv-vec2(.20,.735))/vec2(.05,.08);
    float ring=1.-smoothstep(.7,1.,length(ap));
    if(ring>0.){
     float ang=atan(ap.y,ap.x);
     float g1=pow(max(0.,cos(ang-time*.55)),22.)+pow(max(0.,cos(ang+time*.42+2.4)),26.)*.7;
     base+=ring*g1*vec3(.30,.23,.09)*motion;
    }
    vec2 ap2=(uv-vec2(.955,.905))/vec2(.033,.055);
    float ring2=1.-smoothstep(.7,1.,length(ap2));
    if(ring2>0.){
     float ang2=atan(ap2.y,ap2.x);
     base+=ring2*pow(max(0.,cos(ang2+time*.48)),24.)*vec3(.26,.2,.08)*motion;
    }
    // Soft breath of the crystal ball and the moon behind the window.
    float ball=ellipse(uv,vec2(.048,.365),vec2(.032,.05));
    base+=vec3(.05,.08,.13)*ball*(.5+.5*sin(time*1.2))*motion*.7;
    float moon=ellipse(uv,vec2(.72,.905),vec2(.032,.052));
    base+=vec3(.045,.045,.085)*moon*(.6+.4*sin(time*.5))*motion;
    // Isolated incense smoke: tight fbm puffs + rising embers along the painted wisp, overlay only.
    if(ellipse(uv,vec2(.132,.63),vec2(.03,.23))>.003){
     vec3 smoke=vec3(0.);
     for(int j=0;j<5;j++){
      float fj=float(j),sj=fract(sin(fj*91.7+4.7)*43758.5);
      float t=fract(time*(.075+sj*.025)+sj);
      float fade=smoothstep(0.,.1,t)*(1.-smoothstep(.55,1.,t));
      vec2 c=vec2(.132+sin(t*7.+sj*40.)*.018*(1.+t)+(fj-2.)*.004,.44+t*.36);
      vec2 d=(uv-c)*vec2(3.4,1.1);
      float body=exp(-dot(d,d)/(.0003+.006*t*t));
      float n=fbm(uv*vec2(7.,4.5)+vec2(time*.1+sj*9.,-time*.35));
      smoke+=vec3(.40,.36,.46)*(body*pow(n,1.4)*fade);
     }
     base+=smoke*.16*motion;
     // Bright rising embers — small dots drifting upward, sell "smoke is moving" clearly.
     for(int j=0;j<3;j++){
      float sj=fract(sin(float(j)*91.7+2.3)*43758.5);
      float t=fract(time*(.085+sj*.025)+sj);
      vec2 sp=vec2(.132+sin(t*7.+sj*40.)*.022*(1.+t*.8)+(sj-.5)*.012,.44+t*.36);
      vec2 d=(uv-sp)*vec2(1.,1.);
      float emb=exp(-dot(d,d)/(.00006+.000008*t))*(1.-smoothstep(.65,1.,t))*(.75+.4*sin(time*6.+sj*9.));
      base+=emb*vec3(1.,.7,.32)*motion;
     }
    }
    for(int i=0;i<42;i++){
     float f=float(i),seed=fract(sin(f*127.1+8.)*43758.5453);
     vec2 p=vec2(fract(seed*13.17+sin(time*.07+f)*.023),fract(seed*7.71+time*(.003+seed*.004)));
     vec2 delta=p-(pointer*.5+.5);p+=delta*exp(-dot(delta,delta)*90.)*.35*motion;
     vec2 d=(vUv-p)/vec2(.65,1.);float glow=exp(-dot(d,d)/(0.000002+seed*.000004));
     base+=glow*vec3(.52,.37,.63)*sparkles*(.22+.18*sin(time+f));
    }
    gl_FragColor=vec4(base,1.);
   }`});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);mesh.visible=false;scene.add(mesh);
  const textures=[];const loader=new THREE.TextureLoader();
  Promise.all(Object.entries(posterAssets).map(async([name,url])=>{const t=await loader.loadAsync(url);if(disposed){t.dispose();return;}textures.push(t);uniforms[name].value=t;})).then(()=>{if(!disposed){mesh.visible=true;onStatus('ready');}}).catch(()=>{if(!disposed)onStatus('场景图片未加载完整，请刷新重试');});
  const resize=()=>{const w=el.clientWidth,h=el.clientHeight;renderer.setSize(w,h);const a=w/h,source=1672/941;uniforms.cover.value.set(a<source?a/source:1,a<source?1:source/a);};
  const observer=new ResizeObserver(resize);observer.observe(el);resize();
  const pointer=new THREE.Vector2();const move=e=>pointer.set(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2);window.addEventListener('pointermove',move);
  let previous=performance.now();
  const animate=()=>{frame=requestAnimationFrame(animate);const now=performance.now(),dt=Math.min(.05,(now-previous)/1000);previous=now;if(document.hidden)return;const s=state.current;
   uniforms.time.value+=s.motion?dt:0;uniforms.motion.value=s.motion?1:0;uniforms.sparkles.value=s.particles?1:0;
   uniforms.pointer.value.lerp(s.motion?pointer:new THREE.Vector2(),1-Math.exp(-dt*4));
   const target=seatedPose(s.view,s.action,s.panel)==='table'?1:0;uniforms.pose.value=s.motion?THREE.MathUtils.damp(uniforms.pose.value,target,4,dt):target;
   mesh.visible=!!uniforms.visitor.value&&!!uniforms.table.value&&s.view!=='entry';renderer.render(scene,camera);
  };animate();
  return()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('pointermove',move);textures.forEach(t=>t.dispose());mesh.geometry.dispose();material.dispose();renderer.dispose();renderer.domElement.remove();};
 },[]);
 return <div className="webgl poster-scene" ref={host} aria-hidden="true" data-witch-pose={seatedPose(view,action,panel)}/>;
}
