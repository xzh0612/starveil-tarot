import * as THREE from 'three';

export const WITCH_PORTRAIT_URL='/assets/witch-moonlit-v3.png';
// A live 2.5D illustration: UV-local fabric deformation, cloth-only shimmer,
// and separate moving particles. No claim of skeletal or physical simulation.
export function createLivingWitch({onReady=()=>{},onError=()=>{}}={}){
 const group=new THREE.Group();let disposed=false;
 const uniforms={map:{value:null},time:{value:0},wind:{value:1},gesture:{value:0},pointer:{value:new THREE.Vector2()},flow:{value:1}};
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms,
  vertexShader:`varying vec2 vUv;uniform float time;uniform float wind;uniform float gesture;uniform vec2 pointer;
  void main(){vUv=uv;vec3 p=position;float side=smoothstep(.10,.28,abs(uv.x-.5));
  float headLock=1.-smoothstep(.11,.20,length((uv-vec2(.5,.81))*vec2(1.,1.2)));
  float hair=side*smoothstep(.4,.6,uv.y)*(1.-smoothstep(.88,.97,uv.y));
  float hem=pow(1.-uv.y,1.7);float sleeves=side*(1.-smoothstep(.58,.72,uv.y))*smoothstep(.12,.28,uv.y);
  float wave=sin(time*1.18+uv.y*10.+uv.x*3.);float lag=sin(time*.78+uv.y*15.-uv.x*5.);
  p.x+=(wave*(hem*.11+hair*.045+sleeves*.065)+pointer.x*.04*hem)*wind*(1.-headLock);
  p.y+=(lag*(hem*.035+hair*.023+sleeves*.045)+sin(time*2.)*gesture*sleeves*.055)*wind;
  p.z+=(wave*(hem*.11+sleeves*.08+hair*.04))*wind;
  p.y+=sin(time*1.05)*.010*(1.-hem)*wind;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
  fragmentShader:`varying vec2 vUv;uniform sampler2D map;uniform float time;uniform float flow;
  void main(){vec4 c=texture2D(map,vUv);if(c.a<.015)discard;
  float cloth=(1.-smoothstep(.64,.76,vUv.y))*smoothstep(.04,.2,vUv.y);
  float violet=smoothstep(-.015,.075,c.b-c.g);float silver=smoothstep(.30,.75,dot(c.rgb,vec3(.2126,.7152,.0722)));
  float ribbon=pow(.5+.5*sin(vUv.y*27.+sin(vUv.x*18.)*2.-time*1.4),16.);
  float sparkle=pow(max(0.,sin(vUv.x*171.+time*.5)*sin(vUv.y*137.-time*1.1)),28.);
  c.rgb+=vec3(.28,.16,.46)*flow*cloth*violet*(ribbon*(.12+silver*.25)+sparkle*.65);
  gl_FragColor=c;
  #include <colorspace_fragment>
  }`});
 const plane=new THREE.Mesh(new THREE.PlaneGeometry(3.05,4.58,70,100),material);group.add(plane);
 const texture=new THREE.TextureLoader().load(WITCH_PORTRAIT_URL,t=>{if(disposed){t.dispose();return;}t.colorSpace=THREE.SRGBColorSpace;uniforms.map.value=t;plane.scale.x=(t.image.width/t.image.height)/(3.05/4.58);onReady();},undefined,onError);
 const count=240,seeds=new Float32Array(count*3);
 for(let i=0;i<count;i++){seeds[i*3]=i/count;seeds[i*3+1]=Math.random();seeds[i*3+2]=Math.random();}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(seeds,3));
 const particleMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{time:uniforms.time,strength:{value:1}},vertexShader:`varying float alpha;uniform float time;void main(){float t=fract(position.x+time*.035);float s=position.y>.5?1.:-1.;float y=-1.95+t*3.45;float x=s*(.42+sin(t*3.14159)*.72)+sin(t*13.+time*.65)*.08;vec3 p=vec3(x,y,.08+sin(t*8.+time*.3)*.22);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp((10.+position.z*22.)/-mv.z,1.,5.);alpha=sin(t*3.14159)*(.25+.65*position.z);}`,fragmentShader:`varying float alpha;uniform float strength;void main(){float d=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(.78,.62,1.,pow(max(0.,1.-d),2.)*alpha*strength);}`});
 const sparks=new THREE.Points(geo,particleMat);group.add(sparks);let time=0;
 return {group,update(dt,{motion=true,particles=true,action='idle',pointer=new THREE.Vector2(),wind=1}={}){if(motion)time+=dt;uniforms.time.value=time;uniforms.wind.value=THREE.MathUtils.lerp(uniforms.wind.value,motion?wind:0,.08);uniforms.pointer.value.lerp(pointer,.05);uniforms.gesture.value=THREE.MathUtils.lerp(uniforms.gesture.value,['drawing','shuffle','speaking','reveal'].includes(action)?1:0,.06);uniforms.flow.value=particles?1:0;particleMat.uniforms.strength.value=particles?1:0;},dispose(){disposed=true;texture.dispose();plane.geometry.dispose();material.dispose();geo.dispose();particleMat.dispose();}};
}
