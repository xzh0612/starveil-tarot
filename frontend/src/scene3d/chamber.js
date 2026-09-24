import * as THREE from 'three';

// All furnishings are independent meshes in world space. No room image plane.
export function createChamber(){
 const group=new THREE.Group();group.name='Starveil_Chamber';
 const wood=new THREE.MeshStandardMaterial({color:0x271b32,roughness:.68});
 const stone=new THREE.MeshStandardMaterial({color:0x211c30,roughness:.95});
 const brass=new THREE.MeshStandardMaterial({color:0xa78b61,metalness:.72,roughness:.38});
 const plum=new THREE.MeshStandardMaterial({color:0x4a2d59,roughness:.93});
 function mesh(name,geometry,material,position,parent=group){const object=new THREE.Mesh(geometry,material);object.name=name;object.position.set(...position);object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;}
 function box(name,size,mat,pos,parent){return mesh(name,new THREE.BoxGeometry(...size),mat,pos,parent);}
 function ring(name,r,thickness,pos,parent=group){return mesh(name,new THREE.TorusGeometry(r,thickness,8,96),brass,pos,parent);}
 box('Back wall',[18,11,.3],stone,[0,4,-6]);
 box('Floor',[20,.15,20],wood,[0,-.2,0]);
 // Recessed celestial window with actual frame depth and radial tracery.
 const sky=new THREE.MeshBasicMaterial({color:0x302347});
 mesh('Window night glass',new THREE.CircleGeometry(2.75,96),sky,[0,4.2,-5.8]);
 for(const radius of [2.77,2.63,2.49])ring('Window bronze tracery',radius,.025,[0,4.2,-5.73]);
 for(let i=0;i<12;i++){const a=i*Math.PI/6;const bar=box('Radial window mullion',[.023,5.15,.06],brass,[0,4.2,-5.7]);bar.rotation.z=a;}
 const moonMaterial=new THREE.MeshStandardMaterial({color:0xe3d6f5,emissive:0xb69acb,emissiveIntensity:.9,roughness:1});
 mesh('Moon',new THREE.SphereGeometry(.46,32,24),moonMaterial,[.9,5.2,-5.5]);
 // Bookshelves with individual spines, rails, shelves and small gilt details.
 for(const side of [-1,1]){
  const shelf=new THREE.Group();shelf.name=side<0?'Archive shelf':'Card atlas shelf';shelf.position.set(side*4.65,0,-4.6);group.add(shelf);
  box('Shelf back',[3.2,6.7,.16],wood,[0,3.1,-.45],shelf);
  for(const x of [-1.67,1.67])box('Shelf upright',[.18,6.85,.9],wood,[x,3.1,0],shelf);
  for(let row=0;row<5;row++){
   const y=row*1.3+.2;box('Shelf ledge',[3.5,.12,1.05],wood,[0,y,0],shelf);box('Gilt ledge',[3.5,.015,.025],brass,[0,y+.065,.535],shelf);
   for(let i=0;i<12;i++){
    const seed=Math.sin((i+row*13+side*41)*127.1)*.5+.5;
    const mat=new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(.70+seed*.12,.19+seed*.1,.09+seed*.09),roughness:.8});
    const book=box('Archive book',[.18+seed*.06,.7+seed*.35,.54],mat,[-1.43+i*.26,y+.42+seed*.175,.13],shelf);
    book.rotation.z=(seed-.5)*.09;
    for(const dy of [-.27,.27])box('Spine gold band',[.19,.016,.008],brass,[book.position.x,book.position.y+dy,.408],shelf);
   }
  }
 }
 // Fluted drapes: continuous geometry, not an image of curtains.
 const curtains=[];
 for(const side of [-1,1]){
  const geometry=new THREE.PlaneGeometry(2.2,8,32,48);const p=geometry.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i);p.setZ(i,Math.sin(x*15)*.13);p.setX(i,x+side*Math.pow((y+4)/8,2)*.22);}
  geometry.computeVertexNormals();const curtain=mesh('Pleated velvet curtain',geometry,new THREE.MeshStandardMaterial({color:0x382044,roughness:.96,side:THREE.DoubleSide}),[side*7.1,3.4,-3.2]);curtains.push(curtain);
 }
 const table=new THREE.Group();table.name='Reading table';group.add(table);table.position.set(0,1.24,1.5);
 const top=mesh('Carved table rim',new THREE.CylinderGeometry(4.6,4.6,.18,128),wood,[0,0,0],table);top.scale.z=.69;
 const fabric=new THREE.MeshStandardMaterial({color:0x746081,roughness:.97});
 const cloth=mesh('Lavender velvet surface',new THREE.CylinderGeometry(4.51,4.51,.018,128),fabric,[0,.1,0],table);cloth.scale.z=.69;
 let disposed=false;
 new THREE.TextureLoader().load('/assets/velvet.png',texture=>{if(disposed){texture.dispose();return;}texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(3,3);fabric.map=texture;fabric.needsUpdate=true;});
 for(const r of [4.54,4.6]){const trim=ring('Table gilt lip',r,.016,[0,.04,0],table);trim.rotation.x=-Math.PI/2;trim.scale.y=.69;}
 const runes=new THREE.Group();runes.name='Inlaid astrolabe';runes.position.set(0,.116,0);table.add(runes);
 for(const r of [1.9,2.08,2.63]){const line=ring('Astrolabe ring',r,.006,[0,0,0],runes);line.rotation.x=-Math.PI/2;}
 for(let i=0;i<48;i++){const a=i/48*Math.PI*2;const tick=box('Astrolabe tick',[.01,.003,i%4===0?.13:.045],brass,[Math.sin(a)*2.54,0,Math.cos(a)*2.54],runes);tick.rotation.y=a;}
 // Flame meshes and candle light share one animation signal.
 const candles=[];const wax=new THREE.MeshStandardMaterial({color:0xcbb7a5,roughness:.85});
 for(const side of [-1,1])for(let i=0;i<3;i++){
  const x=side*(3.35+i*.21),z=.15+i*.3,h=.34+i*.2;
  mesh('Candle socket',new THREE.CylinderGeometry(.11,.15,.07,20),brass,[x,.16,z],table);
  mesh('Wax candle',new THREE.CylinderGeometry(.065,.07,h,20),wax,[x,.2+h/2,z],table);
  const flame=mesh('Candle flame',new THREE.SphereGeometry(.045,12,10),new THREE.MeshBasicMaterial({color:0xffdb9d}),[x,.25+h,z],table);flame.scale.set(.7,2,1);
  let light=null;if(i===1){light=new THREE.PointLight(0xffbd79,4,6,2);light.position.set(x,.4+h,z);table.add(light);}candles.push({flame,light,phase:i*2+side});
 }
 const globe=mesh('Crystal sphere',new THREE.SphereGeometry(.28,36,24),new THREE.MeshPhysicalMaterial({color:0xa69cc7,metalness:.25,roughness:.12,transparent:true,opacity:.72,clearcoat:1}),[-2.6,.5,.1],table);
 mesh('Crystal brass cradle',new THREE.CylinderGeometry(.19,.27,.17,32),brass,[-2.6,.22,.1],table);
 return {group,table,update(time,motion){candles.forEach(({flame,light,phase})=>{const v=motion?Math.sin(time*6+phase)*.08+Math.sin(time*11+phase)*.04:0;flame.scale.y=2+v*3;if(light)light.intensity=4+v*3;});curtains.forEach((c,i)=>{c.rotation.y=motion?Math.sin(time*.45+i)*.012:0;});globe.rotation.y=time*.07;},dispose(){disposed=true;}};
}
