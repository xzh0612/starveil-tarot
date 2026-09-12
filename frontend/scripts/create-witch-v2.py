"""Original mesh + weighted armature + nine actions. No character image planes.
Blender 5.x: blender --background --python scripts/create-witch-v2.py
"""
import bpy, math, os, json
from mathutils import Vector
from math import sin, cos, pi

OUT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../public/models'))
os.makedirs(OUT,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)

def material(name,color,metal=0,rough=.65):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 m.use_backface_culling=False
 return m
velvet=material('Violet woven velvet',(.075,.032,.115),.02,.86)
lining=material('Dusty violet satin lining',(.19,.105,.24),.06,.57)
dark=material('Hood inner cloth',(.014,.009,.024),0,.96)
silver=material('Oxidized moon silver',(.39,.33,.43),.8,.32)
skin=material('Cool porcelain skin',(.38,.27,.31),0,.64)
maskmat=material('Opaque plum face veil',(.032,.022,.053),.02,.9)
white=material('Muted eye sclera',(.40,.40,.43),0,.35)
iris=material('Smoky lavender iris',(.18,.12,.25),.12,.29)
pupil=material('Pupil',(.005,.004,.009),0,.2)

arm=bpy.data.armatures.new('NyxSkeleton');rig=bpy.data.objects.new('NyxRig',arm);bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
def bone(name,head,tail,parent=None):
 b=arm.edit_bones.new(name);b.head=head;b.tail=tail
 if parent:b.parent=arm.edit_bones[parent]
 return b
bone('Root',(0,0,0),(0,0,.5))
bone('Spine',(0,0,1.2),(0,0,1.85),'Root')
bone('Chest',(0,0,1.85),(0,0,2.35),'Spine')
bone('Neck',(0,0,2.35),(0,0,2.65),'Chest')
bone('Head',(0,0,2.65),(0,0,3.23),'Neck')
for side,sgn in [('L',-1),('R',1)]:
 shoulder=(sgn*.57,0,2.26);elbow=(sgn*.78,-.28,1.85);wrist=(sgn*.53,-.83,1.49)
 bone('UpperArm.'+side,shoulder,elbow,'Chest');bone('Forearm.'+side,elbow,wrist,'UpperArm.'+side)
 bone('Hand.'+side,wrist,(sgn*.53,-1.03,1.48),'Forearm.'+side)
 for f in range(5):
  if f==0:pts=[(sgn*.415,-.91,1.47),(sgn*.365,-1.00,1.46),(sgn*.38,-1.08,1.435)]
  else:
   x=sgn*(.433+(f-1)*.058);length=[.245,.28,.255,.195][f-1]
   pts=[(x,-1.005,1.475),(x,-1.005-length*.53,1.457),(x,-1.005-length,1.425)]
  bone(f'Finger{f}A.{side}',pts[0],pts[1],'Hand.'+side);bone(f'Finger{f}B.{side}',pts[1],pts[2],f'Finger{f}A.{side}')
bpy.ops.object.mode_set(mode='OBJECT');rig.select_set(False)

objects=[]
def bind(ob,weights):
 ob.parent=rig
 for i,ws in enumerate(weights):
  for name,w in ws.items():
   g=ob.vertex_groups.get(name) or ob.vertex_groups.new(name=name);g.add([i],w,'REPLACE')
 mod=ob.modifiers.new('Nyx skin','ARMATURE');mod.object=rig
 objects.append(ob);return ob
def mesh(name,verts,faces,mat,weights='Root'):
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob);ob.data.materials.append(mat)
 for p in me.polygons:p.use_smooth=True
 return bind(ob,[{weights:1} for _ in verts] if isinstance(weights,str) else weights)
def sphere(name,loc,scale,mat,b='Head',segments=32,rings=20):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=loc);ob=bpy.context.object;ob.name=name;ob.scale=scale
 bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);ob.data.materials.append(mat)
 for p in ob.data.polygons:p.use_smooth=True
 return bind(ob,[{b:1} for _ in ob.data.vertices])
def tube(name,pts,radius,mat,b='Head',n=8):
 vs=[];faces=[]
 for j,point in enumerate(pts):
  p=Vector(point);t=(Vector(pts[min(j+1,len(pts)-1)])-Vector(pts[max(0,j-1)])).normalized();u=t.cross(Vector((0,1,0)))
  if u.length<.01:u=t.cross(Vector((1,0,0)))
  u.normalize();v=t.cross(u).normalized();r=radius(j/(len(pts)-1)) if callable(radius) else radius
  for k in range(n):vs.append(tuple(p+r*(u*cos(2*pi*k/n)+v*sin(2*pi*k/n))))
 for j in range(len(pts)-1):
  for k in range(n):a=j*n+k;q=j*n+(k+1)%n;faces.append((a,q,q+n,a+n))
 faces += [tuple(range(n-1,-1,-1)),tuple((len(pts)-1)*n+k for k in range(n))]
 return mesh(name,vs,faces,mat,b)
def surface(name,nu,nv,func,mat,b,wrap=True):
 vs=[];weights=[];faces=[]
 for j in range(nv):
  t=j/(nv-1)
  for i in range(nu):
   u=i/nu if wrap else i/(nu-1);vs.append(func(u,t));weights.append(b(t) if callable(b) else {b:1})
 for j in range(nv-1):
  for i in range(nu if wrap else nu-1):a=j*nu+i;q=j*nu+(i+1)%nu;faces.append((a,q,q+nu,a+nu))
 return mesh(name,vs,faces,mat,weights)

# Layered skirt and fitted torso: actual longitudinal cloth folds.
surface('Heavy fluted skirt',96,28,lambda u,t:((.93-.55*t+.035*sin(u*2*pi*18+t*2))*cos(u*2*pi),(.52-.25*t+.025*sin(u*2*pi*18+t*2))*sin(u*2*pi),.06+t*1.59),velvet,lambda t:{'Root':1-max(0,(t-.65)/.35)*.65,'Spine':max(0,(t-.65)/.35)*.65})
surface('Fitted bodice',64,20,lambda u,t:((.38+.23*t+.012*sin(u*2*pi*14))*cos(u*2*pi),(.265+.018*sin(pi*t))*sin(u*2*pi),1.47+.82*t),velvet,lambda t:{'Spine':1-t,'Chest':t})
surface('Shoulder mantle',96,20,lambda u,t:((.29+.49*t+.016*sin(u*2*pi*12))*cos(u*2*pi),(.21+.19*t)*sin(u*2*pi),2.44-.53*t-.06*abs(cos(u*2*pi))),lining,'Chest')
for s in [-1,1]:
 surface('Front flowing stole',22,35,lambda u,t,s=s:(s*(.13+.27*t+.12*sin(t*pi))+(u-.5)*(.18+.13*t),-.31-.075*sin(t*pi)+.026*sin(u*pi*7+t*4),2.18-t*1.95),velvet,lambda t:{'Chest':max(0,1-t*3),'Spine':min(1,t*3)*max(0,1-t),'Root':min(1,t*3)*t},False)
 tube('Stole silver seam',[(s*(.13+.27*t+.12*sin(t*pi)+.085),-.325-.075*sin(t*pi),2.18-t*1.95) for t in [i/60 for i in range(61)]],.0045,silver,'Spine')

sphere('Neck',(0,.005,2.48),(.17,.17,.27),skin,'Neck')
sphere('Covered head beneath hood',(0,-.005,2.98),(.285,.24,.415),dark)
surface('Visible eye region',40,12,lambda u,t:((u-.5)*.47,-.13-.104*sin(pi*u),3.165-.16*t),skin,'Head',False)
sphere('Nose bridge',(0,-.242,3.005),(.037,.055,.12),skin)
sphere('Nose tip',(0,-.285,2.954),(.051,.036,.039),skin)
# Almond eye geometry set into the face, not image cards.
for s in [-1,1]:
 x=s*.119
 sphere('Eye sclera',(x,-.221,3.074),(.066,.038,.022),white)
 sphere('Iris',(x,-.256,3.074),(.021,.006,.020),iris,segments=24,rings=14)
 sphere('Pupil',(x,-.262,3.074),(.009,.003,.016),pupil,segments=20,rings=12)
 tube('Upper eyelid',[(x+.083*cos(a),-.255+abs(cos(a))*.018,3.074+.035*sin(a)) for a in [pi*i/24 for i in range(25)]],.010,skin)
 tube('Lower eyelid',[(x+.081*cos(a),-.25+abs(cos(a))*.018,3.074-.029*sin(a)) for a in [pi*i/24 for i in range(25)]],.0065,skin)
 tube('Eyebrow',[(x+(t-.5)*.15,-.222,3.152+.012*sin(t*pi)) for t in [i/18 for i in range(19)]],.012,dark)
 sphere('Ear',(s*.275,.015,2.99),(.045,.039,.10),skin)
# Curved veil wraps around the lower face; top follows cheek line, lower edge drapes.
surface('Separate sculpted face veil',50,22,lambda u,t:((u-.5)*.51*(1-.19*t),-.10-.21*sin(pi*u)-.024*sin(pi*t)+.007*sin(u*pi*12)*t,2.986-.075*abs(2*u-1)-.36*t+.018*sin(u*pi*8)*t),maskmat,'Head',False)
tube('Veil upper embroidered edge',[((u-.5)*.51,-.106-.21*sin(pi*u),2.986-.075*abs(2*u-1)) for u in [i/55 for i in range(56)]],.0035,silver)
# Open, thick hood with a true back and an inner lining; no black face billboard.
def hood(u,t,inside=False):
 a=u*2*pi;r=1-.90*t;rx=.43*r;rz=.64*(1-.64*t)
 return (rx*cos(a),-.37+.79*t+(.016 if inside else 0)+.018*sin(a*11+t*5)*sin(pi*t),2.99+rz*sin(a)+.105*max(0,sin(a))**6)
surface('Outer sculpted hood',96,30,lambda u,t:hood(u,t),velvet,'Head')
surface('Inner hood lining',96,20,lambda u,t:hood(u,t,True),dark,'Head')
surface('Thick hood rolled edge',96,14,lambda u,t:((.38+.1*t)*cos(u*2*pi),-.376-.055*sin(t*pi),2.99+(.59+.09*t)*sin(u*2*pi)+.1*max(0,sin(u*2*pi))**6),lining,'Head')
tube('Hood rim silver braid',[(.435*cos(a),-.433,2.99+.637*sin(a)+.1*max(0,sin(a))**6) for a in [2*pi*i/144 for i in range(145)]],.0055,silver)
sphere('Hood closed rear',(0,.385,3.02),(.14,.07,.30),velvet)

for side,s in [('L',-1),('R',1)]:
 points=[Vector((s*.57,0,2.26)),Vector((s*.78,-.28,1.85)),Vector((s*.53,-.83,1.49))]
 def sleeve(u,t):
  ct=points[0]*(1-t)**2+points[1]*2*t*(1-t)+points[2]*t*t
  tan=((points[1]-points[0])*(1-t)+(points[2]-points[1])*t).normalized()
  ax=tan.cross(Vector((0,0,1))).normalized();ay=tan.cross(ax).normalized();a=u*2*pi;r=.205+.035*t+.01*sin(a*14+t*4)
  # Drooping lower sleeve gains fabric volume, while wrist remains above table.
  return tuple(ct+ax*r*cos(a)+ay*r*sin(a))
 def sleeveweights(t):
  f=max(0,min(1,(t-.32)/.36));return {'UpperArm.'+side:1-f,'Forearm.'+side:f}
 surface('Weighted bell sleeve '+side,64,28,sleeve,velvet,sleeveweights)
 cuff=[sleeve(i/80,1) for i in range(81)];tube('Silver cuff '+side,cuff,.006,silver,'Forearm.'+side)
 surface('Cuff inner wall '+side,64,6,lambda u,t:tuple(Vector(sleeve(u,1)).lerp(points[2]+(Vector(sleeve(u,1))-points[2])*.74,t)),lining,'Forearm.'+side)
 sphere('Wrist '+side,tuple(points[2]),(.072,.095,.052),skin,'Hand.'+side)
 sphere('Palm '+side,(s*.525,-.952,1.475),(.125,.136,.045),skin,'Hand.'+side)
 for f in range(5):
  a=arm.bones[f'Finger{f}A.{side}'];b=arm.bones[f'Finger{f}B.{side}'];p0=a.head_local;p1=a.tail_local;p2=b.tail_local
  tube('Finger proximal',[tuple(p0.lerp(p1,i/6)) for i in range(7)],lambda t:.024*(1-.13*t),skin,f'Finger{f}A.{side}',10)
  sphere('Finger knuckle',tuple(p1),(.021,.024,.022),skin,f'Finger{f}B.{side}',segments=16,rings=10)
  tube('Finger distal',[tuple(p1.lerp(p2,i/6)) for i in range(7)],lambda t:.021*(1-.42*t),skin,f'Finger{f}B.{side}',10)
  sphere('Finger tip',tuple(p2),(.013,.017,.014),skin,f'Finger{f}B.{side}',segments=16,rings=10)
 # A single modest silver ring keeps hands readable.
 tube('Silver finger band',[(s*.491+.024*cos(a),-1.11,1.466+.023*sin(a)) for a in [2*pi*i/32 for i in range(33)]],.0035,silver,'Finger2A.'+side)
for k in [0,1]:
 tube('Draped silver chain',[(.36*cos(a),-.345-.012*k,2.25-.17*sin(a)-.045*k) for a in [pi*i/60 for i in range(61)]],.004,silver,'Chest')
tube('Moon clasp',[(.066*cos(a),-.37,2.13+.066*sin(a)) for a in [pi*.30+pi*1.4*i/42 for i in range(43)]],.012,silver,'Chest')

# Merge per material to keep the runtime draw calls practical; preserve vertex groups.
for mat in [velvet,lining,dark,silver,skin,maskmat,white,iris,pupil]:
 group=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.data.materials[0]==mat]
 bpy.ops.object.select_all(action='DESELECT')
 for o in group:o.select_set(True)
 if group:
  bpy.context.view_layer.objects.active=group[0];bpy.ops.object.join();group[0].name='Nyx '+mat.name

rig.animation_data_create();bpy.context.scene.render.fps=30
durations={'Idle':6,'Greeting':2.8,'Listening':4,'Thinking':4.8,'Shuffle':1.5,'Offer':2.4,'Drawing':.62,'Reveal':.7,'Speaking':4.2}
for name,duration in durations.items():
 action=bpy.data.actions.new(name);action.use_fake_user=True;rig.animation_data.action=action
 steps=24 if duration>=2 else 16
 for i in range(steps+1):
  t=i/steps;frame=1+round(t*duration*30);wave=sin(2*pi*t);pulse=sin(pi*t)**2
  for p in rig.pose.bones:p.rotation_mode='XYZ';p.rotation_euler=(0,0,0);p.location=(0,0,0);p.scale=(1,1,1)
  rig.pose.bones['Chest'].rotation_euler.x=.012*wave
  rig.pose.bones['Head'].rotation_euler.x=.035+.016*sin(2*pi*t)
  if name=='Idle':rig.pose.bones['Head'].rotation_euler.y=.035*sin(2*pi*t)
  if name=='Greeting':
   rig.pose.bones['Head'].rotation_euler.x=.10-.24*pulse;rig.pose.bones['Head'].rotation_euler.y=.07*pulse
   rig.pose.bones['Forearm.R'].rotation_euler.x=-.25*pulse;rig.pose.bones['Hand.R'].rotation_euler.y=.22*pulse
  if name=='Listening':
   rig.pose.bones['Chest'].rotation_euler.x=.04+.008*wave;rig.pose.bones['Head'].rotation_euler.z=.06+.02*wave;rig.pose.bones['Head'].rotation_euler.x=-.055+.02*wave
  if name=='Thinking':
   rig.pose.bones['Head'].rotation_euler.x=.15+.04*wave;rig.pose.bones['Head'].rotation_euler.y=-.12+.04*wave
   rig.pose.bones['Forearm.L'].rotation_euler.x=-.18*pulse
  if name=='Shuffle':
   for side,s in [('L',-1),('R',1)]:
    rig.pose.bones['Forearm.'+side].rotation_euler.x=-.16-.13*sin(2*pi*t+s*.7)
    rig.pose.bones['UpperArm.'+side].rotation_euler.z=s*.10
    rig.pose.bones['Hand.'+side].rotation_euler.y=s*.18*wave
  if name=='Offer':
   rig.pose.bones['Head'].rotation_euler.x=.14+.02*wave
   for side,s in [('L',-1),('R',1)]:rig.pose.bones['Hand.'+side].rotation_euler.y=s*(.12+.07*wave)
  if name in ['Drawing','Reveal']:
   rig.pose.bones['Forearm.R'].rotation_euler.x=-.27*pulse
   rig.pose.bones['Hand.R'].rotation_euler.y=(.48 if name=='Reveal' else .19)*pulse
   rig.pose.bones['UpperArm.R'].rotation_euler.z=-.12*pulse
   rig.pose.bones['Head'].rotation_euler.x=.035+.12*pulse
  if name=='Speaking':
   rig.pose.bones['Head'].rotation_euler.x=-.035+.045*sin(4*pi*t)
   rig.pose.bones['Head'].rotation_euler.y=.06*wave
   rig.pose.bones['Forearm.L'].rotation_euler.x=-.20*pulse;rig.pose.bones['Hand.L'].rotation_euler.y=-.30*pulse
   rig.pose.bones['Forearm.R'].rotation_euler.x=-.09*pulse
  for side in ['L','R']:
   for f in range(5):
    rig.pose.bones[f'Finger{f}B.{side}'].rotation_euler.x=.07+.035*sin(2*pi*t+f*.4)+( .2*pulse if name in ['Drawing','Shuffle'] else 0)
  for p in rig.pose.bones:p.keyframe_insert(data_path='rotation_euler',frame=frame,group=p.name)
 track=rig.animation_data.nla_tracks.new();track.name=name;track.strips.new(name,1,action);track.mute=True
rig.animation_data.action=None
for p in rig.pose.bones:p.rotation_euler=(0,0,0)
bpy.context.scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'witch-v2.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'witch-v2.glb'),export_format='GLB',export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_skins=True,export_def_bones=True,export_cameras=False,export_lights=False)
report={'version':'nyx-rigged-v2','bones':len(arm.bones),'actions':durations,'meshObjects':len([o for o in bpy.context.scene.objects if o.type=='MESH']),'vertices':sum(len(o.data.vertices) for o in bpy.context.scene.objects if o.type=='MESH'),'characterImagePlanes':0,'limitations':['procedural art, not a production sculpt','no cloth simulation','no phoneme lip sync','guiding gestures, not contact IK']}
with open(os.path.join(OUT,'witch-v2-manifest.json'),'w') as f:json.dump(report,f,indent=2)
print('NYX_V2_READY',json.dumps(report))
