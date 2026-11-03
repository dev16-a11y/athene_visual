"""Render the actual exported GLB using Mitsuba 3. Optional: pip install mitsuba.
Offline studio lighting, not a promise of identical browser output.
"""
from pathlib import Path
import struct,json,os
import numpy as np
import mitsuba as mi
from PIL import Image,ImageDraw,ImageFont
P=Path(__file__).resolve().parent
mi.set_variant('llvm_ad_rgb')
import drjit as dr
dr.set_thread_count(8)
b=(P/'terberg_yt220.glb').read_bytes();n=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+n]);buf=b[28+n:]
cache=P/'render_cache';cache.mkdir(exist_ok=True)
def arr(i):
 a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];num={'VEC3':3,'VEC2':2}[a['type']];return np.frombuffer(buf,dtype='<f4',offset=v.get('byteOffset',0),count=a['count']*num).reshape(-1,num)
v=d['bufferViews'][d['images'][0]['bufferView']];tex=cache/'label.png';tex.write_bytes(buf[v['byteOffset']:v['byteOffset']+v['byteLength']])
T=mi.ScalarTransform4f
scene={'type':'scene','integrator':{'type':'path','max_depth':6,'hide_emitters':False},'env':{'type':'constant','radiance':{'type':'rgb','value':[.25,.27,.30]}},'sensor':{'type':'perspective','fov':33,'to_world':T.look_at(origin=[-8.2,5.6,9.6],target=[0,1.80,0],up=[0,1,0]),'sampler':{'type':'independent','sample_count':32},'film':{'type':'hdrfilm','width':1440,'height':1180,'rfilter':{'type':'tent'}}},'floor':{'type':'rectangle','to_world':T.rotate([1,0,0],-90).scale([60,60,60]),'bsdf':{'type':'diffuse','reflectance':{'type':'rgb','value':[.64,.68,.71]}}}}
for i,m in enumerate(d['materials']):
 p=m['pbrMetallicRoughness'];col=p.get('baseColorFactor',[1,1,1,1])[:3]
 base={'type':'rgb','value':col}
 if 'baseColorTexture' in p:base={'type':'bitmap','filename':str(tex),'filter_type':'bilinear'}
 scene['mat'+str(i)]={'type':'principled','base_color':base,'metallic':p.get('metallicFactor',0),'roughness':p.get('roughnessFactor',.4)}
for i,(origin,size,power) in enumerate([([-4,10,5],[3.5,3,1],5),([6,9,-3],[3,3,1],6),([-1,8,-5],[2,1.5,1],3)]):
 scene['softbox'+str(i)]={'type':'rectangle','to_world':T.look_at(origin=origin,target=[0,1.5,0],up=[0,1,0]).scale(size),'emitter':{'type':'area','radiance':{'type':'rgb','value':[power,power,power]}}}
counter=0
for mesh in d['meshes']:
 for primitive in mesh['primitives']:
  p=arr(primitive['attributes']['POSITION']);normal=arr(primitive['attributes']['NORMAL']);uv=arr(primitive['attributes']['TEXCOORD_0']) if 'TEXCOORD_0' in primitive['attributes'] else None
  obj=cache/(str(counter)+'.obj')
  with obj.open('w') as f:
   for v in p:f.write('v %.7f %.7f %.7f\n'%tuple(v))
   for v in normal:f.write('vn %.7f %.7f %.7f\n'%tuple(v))
   if uv is not None:
    for u,v in uv:f.write('vt %.7f %.7f\n'%(u,1-v))
   for a in range(0,len(p),3):
    ids=[a+1,a+2,a+3]
    if uv is None:f.write('f '+' '.join(f'{i}//{i}' for i in ids)+'\n')
    else:f.write('f '+' '.join(f'{i}/{i}/{i}' for i in ids)+'\n')
  scene['shape'+str(counter)]={'type':'obj','filename':str(obj),'face_normals':False,'bsdf':{'type':'ref','id':'mat'+str(primitive['material'])}}
  counter+=1
print('Scene ready',counter,flush=True)
s=mi.load_dict(scene);img=mi.render(s,spp=192,seed=17)
mi.util.write_bitmap(str(P/'terberg_yt220_studio.png'),img,write_async=False)
# Add a quiet title; the image is of the actual GLB geometry.
im=Image.open(P/'terberg_yt220_studio.png').convert('RGB');draw=ImageDraw.Draw(im);font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
draw.text((40,28),'TERBERG YT220  /  REFINED V2',font=ImageFont.truetype(font,28),fill='#183646')
draw.text((42,70),'Actual GLB geometry · rounded panels · studio lighting',font=ImageFont.truetype(font,16),fill='#526777')
im.save(P/'terberg_yt220_studio.png')
print('Studio render saved',flush=True)
