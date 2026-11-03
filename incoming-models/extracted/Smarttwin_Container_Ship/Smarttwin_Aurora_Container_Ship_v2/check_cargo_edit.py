"""Verify all non-cargo geometry is unchanged and all carrier blocks are complete."""
from pathlib import Path
import struct,json,hashlib
from collections import Counter
P=Path(__file__).resolve().parent
baseline=P.parent/'container_ship'/'smarttwin_aurora_container_ship.glb'
def load(path):
 b=path.read_bytes();n=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+n]);return d,b[28+n:]
def data(d,b,i):
 a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];return b[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
def hashes(d,b):
 result={}
 for m in d['meshes']:
  if m['name'].startswith('cargo_bay_'):continue
  h=hashlib.sha256()
  for p in m['primitives']:
   h.update(str(p['material']).encode())
   for key in ['POSITION','NORMAL','TEXCOORD_0']:h.update(data(d,b,p['attributes'][key]))
   h.update(data(d,b,p['indices']))
  result[m['name']]=h.hexdigest()
 return result
new,nb=load(P/'smarttwin_aurora_container_ship.glb')
if baseline.exists():
 old,ob=load(baseline);a=hashes(old,ob);b=hashes(new,nb);assert a==b,'Non-cargo geometry differs'
 # Original hull/other materials and identity texture are preserved.
 for i in list(range(9))+[15,16,17,18]:assert old['materials'][i]==new['materials'][i]
 for d,buf in [(old,ob),(new,nb)]:
  v=d['bufferViews'][d['images'][0]['bufferView']]
  raw=buf[v['byteOffset']:v['byteOffset']+v['byteLength']]
  if d is old:old_logo=raw
  else:assert old_logo==raw
 noncargo='identical to previous GLB by SHA-256 of geometry attributes and indices'
else:noncargo='baseline not available; skipped'
layout=new['extras']['cargoGroups'];assert len(layout)==9
counts=Counter()
for entry in layout:
 counts[entry['carrier']]+=entry['containers']
assert set(counts)=={'ZIM','Maersk','Hapag-Lloyd','MSC','CMA CGM'};assert sum(counts.values())==332
# Each line occurs in a single continuous run of bays.
seq=[e['carrier'] for e in layout];runs=[]
for name in seq:
 if not runs or runs[-1]!=name:runs.append(name)
assert len(runs)==5 and len(set(runs))==5
for entry in layout:
 mesh=next(m for m in new['meshes'] if m['name']==entry['node'])
 cargo_materials=[p['material'] for p in mesh['primitives'] if 9<=p['material']<=13]
 assert len(cargo_materials)==1,'Mixed carrier bay'
r={'passed':True,'non_cargo_geometry':noncargo,'carrier_counts':dict(counts),'bow_to_stern':runs,'total_containers':sum(counts.values()),'continuous_blocks':True,'one_carrier_per_bay':True}
(P/'cargo_edit_validation.json').write_text(json.dumps(r,indent=2,ensure_ascii=False));print(json.dumps(r,ensure_ascii=False))
