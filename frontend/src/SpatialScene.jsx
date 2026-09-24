import {useEffect,useRef} from 'react';
import * as THREE from 'three';
import {createChamber} from './scene3d/chamber';
import {createSeatedWitch} from './SeatedWitch';
import {seatedPose} from './witch-staging';

// Room and props are meshes. The approved portrait remains temporary while the
// replacement sculpt is developed; do not describe it as a rigged character.
export function Scene({view,action,motion,particles,onStatus,panel}){
 const host=useRef(null),state=useRef({});state.current={view,action,motion,particles,panel};
 useEffect(()=>{
  let renderer;try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});}catch{onStatus('3D 场景未能启动，牌局仍可操作。');return;}
  const el=host.current;renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0x110d1c);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;el.appendChild(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1,.1,60);scene.fog=new THREE.FogExp2(0x140e21,.025);
  scene.add(new THREE.HemisphereLight(0xcab7e5,0x332437,2));
  const moon=new THREE.DirectionalLight(0xc7b9f5,3);moon.position.set(-3,7,2);moon.castShadow=true;moon.shadow.mapSize.set(1024,1024);moon.shadow.camera.left=-8;moon.shadow.camera.right=8;moon.shadow.camera.top=8;moon.shadow.camera.bottom=-8;moon.shadow.bias=-.0005;scene.add(moon);
  const fill=new THREE.PointLight(0xc8a4f1,28,14);fill.position.set(0,4,-3);scene.add(fill);
  const chamber=createChamber();scene.add(chamber.group);
  const witch=createSeatedWitch({onReady:()=>onStatus('ready'),onError:()=>onStatus('角色素材加载失败，场景和牌局仍可使用。')});witch.group.position.set(0,2.62,-.15);witch.group.scale.setScalar(1.2);scene.add(witch.group);
  const count=1600,p=new Float32Array(count*3);for(let i=0;i<count;i++){const seed=(Math.sin(i*127.1+3)*43758.5)%1;p[i*3]=seed*9;p[i*3+1]=(Math.sin(i*73.1)*.5+.5)*8;p[i*3+2]=Math.cos(i*19.7)*5;}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(p,3));
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{time:{value:0},pointer:{value:new THREE.Vector2()}},vertexShader:`uniform float time;uniform vec2 pointer;varying float glow;void main(){vec3 p=position;p.x+=sin(time*.2+p.y)*.12;p.y+=sin(time*.15+p.x)*.12;vec2 delta=p.xy-vec2(pointer.x*4.,pointer.y*3.+2.);p.xy+=delta*exp(-dot(delta,delta)*.9)*.9;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(20./-mv.z,1.,4.);glow=.4+.3*sin(p.x+time);}`,fragmentShader:`varying float glow;void main(){float a=pow(max(0.,1.-length(gl_PointCoord-.5)*2.),2.);gl_FragColor=vec4(.8,.64,1.,a*glow);}`});const dust=new THREE.Points(geometry,material);scene.add(dust);
  const pointer=new THREE.Vector2(),position=new THREE.Vector3(),target=new THREE.Vector3(0,2.1,0),zero=new THREE.Vector2();camera.position.set(0,3.9,9.5);
  const move=e=>pointer.set(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2);window.addEventListener('pointermove',move);
  const resize=()=>{camera.aspect=el.clientWidth/el.clientHeight;camera.updateProjectionMatrix();renderer.setSize(el.clientWidth,el.clientHeight);};const observer=new ResizeObserver(resize);observer.observe(el);resize();let frame,last=performance.now(),time=0;
  function tick(){frame=requestAnimationFrame(tick);const now=performance.now(),dt=Math.min((now-last)/1000,.05);last=now;if(document.hidden)return;const s=state.current;if(s.motion)time+=dt;const narrow=camera.aspect<1;const drawing=['draw','reading','shuffle'].includes(s.view);const x=s.panel==='reading'&&!narrow?-1:0;position.set(x+(s.motion?pointer.x*.14:0),drawing?4.1:3.5,narrow?12.7:9.3);const ease=s.motion?1-Math.exp(-dt*3):1;camera.position.lerp(position,ease);target.lerp(new THREE.Vector3(x*.7,drawing?1.8:2.1,0),ease);camera.lookAt(target);witch.update(dt,{pose:seatedPose(s.view,s.action,s.panel),motion:s.motion,particles:s.particles,pointer:s.motion?pointer:zero});chamber.update(time,s.motion);dust.visible=s.particles;material.uniforms.time.value=time;material.uniforms.pointer.value.lerp(s.motion?pointer:zero,ease);renderer.render(scene,camera);}
  tick();return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('pointermove',move);chamber.dispose();scene.remove(witch.group);witch.dispose();const resources=new Set();scene.traverse(o=>{if(o.geometry)resources.add(o.geometry);for(const m of (Array.isArray(o.material)?o.material:[o.material]).filter(Boolean)){resources.add(m);Object.values(m).filter(v=>v?.isTexture).forEach(t=>resources.add(t));}});resources.forEach(r=>r.dispose());renderer.dispose();renderer.domElement.remove();};
 },[]);
 return <div ref={host} className="webgl spatial-scene" aria-hidden="true" data-witch-pose={seatedPose(view,action,panel)}/>;
}
