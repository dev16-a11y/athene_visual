from pathlib import Path
import json,struct
import numpy as np
P=Path(__file__).resolve().parent
reports=[]
for path in sorted(P.glob('*.glb')):
 b=path.read_bytes();magic,version,size=struct.unpack_from('<III',b);assert (magic,version,size)==(0x46546c67,2,len(b));n,k=struct.unpack_from('<II',b,12);assert k==0x4e4f534a;d=json.loads(b[20:20+n]);bn,bk=struct.unpack_from('<II',b,20+n);buf=b[28+n:];assert bk==0x004e4942 and bn==len(buf)
 for v in d['bufferViews']:assert v.get('byteOffset',0)+v['byteLength']<=len(buf)
 def read(i):
  a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];assert a['componentType']==5126;num={'VEC3':3,'VEC2':2}[a['type']];arr=np.frombuffer(buf,dtype='<f4',offset=v.get('byteOffset',0),count=a['count']*num).reshape(-1,num);assert np.isfinite(arr).all();return arr
 count=0
 for m in d['meshes']:
  for prim in m['primitives']:
   p=read(prim['attributes']['POSITION']);norm=read(prim['attributes']['NORMAL']);assert len(p)==len(norm) and len(p)%3==0;assert np.allclose(np.linalg.norm(norm,axis=1),1,atol=1e-5);pts=p.reshape(-1,3,3);area=np.cross(pts[:,1]-pts[:,0],pts[:,2]-pts[:,0]);assert (np.linalg.norm(area,axis=1)>1e-10).all();assert (np.sum(area*norm[::3],axis=1)>0).all()
   if 'TEXCOORD_0' in prim['attributes']:assert len(read(prim['attributes']['TEXCOORD_0']))==len(p)
   count+=len(pts)
 for im in d['images']:
  v=d['bufferViews'][im['bufferView']];assert buf[v['byteOffset']:v['byteOffset']+8]==b'\x89PNG\r\n\x1a\n'
 reports.append({'file':path.name,'passed':True,'triangles':count,'nodes':len(d['nodes']),'size_bytes':len(b),'checks':['GLB header','buffer bounds','finite geometry','normal lengths and orientation','nonzero triangle areas','UV counts','embedded PNG signature'],'not_tested':['Babylon.js runtime','Khronos validator','Blender import']})
(P/'glb_validation.json').write_text(json.dumps(reports,indent=2));print(json.dumps(reports))
