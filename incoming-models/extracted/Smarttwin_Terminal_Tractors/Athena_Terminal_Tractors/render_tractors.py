"""Offline render of the actual GLB. Requires mitsuba, numpy, Pillow.
No image synthesis; geometry, normals and embedded textures read from the GLB.
"""
import json,struct,argparse
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
import mitsuba as mi
mi.set_variant('llvm_ad_rgb')
import drjit as dr
dr.set_thread_count(8)
P=Path(__file__).resolve().parent
ap=argparse.ArgumentParser();ap.add_argument('--spp',type=int,default=128);ap.add_argument('--rear',action='store_true');ap.add_argument('--kind',default='terberg_yt193');args=ap.parse_args()
b=(P/(args.kind+'.glb')).read_bytes();n=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+n]);buf=b[28+n:];cache=P/'render_cache';cache.mkdir(exist_ok=True)
def arr(i):
 a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];num={'VEC3':3,'VEC2':2,'SCALAR':1}[a['type']];typ={5126:'<f4',5125:'<u4'}[a['componentType']];return np.frombuffer(buf,dtype=typ,offset=v.get('byteOffset',0),count=a['count']*num).reshape(-1,num)
images=[]
for i,image in enumerate(d['images']):
 v=d['bufferViews'][image['bufferView']];p=cache/f'tex_{i}.png';p.write_bytes(buf[v['byteOffset']:v['byteOffset']+v['byteLength']]);images.append(p)
Image.open(images[0]).getchannel('A').save(cache/'alpha.png')
T=mi.ScalarTransform4f
origin=[-7.6,5.50,9.25] if not args.rear else [7.5,5.2,-8.8]
scene={'type':'scene','integrator':{'type':'path','max_depth':5,'hide_emitters':True},'env':{'type':'constant','radiance':{'type':'rgb','value':[.30,.34,.40]}},'sensor':{'type':'perspective','fov':34,'to_world':T.look_at(origin=origin,target=[0,1.55,0],up=[0,1,0]),'sampler':{'type':'independent','sample_count':args.spp},'film':{'type':'hdrfilm','width':1440,'height':1100,'rfilter':{'type':'tent'}}},'floor':{'type':'rectangle','to_world':T.translate([0,0,0]).rotate([1,0,0],-90).scale([300,300,300]),'bsdf':{'type':'diffuse','reflectance':{'type':'rgb','value':[.58,.63,.67]}}}}
for i,m in enumerate(d['materials']):
 p=m['pbrMetallicRoughness'];col=p.get('baseColorFactor',[1,1,1,1])[:3];base={'type':'rgb','value':col}
 if 'baseColorTexture' in p:
  ti=p['baseColorTexture']['index'];source=d['textures'][ti]['source'];base={'type':'bitmap','filename':str(images[source]),'filter_type':'bilinear'}
 bs={'type':'principled','base_color':base,'metallic':p.get('metallicFactor',0),'roughness':p.get('roughnessFactor',.4)}
 if 'normalTexture' in m:bs={'type':'normalmap','normalmap':{'type':'bitmap','filename':str(cache/'normal_scaled.png'),'raw':True},'bsdf':bs}
 if m.get('doubleSided'):bs={'type':'twosided','bsdf':bs}
 if m.get('alphaMode')=='MASK':bs={'type':'mask','opacity':{'type':'bitmap','filename':str(cache/'alpha.png'),'raw':True},'bsdf':bs}
 scene['mat'+str(i)]=bs
for i,(origin,size,power) in enumerate([([-4,9,5],[3.5,3,1],4),([5,8,-3],[3,3,1],5),([-2,6,-4],[2,1.5,1],2)]):
 scene['softbox'+str(i)]={'type':'rectangle','to_world':T.look_at(origin=origin,target=[0,1.4,0],up=[0,1,0]).scale(size),'emitter':{'type':'area','radiance':{'type':'rgb','value':[power,power,power]}}}
counter=0
for mesh in d['meshes']:
 for primitive in mesh['primitives']:
  p=arr(primitive['attributes']['POSITION']);normal=arr(primitive['attributes']['NORMAL']);uv=arr(primitive['attributes']['TEXCOORD_0']) if 'TEXCOORD_0' in primitive['attributes'] else np.zeros((len(p),2));indices=arr(primitive['indices']).reshape(-1,3)
  obj=cache/(str(counter)+'.obj')
  with obj.open('w') as f:
   for v in p:f.write('v %.7f %.7f %.7f\n'%tuple(v))
   for v in normal:f.write('vn %.7f %.7f %.7f\n'%tuple(v))
   for u,v in uv:f.write('vt %.7f %.7f\n'%(u,1-v))
   for tri in indices:f.write('f '+' '.join(f'{i+1}/{i+1}/{i+1}' for i in tri)+'\n')
  scene['shape'+str(counter)]={'type':'obj','filename':str(obj),'face_normals':False,'bsdf':{'type':'ref','id':'mat'+str(primitive['material'])}};counter+=1
print('Rendering',counter,'primitives',flush=True)
s=mi.load_dict(scene);img=mi.render(s,spp=args.spp,seed=32)
filename=P/(args.kind+('_rear.png' if args.rear else '_studio.png'));mi.util.write_bitmap(str(filename),img,write_async=False)
im=Image.open(filename).convert('RGB');draw=ImageDraw.Draw(im);font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
titles={'kalmar_ottawa_t2':'KALMAR OTTAWA T2','terberg_yt193':'TERBERG YT193','terberg_yt220':'TERBERG YT220'}
draw.text((45,30),titles[args.kind],font=ImageFont.truetype(font,31),fill='#193c4b');draw.text((47,77),'Современная стилизация для проекта «Афина»',font=ImageFont.truetype(font,17),fill='#526a77');im.save(filename);print(filename.name,flush=True)
