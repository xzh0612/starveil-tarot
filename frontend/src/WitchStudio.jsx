import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {witchModelConfig} from './services';
import './witch-studio.css';

const labels={Idle:'待机呼吸',Greeting:'入场迎接',Listening:'侧头倾听',Thinking:'低头思考',Shuffle:'双手洗牌',Offer:'等待选牌',Drawing:'抽牌引导',Reveal:'翻牌手势',Speaking:'解读回应'};
export function WitchStudio({onClose}){
 const host=useRef(null),api=useRef(null),[info,setInfo]=useState('正在加载真实模型…'),[clip,setClip]=useState('Idle'),[playing,setPlaying]=useState(true),[wire,setWire]=useState(false);
 useEffect(()=>{
  const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setClearColor(0x14101d);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;host.current.appendChild(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,1,.05,100);camera.position.set(0,2.4,7.2);
  const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,1.9,0);controls.enableDamping=true;controls.minDistance=2;controls.maxDistance=10;
  scene.add(new THREE.HemisphereLight(0xd5c5ef,0x302334,2));
  for(const [color,intensity,x,y,z] of [[0xddd6ff,4,-3,5,4],[0x9571db,5,3,4,-3],[0xffdbc5,1.5,3,2,4]]){const light=new THREE.DirectionalLight(color,intensity);light.position.set(x,y,z);scene.add(light);}
  const floor=new THREE.Mesh(new THREE.CylinderGeometry(1.4,1.5,.06,80),new THREE.MeshStandardMaterial({color:0x241c31,roughness:.7,metalness:.2}));floor.position.y=-.04;scene.add(floor);
  let model,mixer,current,animations=[],disposed=false,frame,last=performance.now(),running=true;
  const dispose=o=>{o.geometry?.dispose();for(const m of (Array.isArray(o.material)?o.material:[o.material]).filter(Boolean)){Object.values(m).forEach(v=>v?.isTexture&&v.dispose());m.dispose();}};
  new GLTFLoader().loadAsync(witchModelConfig.url).then(g=>{
   if(disposed){g.scene.traverse(dispose);return;}model=g.scene;scene.add(model);animations=g.animations;mixer=new THREE.AnimationMixer(model);
   let skins=0;const bones=new Set();model.traverse(o=>{if(o.isSkinnedMesh){skins++;o.skeleton.bones.forEach(b=>bones.add(b.uuid));}});
   setInfo(`${bones.size} 根骨骼 · ${skins} 个蒙皮网格 · ${animations.length} 段动画`);api.current.play('Idle');
  }).catch(()=>{if(!disposed)setInfo('模型加载失败，请关闭后重新打开。');});
  api.current={play(name){if(!mixer)return;const next=THREE.AnimationClip.findByName(animations,name);if(!next)return;current?.fadeOut(.2);current=mixer.clipAction(next).reset().fadeIn(.2).play();},pause(value){running=!value;},wire(value){model?.traverse(o=>{if(o.material)o.material.wireframe=value;});},view(name){const p={front:[0,2.4,7.2],side:[6,2.4,0],back:[0,2.4,-7.2],face:[.3,3.03,2.2]}[name];camera.position.set(...p);controls.target.set(0,name==='face'?2.98:1.9,0);controls.update();}};
  const resize=()=>{if(!host.current)return;const {clientWidth:w,clientHeight:h}=host.current;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();};const ro=new ResizeObserver(resize);ro.observe(host.current);resize();
  const tick=()=>{frame=requestAnimationFrame(tick);const now=performance.now(),dt=Math.min((now-last)/1000,.05);last=now;if(document.hidden)return;if(running)mixer?.update(dt);controls.update();renderer.render(scene,camera);};tick();
  return()=>{disposed=true;cancelAnimationFrame(frame);ro.disconnect();controls.dispose();mixer?.stopAllAction();scene.traverse(dispose);renderer.dispose();renderer.domElement.remove();api.current=null;};
 },[]);
 return <section className="witch-studio" role="dialog" aria-modal="true" aria-label="女巫模型室"><header><div><span className="eyebrow">NYX · MODEL STUDY 02</span><h2>女巫模型室</h2><small>{info}</small></div><button className="text-button" onClick={onClose}>返回占卜室 ×</button></header><div className="studio-canvas" ref={host}/><aside><p>拖动旋转 · 滚轮缩放<br/>同一个真实 GLB，查看各角度与骨骼动作。</p><div className="studio-views">{[['front','正面'],['side','侧面'],['back','背面'],['face','面部']].map(([id,label])=><button key={id} onClick={()=>api.current?.view(id)}>{label}</button>)}</div><h3>动作试播</h3><div className="studio-actions">{Object.entries(labels).map(([id,label])=><button key={id} aria-pressed={clip===id} onClick={()=>{setClip(id);api.current?.play(id);}}>{label}</button>)}</div><button onClick={()=>{setPlaying(!playing);api.current?.pause(playing);}}>{playing?'暂停动作':'播放动作'}</button><label><input type="checkbox" checked={wire} onChange={e=>{setWire(e.target.checked);api.current?.wire(e.target.checked);}}/> 查看网格线框</label><p className="studio-note">当前为原创程序建模初版。已绑定骨骼；精细面雕、布料模拟、口型和精准抓牌仍待制作。短动作在此循环试播，实际牌局中只播放一次。</p></aside></section>;
}
