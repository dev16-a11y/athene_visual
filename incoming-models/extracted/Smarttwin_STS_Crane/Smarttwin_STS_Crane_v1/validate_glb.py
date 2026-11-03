import json, struct
from pathlib import Path
import numpy as np
p=Path(__file__).resolve().parent
b=(p/'smarttwin_sts_crane.glb').read_bytes()
magic,version,size=struct.unpack_from('<III',b);assert magic==0x46546c67 and version==2 and size==len(b)
n,kind=struct.unpack_from('<II',b,12);assert kind==0x4e4f534a
d=json.loads(b[20:20+n]); off=20+n; bn,bkind=struct.unpack_from('<II',b,off);assert bkind==0x004e4942;buf=b[off+8:];assert bn==len(buf)
def read(ai):
 a=d['accessors'][ai];v=d['bufferViews'][a['bufferView']];start=v.get('byteOffset',0);assert start+v['byteLength']<=len(buf);assert a['componentType']==5126 and a['type']=='VEC3';arr=np.frombuffer(buf,dtype='<f4',count=a['count']*3,offset=start).reshape(-1,3);assert np.isfinite(arr).all();return arr
tri=0
for m in d['meshes']:
 for prim in m['primitives']:
  v=read(prim['attributes']['POSITION']);norm=read(prim['attributes']['NORMAL']);assert len(v)==len(norm) and len(v)%3==0;assert np.allclose(np.linalg.norm(norm,axis=1),1,atol=1e-5)
  t=v.reshape(-1,3,3);cross=np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]);assert (np.linalg.norm(cross,axis=1)>1e-8).all();assert (np.sum(cross*norm[::3],axis=1)>0).all();tri+=len(t)
r={'passed':True,'triangles':tri,'nodes':len(d['nodes']),'materials':len(d['materials']),'file_bytes':len(b),'checks':['GLB header and lengths','buffer bounds','finite coordinates','normal lengths and orientation','non-degenerate triangles'],'not_checked':['Khronos validator','Babylon.js runtime','Blender import']}
(p/'glb_check.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
