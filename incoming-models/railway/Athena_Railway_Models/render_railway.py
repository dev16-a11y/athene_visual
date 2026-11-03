"""Render actual exported GLBs via Mitsuba; no image synthesis.
python render_railway.py --kind diesel_shunter_6axle --spp 96
"""
import json,struct,argparse
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
import mitsuba as mi
mi.set_variant('llvm_ad_rgb')
import drjit as dr
dr.set_thread_count(6)
P=Path(__file__).resolve().parent
ap=argparse.ArgumentParser();ap.add_argument('--spp',type=int,default=96);ap.add_argument('--kind',default='diesel_shunter_6axle');ap.add_argument('--rear',action='store_true');args=ap.parse_args()
b=(P/(args.kind+'.glb')).read_bytes();n=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+n]);buf=b[28+n:];cache=P/'render_cache'/args.kind;cache.mkdir(exist_ok=True,parents=True)
def arr(i):
 a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];num={'VEC3':3,'VEC2':2,'SCALAR':1}[a['type']];typ={5126:'<f4',5125:'<u4'}[a['componentType']];return np.frombuffer(buf,dtype=typ,offset=v.get('byteOffset',0),count=a['count']*num).reshape(-1,num)
L=d['extras']['couplerPitchMetres'];T=mi.ScalarTransform4f
# Long objects need a shallow three-quarter viewpoint to show their full side.
origin=[-L*1.18,max(10,L*.75),L*1.18] if not args.rear else [L*1.18,max(10,L*.75),-L*1.18]
scene={'type':'scene','integrator':{'type':'path','max_depth':5,'hide_emitters':True},'env':{'type':'constant','radiance':{'type':'rgb','value':[.30,.34,.40]}},'sensor':{'type':'perspective','fov':34,'to_world':T.look_at(origin=origin,target=[0,2.1,0],up=[0,1,0]),'sampler':{'type':'independent','sample_count':args.spp},'film':{'type':'hdrfilm','width':1600,'height':1000,'rfilter':{'type':'tent'}}},'floor':{'type':'rectangle','to_world':T.translate([0,-.08,0]).rotate([1,0,0],-90).scale([400,400,400]),'bsdf':{'type':'diffuse','reflectance':{'type':'rgb','value':[.58,.63,.67]}}}}
for i,m in enumerate(d['materials']):
 p=m['pbrMetallicRoughness'];scene['mat'+str(i)]={'type':'principled','base_color':{'type':'rgb','value':p['baseColorFactor'][:3]},'metallic':p['metallicFactor'],'roughness':p['roughnessFactor']}
for i,(origin,size,power) in enumerate([([-L*.35,L*.75,L*.3],[L*.35,L*.35,1],5),([L*.45,L*.65,-L*.25],[L*.32,L*.32,1],6),([-L*.35,L*.5,-L*.45],[L*.25,L*.25,1],3)]):
 scene['softbox'+str(i)]={'type':'rectangle','to_world':T.look_at(origin=origin,target=[0,1.4,0],up=[0,1,0]).scale(size),'emitter':{'type':'area','radiance':{'type':'rgb','value':[power,power,power]}}}
counter=0
for mesh in d['meshes']:
 for primitive in mesh['primitives']:
  p=arr(primitive['attributes']['POSITION']);normal=arr(primitive['attributes']['NORMAL']);indices=arr(primitive['indices']).reshape(-1,3)
  obj=cache/(str(counter)+'.obj')
  with obj.open('w') as f:
   for v in p:f.write('v %.7f %.7f %.7f\n'%tuple(v))
   for v in normal:f.write('vn %.7f %.7f %.7f\n'%tuple(v))
   for tri in indices:f.write('f '+' '.join(f'{i+1}//{i+1}' for i in tri)+'\n')
  scene['shape'+str(counter)]={'type':'obj','filename':str(obj),'face_normals':False,'bsdf':{'type':'ref','id':'mat'+str(primitive['material'])}};counter+=1
# Preview track, not included in the vehicle GLB. Railhead z=.18 m in modelling coordinates.
def cube(name,c,s,color,metal=0):
 scene[name]={'type':'cube','to_world':T.translate(c).scale([v/2 for v in s]),'bsdf':{'type':'principled','base_color':{'type':'rgb','value':color},'metallic':metal,'roughness':.45}}
for j,z in enumerate(np.arange(-L/2-.7,L/2+.7,.65)):
 cube('sleeper'+str(j),[0,.005,z],[2.65,.13,.23],[.22,.25,.26])
 for s in [-1,1]:cube(f'chair{j}_{s}',[s*.790,.085,z],[.23,.04,.29],[.13,.16,.18],.7)
for s in [-1,1]:
 cube(f'rail_head{s}',[s*.790,.162,0],[.06,.036,L+2],[.48,.54,.58],.9)
 cube(f'rail_web{s}',[s*.790,.118,0],[.025,.075,L+2],[.21,.25,.28],.9)
print('Rendering',args.kind,counter,'primitives',flush=True)
scene=mi.load_dict(scene);img=mi.render(scene,spp=args.spp,seed=32)
filename=P/(args.kind+('_rear.png' if args.rear else '_studio.png'));mi.util.write_bitmap(str(filename),img,write_async=False)
im=Image.open(filename).convert('RGB');draw=ImageDraw.Draw(im);font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
draw.text((45,28),d['extras']['title'],font=ImageFont.truetype(font,30),fill='#193c4b');draw.text((47,75),'АФИНА  /  оригинальная визуальная модель',font=ImageFont.truetype(font,17),fill='#526a77');im.save(filename);print(filename.name,flush=True)
