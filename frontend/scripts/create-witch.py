"""Original procedural draped witch. Run with Blender --background --python.
Meshes are deliberately separate for runtime pose animation; no third-party model.
"""
import bpy, math, os
from mathutils import Vector
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
out=os.path.abspath(os.path.join(os.path.dirname(__file__),'../public/models'))
os.makedirs(out,exist_ok=True)
def mat(name,color,metal=0,rough=.65):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if name=='Midnight velvet':
  n=m.node_tree.nodes.new('ShaderNodeTexNoise');n.inputs['Scale'].default_value=115
  b=m.node_tree.nodes.new('ShaderNodeBump');b.inputs['Strength'].default_value=.18;b.inputs['Distance'].default_value=.025
  m.node_tree.links.new(n.outputs['Fac'],b.inputs['Height']);m.node_tree.links.new(b.outputs['Normal'],p.inputs['Normal'])
 return m
cloth=mat('Midnight velvet',(.012,.006,.024));inner=mat('Lightless hood',(0,0,0));silver=mat('Antique silver',(.25,.21,.29),.65,.5);skin=mat('Porcelain hands',(.27,.20,.23),0,.8)
texture_path=os.path.abspath(os.path.join(out,'../assets/velvet.png'))
if os.path.exists(texture_path):
 tex=cloth.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(texture_path)
 cloth.node_tree.links.new(tex.outputs['Color'],cloth.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
def mesh(name,verts,faces,material):
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob);ob.data.materials.append(material)
 for p in me.polygons:p.use_smooth=True
 uv=me.uv_layers.new(name='FabricUV')
 for polygon in me.polygons:
  for li in polygon.loop_indices:
   co=me.vertices[me.loops[li].vertex_index].co
   uv.data[li].uv=((math.atan2(co.y,co.x)+math.pi)/(2*math.pi)*2,co.z*.7)
 return ob
def path(name,points,radius,material):
 cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.bevel_depth=radius;cu.bevel_resolution=3
 s=cu.splines.new('POLY');s.points.add(len(points)-1)
 for p,co in zip(s.points,points):p.co=(*co,1)
 ob=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(ob);ob.data.materials.append(material);return ob
root=bpy.data.objects.new('WitchRoot',None);bpy.context.collection.objects.link(root)
# Dense swept rings create actual fluted fabric geometry, narrowing into shoulders.
vs=[];fs=[];N=128;R=48
for j in range(R):
 t=j/(R-1);z=.05+2.08*t;rx=1.0-.56*t+.27*math.exp(-((t-.88)/.14)**2);ry=.50-.25*t
 for i in range(N):
  a=2*math.pi*i/N;fold=(.045*math.sin(a*17+t*3)+.017*math.sin(a*31-t*5))*(1-.4*t)
  vs.append(((rx+fold)*math.cos(a),(ry+fold)*math.sin(a),z))
for j in range(R-1):
 for i in range(N):a=j*N+i;b=j*N+(i+1)%N;fs.append((a,b,b+N,a+N))
body=mesh('Robe',vs,fs,cloth);body.parent=root
# Open hood: angular cathedral arch along the front rim; rounds toward the back.
vs=[];fs=[];N=96;R=40
for j in range(R):
 t=j/(R-1)
 for i in range(N):
  a=2*math.pi*i/N
  x=.63*math.cos(a)*(1-.88*t)
  z=2.70+.88*math.sin(a)*(1-.65*t)+.28*max(0,math.sin(a))**8
  y=-.33+.86*t+.05*math.sin(a*13+t*6)*math.sin(math.pi*t)
  vs.append((x,y,z))
for j in range(R-1):
 for i in range(N):a=j*N+i;b=j*N+(i+1)%N;fs.append((a,b,b+N,a+N))
hood=mesh('Hood',vs,fs,cloth);hood.parent=root
solid=hood.modifiers.new('Velvet thickness','SOLIDIFY');solid.thickness=.035
# Layered front drape narrows the shadow opening and creates a substantial hood.
vs=[];fs=[];N=128;R=20
for j in range(R):
 t=j/(R-1)
 for i in range(N):
  a=2*math.pi*i/N
  rx=.35+(.66-.35)*t;rz=.60+(.89-.60)*t
  x=rx*math.cos(a);z=2.72+rz*math.sin(a)+(.12+.17*t)*max(0,math.sin(a))**8
  y=-.39-.13*math.sin(math.pi*t)+.016*math.sin(a*17+t*8)*math.sin(math.pi*t)
  vs.append((x,y,z))
for j in range(R-1):
 for i in range(N):a=j*N+i;b=j*N+(i+1)%N;fs.append((a,b,b+N,a+N))
front_drape=mesh('Layered hood drape',vs,fs,cloth);front_drape.parent=root
ob=path('Inner hood piping',[(.35*math.cos(a),-.403,2.72+.60*math.sin(a)+.12*max(0,math.sin(a))**8) for a in [2*math.pi*i/128 for i in range(129)]],.005,silver);ob.parent=root
for offset in [0,.026]:
 pts=[(.63*math.cos(a)*(1+offset),-.344,2.70+.88*math.sin(a)+.28*max(0,math.sin(a))**8) for a in [2*math.pi*i/128 for i in range(129)]]
 trim=path('Hood silver piping',pts,.008,silver);trim.parent=root
# Black cavity behind opening is geometry, intentionally no face.
bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=24,location=(0,.16,2.73));cavity=bpy.context.object;cavity.name='Hood shadow';cavity.scale=(.54,.25,.81);cavity.data.materials.append(inner);cavity.parent=root
for p in cavity.data.polygons:p.use_smooth=True
for side in [-1,1]:
 pivot=bpy.data.objects.new('ArmLeft' if side<0 else 'ArmRight',None);bpy.context.collection.objects.link(pivot);pivot.parent=root
 vs=[];fs=[];N=64;R=32
 for j in range(R):
  t=j/(R-1);center=Vector((side*(.53+.33*math.sin(math.pi*t)-.1*t), -.04-.80*t,2.04-.62*t));rad=.26+.10*math.sin(math.pi*t)
  tangent=Vector((side*(.33*math.pi*math.cos(math.pi*t)-.1),-.8,-.62)).normalized();u=tangent.cross(Vector((0,0,1))).normalized();v=tangent.cross(u).normalized()
  for i in range(N):
   a=i*2*math.pi/N;f=.024*math.sin(a*12+t*4)
   vs.append(tuple(center+u*(rad+f)*math.cos(a)+v*(rad+f)*math.sin(a)))
 for j in range(R-1):
  for i in range(N):a=j*N+i;b=j*N+(i+1)%N;fs.append((a,b,b+N,a+N))
 sleeve=mesh('Draped sleeve',vs,fs,cloth);sleeve.parent=pivot
 # Subtle silver cuff follows the actual swept cross-section.
 pts=[tuple(center+u*(rad+.005)*math.cos(a)+v*(rad+.005)*math.sin(a)) for a in [2*math.pi*j/80 for j in range(81)]]
 ob=path('Sleeve embroidery',pts,.008,silver);ob.parent=pivot
 bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16,location=(side*.44,-.93,1.42));ob=bpy.context.object;ob.name='Hand';ob.scale=(.16,.23,.065);ob.data.materials.append(skin);ob.parent=pivot
 for f in range(4):
  x=side*(.32+.073*f);points=[(x,-1,1.42),(x-side*.02,-1.19,1.43),(x-side*.04,-1.28+.018*abs(f-1),1.40)]
  ob=path('Finger',points,.024,skin);ob.parent=pivot
# Silver necklace drapes and crescent clasp.
for k in range(2):
 ob=path('Necklace',[(.44*math.cos(a),-.38-.02*k,2.10-.28*math.sin(a)-.06*k) for a in [math.pi*i/60 for i in range(61)]],.008,silver);ob.parent=root
ob=path('Crescent clasp',[(.1*math.cos(a),-.43,2.09+.1*math.sin(a)) for a in [math.pi*.32+math.pi*1.36*i/50 for i in range(51)]],.019,silver);ob.parent=root
# Export reloadable source and interchange model, runtime owns smooth pose state.
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out,'witch.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(out,'witch.glb'),export_format='GLB',export_apply=True)
print('WITCH_MODEL_READY',out)
