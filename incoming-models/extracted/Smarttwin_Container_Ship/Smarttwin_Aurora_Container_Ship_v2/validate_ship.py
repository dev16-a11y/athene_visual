"""Independent structural and geometry checks on the exported binary glTF."""
from pathlib import Path
import struct,json
import numpy as np
P=Path(__file__).resolve().parent
b=(P/'smarttwin_aurora_container_ship.glb').read_bytes();magic,version,size=struct.unpack_from('<III',b);assert (magic,version,size)==(0x46546c67,2,len(b));n,k=struct.unpack_from('<II',b,12);assert k==0x4e4f534a;d=json.loads(b[20:20+n]);bn,bk=struct.unpack_from('<II',b,20+n);buf=b[28+n:];assert bk==0x004e4942 and bn==len(buf)
for view in d['bufferViews']:
 assert view.get('byteOffset',0)%4==0
 assert view.get('byteOffset',0)+view['byteLength']<=len(buf)
def read(i):
 a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];num={'VEC3':3,'VEC2':2,'SCALAR':1}[a['type']];typ={5126:'<f4',5125:'<u4'}[a['componentType']];arr=np.frombuffer(buf,dtype=typ,offset=v.get('byteOffset',0),count=a['count']*num).reshape(-1,num);assert np.isfinite(arr).all();return arr
triangles=0
for mesh in d['meshes']:
 for prim in mesh['primitives']:
  p=read(prim['attributes']['POSITION']);norm=read(prim['attributes']['NORMAL']);uv=read(prim['attributes']['TEXCOORD_0']);idx=read(prim['indices']).reshape(-1,3)
  assert idx.max()<len(p) and len(p)==len(norm)==len(uv);assert np.allclose(np.linalg.norm(norm,axis=1),1,atol=2e-5)
  pts=p[idx];cross=np.cross(pts[:,1]-pts[:,0],pts[:,2]-pts[:,0]);assert (np.linalg.norm(cross,axis=1)>1e-10).all()
  assert (np.sum(cross*norm[idx].mean(1),axis=1)>-1e-6).all()
  assert prim['material']<len(d['materials']);triangles+=len(idx)
for image in d['images']:
 v=d['bufferViews'][image['bufferView']];assert buf[v['byteOffset']:v['byteOffset']+8]==b'\x89PNG\r\n\x1a\n'
report={'passed':True,'triangles':triangles,'nodes':len(d['nodes']),'materials':len(d['materials']),'bytes':len(b),'checks':['GLB headers and lengths','aligned buffer bounds','valid vertex indices','finite coordinates','unit vertex normals','non-degenerate triangles','normal orientation','UV counts','embedded PNGs'],'not_tested':['Khronos validator','Babylon.js runtime/performance','hydrostatics or engineering accuracy']}
(P/'glb_validation.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
