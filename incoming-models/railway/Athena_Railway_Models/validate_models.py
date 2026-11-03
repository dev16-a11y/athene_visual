from pathlib import Path
import struct,json
import numpy as np
P=Path(__file__).resolve().parent
results=[]
for path in sorted(P.glob('*.glb')):
 b=path.read_bytes();magic,version,size=struct.unpack_from('<III',b);assert (magic,version,size)==(0x46546c67,2,len(b));n,k=struct.unpack_from('<II',b,12);assert k==0x4e4f534a;d=json.loads(b[20:20+n]);bn,bk=struct.unpack_from('<II',b,20+n);buf=b[28+n:];assert bk==0x004e4942 and bn==len(buf)
 for v in d['bufferViews']:assert v.get('byteOffset',0)%4==0 and v.get('byteOffset',0)+v['byteLength']<=len(buf)
 def read(i):
  a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];num={'VEC3':3,'VEC2':2,'SCALAR':1}[a['type']];typ={5126:'<f4',5125:'<u4'}[a['componentType']];arr=np.frombuffer(buf,dtype=typ,offset=v.get('byteOffset',0),count=a['count']*num).reshape(-1,num);assert np.isfinite(arr).all();return arr
 triangles=0
 for mesh in d['meshes']:
  for prim in mesh['primitives']:
   p=read(prim['attributes']['POSITION']);nn=read(prim['attributes']['NORMAL']);idx=read(prim['indices']).reshape(-1,3);assert idx.max()<len(p) and len(p)==len(nn);assert np.allclose(np.linalg.norm(nn,axis=1),1,atol=2e-5)
   pts=p[idx];cr=np.cross(pts[:,1]-pts[:,0],pts[:,2]-pts[:,0]);assert (np.linalg.norm(cr,axis=1)>1e-10).all();assert (np.sum(cr*nn[idx].mean(1),axis=1)>-1e-7).all()
   if 'TEXCOORD_0' in prim['attributes']:assert len(read(prim['attributes']['TEXCOORD_0']))==len(p)
   assert prim['material']<len(d['materials']);triangles+=len(idx)
 for image in d.get('images',[]):
  v=d['bufferViews'][image['bufferView']];assert buf[v['byteOffset']:v['byteOffset']+8]==b'\x89PNG\r\n\x1a\n'
 assert d['extras']['project']=='Афина'
 assert d['extras']['trackGaugeMetres']==1.520
 assert np.isclose(d['extras']['couplers']['front'][2]-d['extras']['couplers']['rear'][2],d['extras']['couplerPitchMetres'])
 results.append({'file':path.name,'passed':True,'triangles':triangles,'bytes':len(b),'nodes':len(d['nodes']),'checked':['GLB headers','buffers','indices','finite geometry','unit normals','normal orientation','nondegenerate triangles','coupler metadata'],'not_tested':['Babylon.js runtime','Khronos validator','engineering accuracy']})
(P/'validation.json').write_text(json.dumps(results,indent=2,ensure_ascii=False));print(json.dumps(results,ensure_ascii=False))
