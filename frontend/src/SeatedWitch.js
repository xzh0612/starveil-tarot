import * as THREE from 'three';
export const SEATED_WITCH_URL='/assets/witch-seated-v4.png';
export function createSeatedWitch({onReady=()=>{},onError=()=>{}}={}){
 const group=new THREE.Group();let disposed=false,elapsed=0;
 const uniforms={map:{value:null},time:{value:0},pose:{value:0},wind:{value:1},flow:{value:1},pointer:{value:new THREE.Vector2()},aspect:{value:1}};
 const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:false,uniforms,
 vertexShader:`varying vec2 vUv;uniform float time;uniform float wind;uniform vec2 pointer;void main(){vUv=uv;vec3 p=position;
 float outer=smoothstep(.15,.32,abs(uv.x-.5));float hair=outer*smoothstep(.30,.50,uv.y)*(1.-smoothstep(.86,.96,uv.y));
 float silk=outer*smoothstep(.18,.32,uv.y)*(1.-smoothstep(.55,.7,uv.y));
 float faceLock=1.-smoothstep(.13,.25,length((uv-vec2(.5,.7))*vec2(1.,1.2)));
 float contact=smoothstep(.12,.28,uv.y);float wave=sin(time*.9+uv.y*10.+uv.x*4.);
 p.x+=wind*contact*(1.-faceLock)*(wave*(hair*.028+silk*.038)+pointer.x*.01*silk);
 p.y+=wind*contact*(1.-faceLock)*sin(time*.73+uv.y*13.)*(hair*.012+silk*.02);
 p.z+=wind*silk*.025*wave;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
 fragmentShader:`varying vec2 vUv;uniform sampler2D map;uniform float pose;uniform float time;uniform float flow;
 vec4 cutout(vec2 uv){vec4 c=texture2D(map,uv);float spill=c.g-max(c.r,c.b);c.a*=1.-smoothstep(.055,.36,spill);if(spill>0.)c.g=min(c.g,max(c.r,c.b)*1.06+.008);return c;}
 void main(){vec4 a=cutout(vec2(vUv.x*.5,vUv.y));vec4 b=cutout(vec2(.5+vUv.x*.5,vUv.y));
 float alpha=mix(a.a,b.a,pose);if(alpha<.015)discard;vec3 rgb=mix(a.rgb*a.a,b.rgb*b.a,pose)/max(alpha,.001);
 float cloth=smoothstep(.18,.3,vUv.y)*(1.-smoothstep(.55,.65,vUv.y));float purple=smoothstep(.015,.09,rgb.b-rgb.g);
 float glint=pow(.5+.5*sin(vUv.y*32.+sin(vUv.x*16.)*2.-time*1.2),18.);
 rgb+=vec3(.22,.12,.35)*flow*cloth*purple*glint*.22;
 gl_FragColor=vec4(rgb*vec3(.90,.88,.94),alpha);
 #include <colorspace_fragment>
 }`});
 const plane=new THREE.Mesh(new THREE.PlaneGeometry(2.7,2.7,70,70),mat);plane.visible=false;plane.renderOrder=2;group.add(plane);
 const texture=new THREE.TextureLoader().load(SEATED_WITCH_URL,t=>{if(disposed){t.dispose();return;}t.colorSpace=THREE.SRGBColorSpace;uniforms.map.value=t;plane.scale.x=t.image.width/t.image.height/2;plane.visible=true;onReady();},undefined,onError);
 // Contact shade on the same world tabletop under the palms, not behind a full-body cutout.
 const shadows=[];
 for(const x of [-.55,.55]){
  const shade=new THREE.Mesh(new THREE.PlaneGeometry(.55,.35),new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{},vertexShader:`varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec2 v;void main(){float d=length((v-.5)*2.);gl_FragColor=vec4(.015,.006,.023,.3*pow(max(0.,1.-d),2.));}`}));
  shade.rotation.x=-Math.PI/2;shade.position.set(x,-1.045,.13);group.add(shade);shadows.push(shade);
 }
 return {group,update(dt,{pose='visitor',motion=true,particles=true,pointer=new THREE.Vector2()}={}){if(motion)elapsed+=dt;uniforms.time.value=elapsed;const target=pose==='table'||pose==='quiet'?1:0;uniforms.pose.value=motion?THREE.MathUtils.damp(uniforms.pose.value,target,8,dt):target;uniforms.wind.value=THREE.MathUtils.damp(uniforms.wind.value,motion?(pose==='quiet'?.25:.65):0,7,dt);uniforms.flow.value=particles?.75:0;uniforms.pointer.value.lerp(pointer,.04);},dispose(){disposed=true;texture.dispose();plane.geometry.dispose();mat.dispose();shadows.forEach(s=>{s.geometry.dispose();s.material.dispose();});}};
}
