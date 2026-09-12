import {useEffect,useRef} from 'react';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {witchModelConfig} from './services';
import {createSeatedWitch} from './SeatedWitch';
import {seatedPose,seatedFraming} from './witch-staging';
import {resolveWitchAction,singleWitchActions} from './witch-animation';

/** Scene adapter: loadModel(url), setAction(state), setView(view), dispose().
 * Imported skeletal/morph clips crossfade automatically when named in config.
 * Nyx v2 ships real weighted meshes and nine skeletal clips.
 */
export function Scene({view,action,motion,particles,onStatus,representation='portrait',panel=null}){
 const host=useRef(null),state=useRef({view,action,motion,particles,representation,panel});
 state.current={view,action,motion,particles,representation};
 useEffect(()=>{
  const el=host.current;let renderer;
  try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});}catch{onStatus('当前设备无法启动 3D，已保留选牌与阅读功能。');return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;el.appendChild(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(39,1,.1,80);
  camera.position.set(0,3.35,8.1);
  scene.add(new THREE.HemisphereLight(0xb9a2e9,0x231629,1.4));
  const key=new THREE.DirectionalLight(0xd8c4ff,2);key.position.set(-4,6,4);scene.add(key);
  const rim=new THREE.PointLight(0xb49bdf,13,12);rim.position.set(1,4,-2);scene.add(rim);
  const warm=new THREE.PointLight(0xffc997,8,10);warm.position.set(-3,2,2);scene.add(warm);
  const table=new THREE.Group();table.position.set(0,1.3,3);scene.add(table);
  const top=new THREE.Mesh(new THREE.BoxGeometry(14,.18,8),new THREE.MeshStandardMaterial({color:0x1c1324,roughness:1,metalness:0}));table.add(top);
  const textile=new THREE.TextureLoader().load('/assets/velvet.png');textile.colorSpace=THREE.SRGBColorSpace;textile.wrapS=textile.wrapT=THREE.RepeatWrapping;textile.repeat.set(3,3);top.material.map=textile;top.material.color.set(0x716279);
  let model,mixer,clips=[],disposed=false,previousAction='',activeClip;
  async function loadModel(url){
   const gltf=await new GLTFLoader().loadAsync(url);
   if(disposed){gltf.scene.traverse(disposeObject);return;}
   if(model){scene.remove(model);model.traverse(disposeObject);}
   model=gltf.scene;model.position.set(0,-.1,-.65);model.scale.setScalar(1.04);model.traverse(o=>{if(o.material?.name==='Lightless hood')o.material=new THREE.MeshBasicMaterial({color:0x020103});});scene.add(model);
   mixer=new THREE.AnimationMixer(model);clips=gltf.animations;onStatus('ready');
  }
  if(representation==='model')loadModel(witchModelConfig.url).catch(()=>onStatus('女巫模型加载失败，可刷新重试；牌局不会丢失。'));
  const living=createSeatedWitch({onReady:()=>onStatus('ready'),onError:()=>onStatus('女巫立绘加载失败，请刷新重试。')});living.group.position.set(.85,2.45,-.55);scene.add(living.group);
  const count=1800,positions=new Float32Array(count*3),seeds=new Float32Array(count);
  for(let i=0;i<count;i++){positions[i*3]=(Math.random()-.5)*18;positions[i*3+1]=Math.random()*10-1;positions[i*3+2]=(Math.random()-.5)*14;seeds[i]=Math.random();}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('seed',new THREE.BufferAttribute(seeds,1));
  const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{time:{value:0},pointer:{value:new THREE.Vector2()},strength:{value:1}},vertexShader:`attribute float seed; uniform float time; uniform vec2 pointer; varying float v; void main(){vec3 p=position;p.x+=sin(time*.17+seed*40.+p.y)*.28;p.y+=sin(time*.21+seed*60.)*.23;vec2 delta=p.xy-vec2(pointer.x*5.,pointer.y*3.+2.);float d=length(delta);p.xy+=normalize(delta+vec2(.001))*exp(-d*d*.6)*.7;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp((18.+seed*22.)/-mv.z,1.,7.);v=.3+seed*.7;}`,fragmentShader:`varying float v; uniform float strength;void main(){float d=length(gl_PointCoord-.5)*2.;float a=pow(max(0.,1.-d),2.);gl_FragColor=vec4(.77,.64,1.,a*v*strength);}`});
  const stars=new THREE.Points(geo,mat);scene.add(stars);
  const pointer=new THREE.Vector2(),look=new THREE.Vector3(0,1.85,0),desired=new THREE.Vector3();let elapsed=0,frame,lastTime=performance.now();
  const resize=()=>{camera.aspect=el.clientWidth/el.clientHeight;camera.updateProjectionMatrix();renderer.setSize(el.clientWidth,el.clientHeight);};
  const observer=new ResizeObserver(resize);observer.observe(el);resize();
  const move=e=>{pointer.set(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2);};window.addEventListener('pointermove',move);
  function animate(){
   frame=requestAnimationFrame(animate);const now=performance.now(),dt=Math.min((now-lastTime)/1000,.05);lastTime=now;if(document.hidden)return;
   const s=state.current;const speed=s.motion?1:0;elapsed+=dt*speed;mat.uniforms.time.value=elapsed;mat.uniforms.pointer.value.lerp(s.motion?pointer:new THREE.Vector2(),.045);mat.uniforms.strength.value=s.particles?.9:0;
   const drawing=s.view==='draw'||s.view==='shuffle';const entering=s.view==='entry';const narrow=camera.aspect<.9;const staging=seatedFraming(s.view,s.panel,narrow);const ease=1-Math.exp(-dt*5);
   table.visible=!entering;table.position.y=THREE.MathUtils.lerp(table.position.y,staging.tableY,ease);if(model)model.visible=!entering&&s.representation==='model';living.group.visible=!entering&&s.representation!=='model';living.group.position.lerp(new THREE.Vector3(staging.x,staging.y,-.55),ease);living.group.scale.lerp(new THREE.Vector3(staging.scale,staging.scale,staging.scale),ease);living.update(dt,{pose:seatedPose(s.view,s.action,s.panel),motion:s.motion,particles:s.particles,pointer});
   desired.set(s.motion?pointer.x*.045:0,drawing&&narrow?5:3.35,entering?10.3:(narrow?10.4:8.1));camera.position.lerp(desired,1-Math.exp(-dt*2));look.lerp(new THREE.Vector3(0,1.85,0),1-Math.exp(-dt*2));camera.lookAt(look);
   if(model){
    model.position.y=THREE.MathUtils.lerp(model.position.y,(drawing?-.8:-.1)+Math.sin(elapsed*1.4)*.014,.04);model.position.z=THREE.MathUtils.lerp(model.position.z,drawing?-3.5:-.65,.04);model.rotation.y=THREE.MathUtils.lerp(model.rotation.y,s.motion?pointer.x*.06:0,.03);model.rotation.x=THREE.MathUtils.lerp(model.rotation.x,s.motion&&['listening','thinking'].includes(s.action)?.025:0,.03);
    const resolved=resolveWitchAction(s.view,s.action,s.motion);
    if(resolved!==previousAction){previousAction=resolved;const clip=THREE.AnimationClip.findByName(clips,witchModelConfig.clips[resolved]);if(clip){activeClip?.fadeOut(.2);activeClip=mixer.clipAction(clip).reset();activeClip.setLoop(singleWitchActions.has(resolved)?THREE.LoopOnce:THREE.LoopRepeat,singleWitchActions.has(resolved)?1:Infinity);activeClip.clampWhenFinished=singleWitchActions.has(resolved);activeClip.fadeIn(['drawing','reveal'].includes(resolved)?.06:.25).play();if(!s.motion){mixer.stopAllAction();activeClip.reset().play();mixer.setTime(0);}}}
    if(clips.length){mixer.update(dt*speed);const head=model.getObjectByName('Head');if(head&&s.motion&&['idle','listening'].includes(resolved)){head.rotation.y+=pointer.x*.12;head.rotation.x+=pointer.y*.04;}}
    else {const left=model.getObjectByName('ArmLeft'),right=model.getObjectByName('ArmRight');const gesture=['drawing','speaking'].includes(s.action);if(left)left.rotation.x=THREE.MathUtils.lerp(left.rotation.x,s.motion?(gesture?-.10:Math.sin(elapsed)*.009):0,.035);if(right)right.rotation.z=THREE.MathUtils.lerp(right.rotation.z,s.motion?(gesture?-.1:Math.sin(elapsed+.7)*.007):0,.035);}
   }
   renderer.render(scene,camera);
  }
  animate();
  function disposeObject(o){o.geometry?.dispose();const materials=Array.isArray(o.material)?o.material:[o.material];materials.filter(Boolean).forEach(m=>{Object.values(m).forEach(v=>v?.isTexture&&v.dispose());m.dispose();});}
  return()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('pointermove',move);scene.remove(living.group);living.dispose();scene.traverse(disposeObject);mixer?.stopAllAction();renderer.dispose();renderer.domElement.remove();};
 },[]);
 return <div className="webgl" ref={host} aria-hidden="true" data-witch-pose={seatedPose(view,action,panel)}/>;
}
