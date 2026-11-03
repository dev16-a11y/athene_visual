"""Афина: modern visual restyling of the three terminal-tractor assets.
Original concept styling, not factory CAD or manufacturer production designs.
Python 3, numpy, Pillow. Metres, GLB Y up / +Z forward.
"""
import math,json,struct,io
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
import geometry as g
P=Path(__file__).resolve().parent
CFG={
 'kalmar_ottawa_t2':dict(title='Kalmar Ottawa T2',body=(.79,.83,.80),accent=(.56,.035,.025),height=1.0,corner=.92,frame=1,rake=0.0,width=1.0),
 'terberg_yt193':dict(title='Terberg YT193',body=(.69,.79,.81),accent=(.015,.32,.35),height=.98,corner=1.12,frame=3,rake=.16,width=1.03),
 'terberg_yt220':dict(title='Terberg YT220',body=(.32,.025,.044),accent=(.62,.065,.045),height=1.07,corner=1.05,frame=3,rake=-.055,width=.98),
}
CONTROLS=np.array([
 [1.12,1.62,-2.13,-.10,.18],
 [1.32,1.72,-2.20,-.07,.23],
 [1.74,1.72,-2.17,-.08,.25],
 [2.24,1.70,-2.10,-.10,.26],
 [2.69,1.66,-2.00,-.14,.26],
 [2.89,1.60,-1.88,-.20,.27],
 [3.04,1.44,-1.70,-.34,.28],
 [3.11,1.18,-1.55,-.46,.26],
])
CFG_NOW=None

def palette(cfg):
 return [('Cab enamel',cfg['body'],.26,.25),('Accent enamel',cfg['accent'],.30,.27),('Graphite trim',(.028,.040,.048),.25,.38),('Satin alloy',(.30,.36,.38),.7,.34),('Rubber',(.018,.024,.029),0,.78),('Wheel gunmetal',(.22,.28,.31),.75,.25),('Glazing',(.025,.075,.105),.25,.12),('Safety amber',(.93,.42,.035),.15,.27),('LED white',(.86,.94,1),.05,.16),('Amber lens',(.95,.22,.01),.10,.24),('Red lens',(.65,.015,.025),.10,.22),('Intake black',(.015,.022,.029),.10,.5),('Bright trim',(.58,.66,.69),.75,.25),('Window mask',(.009,.017,.023),.10,.24)]

def height(z):return 1.12+(z-1.12)*CFG_NOW['height']
def dims(z):
 d=[np.interp(z,CONTROLS[:,0],CONTROLS[:,i]) for i in range(1,5)]
 d[0]*=CFG_NOW['width'];d[1]+=CFG_NOW['rake']*np.clip((z-1.12)/1.99,0,1);d[3]*=CFG_NOW['corner'];return d

def rounded_ring(cx,w,fy,by,r,n=10):
 pts=[]
 for x,y,a in [(cx-w/2+r,fy+r,180),(cx+w/2-r,fy+r,270),(cx+w/2-r,by-r,0),(cx-w/2+r,by-r,90)]:
  for t in np.linspace(a,a+90,n,endpoint=True):pts.append((x+r*math.cos(math.radians(t)),y+r*math.sin(math.radians(t))))
 return np.array(pts)

def loft_cabin():
 g.cur='cab_shell';zs=np.unique(np.r_[np.linspace(1.12,3.11,30),CONTROLS[:,0]]);v=[]
 for z in zs:
  w,fy,by,r=dims(z);v.extend([(x,y,height(z)) for x,y in rounded_ring(-.45,w,fy,by,r)])
 n=40;f=[]
 for j in range(len(zs)-1):
  for i in range(n):k=(i+1)%n;a=j*n+i;b=j*n+k;c=(j+1)*n+k;d=(j+1)*n+i;f.extend([[a,b,c],[a,c,d]])
 for i in range(1,n-1):f.extend([[0,i+1,i],[(len(zs)-1)*n,(len(zs)-1)*n+i,(len(zs)-1)*n+i+1]])
 g.add(v,f,0)

def window_path(side,z):
 w,fy,by,r=dims(z);cx=-.45;xl=cx-w/2;xr=cx+w/2
 if side=='front':
  a=[(xl+r+r*math.cos(math.radians(t)),fy+r+r*math.sin(math.radians(t))) for t in np.linspace(220,270,9)]
  a += [(x,fy) for x in np.linspace(xl+r,xr-r,12)[1:-1]]
  a += [(xr-r+r*math.cos(math.radians(t)),fy+r+r*math.sin(math.radians(t))) for t in np.linspace(270,320,9)]
 elif side=='left':
  a=[(xl+r+r*math.cos(math.radians(t)),fy+r+r*math.sin(math.radians(t))) for t in np.linspace(201,180,6)]
  a += [(xl,y) for y in np.linspace(fy+r,by-r,14)[1:-1]]
  a += [(xl+r+r*math.cos(math.radians(t)),by-r+r*math.sin(math.radians(t))) for t in np.linspace(180,151,6)]
 elif side=='right':
  a=[(xr-r+r*math.cos(math.radians(t)),fy+r+r*math.sin(math.radians(t))) for t in np.linspace(339,360,6)]
  a += [(xr,y) for y in np.linspace(fy+r,by-r,14)[1:-1]]
  a += [(xr-r+r*math.cos(math.radians(t)),by-r+r*math.sin(math.radians(t))) for t in np.linspace(0,29,6)]
 else:
  a=[(xl+r,by),(xr-r,by)]
 return np.array(a)

def glazed_patch(side,z0,z1,mat,inset=0,offset=.015):
 v=[];zs=np.linspace(z0,z1,17);n=None
 for z in zs:
  a=window_path(side,z)
  if inset:
   # Clip arc length at both ends while retaining the wraparound curvature.
   u=np.linspace(0,1,len(a));aa=np.linspace(inset,1-inset,len(a));a=np.array([np.interp(aa,u,a[:,i]) for i in [0,1]]).T
  off={'front':(0,-offset),'left':(-offset,0),'right':(offset,0),'rear':(0,offset)}[side]
  a+=off;n=len(a);v.extend([(x,y,height(z)) for x,y in a])
 f=[];expected={'front':np.array([0,-1,0]),'left':np.array([-1,0,0]),'right':np.array([1,0,0]),'rear':np.array([0,1,0])}[side]
 for j in range(len(zs)-1):
  for i in range(n-1):
   a=j*n+i;b=a+1;c=b+n;d=a+n;tri=[a,b,c]
   if np.dot(np.cross(np.array(v[b])-v[a],np.array(v[c])-v[a]),expected)<0:f.extend([[a,c,b],[a,d,c]])
   else:f.extend([[a,b,c],[a,c,d]])
 g.add(v,f,mat)

def body_arc(x,y,z,r1,r2,width,mat):
 n=80;q=n+1;ang=np.linspace(math.radians(9),math.radians(171),q);v=[]
 for xx,r in [(x-width/2,r1),(x+width/2,r1),(x-width/2,r2),(x+width/2,r2)]:v.extend([(xx,y+r*math.cos(t),z+r*math.sin(t)) for t in ang])
 v=np.array(v);f=[]
 def oriented(ids,expected):
  a,b,c=ids
  if np.dot(np.cross(v[b]-v[a],v[c]-v[a]),expected)<0:ids=[a,c,b]
  f.append(ids)
 for i in range(n):
  t=(ang[i]+ang[i+1])/2
  for aa,bb,expected in [(0,1,[0,-math.cos(t),-math.sin(t)]),(1,3,[1,0,0]),(3,2,[0,math.cos(t),math.sin(t)]),(2,0,[-1,0,0])]:
   a=aa*q+i;b=bb*q+i;oriented([a,a+1,b+1],expected);oriented([a,b+1,b],expected)
 for i,sign in [(0,-1),(n,1)]:
  a=[i,q+i,3*q+i,2*q+i];t=ang[i];expected=np.array([0,-math.sin(t),math.cos(t)])*sign
  oriented([a[0],a[1],a[2]],expected);oriented([a[0],a[2],a[3]],expected)
 g.add(v,f,mat)
def strip(a,b,r=.012,mat=12):g.tube(a,b,r,mat,10)

def make(kind):
 global CFG_NOW
 cfg=CFG[kind];CFG_NOW=cfg;g.parts={};g.decals=[];g.MATS=palette(cfg);front=-1.30;rear=1.48;back=2.40;frame=cfg['frame']
 g.cur='chassis'
 for x in [-.52,.52]:g.box((x,.18,.77),(.17,4.4,.24),frame)
 for y in [-1.8,-.7,.5,1.5,2.20]:g.box((0,y,.77),(1.14,.13,.21),3)
 for y in [front,rear]:
  g.tube((-1.03,y,.55),(1.03,y,.55),.08,3)
  g.tube((0,y-.14,.55),(0,y+.14,.55),.18,2)
  for x in [-.5,.5]:
   for z in [.63,.68,.73]:g.box((x,y,z),(.12,.74,.025),2)
 # Reuse detailed wheels but give them a more restrained rim finish.
 for yy,axle in [(front,'front'),(rear,'rear')]:
  for sign,side in [(-1,'left'),(1,'right')]:
   for j,x in enumerate([sign*1.05] if axle=='front' else [sign*.86,sign*1.21]):g.wheel(x,yy,.56,f'wheel_{axle}_{side}_{j}')
 g.cur='wheel_arches'
 for side in [-1,1]:
  body_arc(side*1.07,front,.56,.585,.655,.45,0)
  body_arc(side*1.08,rear,.56,.59,.66,.78,2)
  g.rounded_box((side*1.07,rear+.62,.39),(.70,.07,.55),.025,4,3)
 # Clean side pods hide the tanks and reduce visual clutter.
 g.cur='side_pods'
 for side in [-1,1]:
  g.rounded_box((side*1.0,.12,.70),(.55,1.15,.53),.12,2)
  g.rounded_box((side*1.286,.12,.94),(.032,.97,.055),.015,1,3)
  g.rounded_box((side*.94,.66,.96),(.50,.37,.065),.025,3,3)
 g.cur='rear_deck'
 g.rounded_box((0,.50,1.02),(2.06,1.13,.13),.05,3)
 for x in np.linspace(-.94,.94,22):g.beam((x,.05,1.09),(x,.85,1.09),.009,.009,12)
 loft_cabin()
 # Curved glazing is fitted to the body loft, with narrow black masks.
 g.cur='glazing_frames'
 for side in ['front','left','right','rear']:
  glazed_patch(side,1.71 if side!='rear' else 1.57,2.91,13,0,.017)
 g.cur='glazing'
 for side in ['front','left','right','rear']:
  glazed_patch(side,1.81 if side!='rear' else 1.68,2.82,6,.045,.024)
 # Fine vertical pillar and flush door handle instead of heavy external seams.
 g.cur='cab_trim'
 for side in [-1,1]:
  xx=-.45+side*.875
  strip((xx,-.22,height(1.35)),(xx,-.22,height(1.68)),.007,2)
  g.rounded_box((xx+side*.012,-.42,height(1.65)),(.026,.17,.035),.01,2,3)
 # A single slim wiper follows the front windscreen.
 g.cur='wiper'
 g.polyline([(-.70+.18*t,dims(1.83+.59*t)[1]-.045,height(1.83+.59*t)) for t in np.linspace(0,1,16)],.008,2)
 strip((-.73,dims(2.42)[1]-.045,height(2.42)),(-.22,dims(2.42)[1]-.045,height(2.42)),.009,2)
 # Low, smoothly integrated roof climate pod.
 g.cur='roof_details'
 g.rounded_box((-.45,-.96,height(3.13)),(.97,.70,.14),.06,2 if kind=='terberg_yt220' else 0)
 for x in np.linspace(-.80,-.12,8):g.rounded_box((x,-.96,height(3.21)),(.018,.42,.013),.004,2,2)
 g.tube((-.99,-.51,height(2.99)),(-.99,-.51,height(3.15)),.04,2)
 g.tube((-.99,-.51,height(3.15)),(-.99,-.51,height(3.27)),.061,9,20)
 # Compact mirrors, slim mounts; separate black housings with metallic glass.
 g.cur='mirrors'
 for xx,attach in [(-1.42,-1.22),(.51,.31)]:
  g.polyline([(attach,-1.89,height(2.61)),(xx,-1.99,height(2.68)),(xx,-2.04,height(2.53))],.014,2)
  g.rounded_box((xx,-2.04,height(2.49)),(.14,.095,.29),.04,2)
  g.rounded_box((xx,-1.984,height(2.49)),(.105,.015,.23),.006,5,3)
 # Low engine enclosure complements the cabin rather than competing with it.
 g.cur='engine_cover'
 g.rounded_box((.82,-1.17,1.36),(.85,1.93,.77),.18,0)
 g.rounded_box((.83,-.58,1.76),(.55,.46,.038),.015,11,3)
 for y in np.linspace(-.78,-.37,8):g.rounded_box((.83,y,1.785),(.48,.015,.014),.005,3,2)
 for y in np.linspace(-1.80,-.76,10):g.rounded_box((1.254,y,1.47),(.019,.035,.22),.008,11,3)
 g.rounded_box((1.27,-1.24,1.15),(.026,1.40,.055),.012,1,3)
 # Sculpted bumper with recessed light pockets and a narrow lower intake.
 g.cur='front_fascia'
 g.rounded_box((0,-2.23,.93),(2.58,.43,.43),.115,0)
 g.rounded_box((0,-2.258,.73),(2.30,.38,.12),.05,2)
 g.rounded_box((0,-2.455,.89),(.84,.04,.22),.016,11,3)
 for z in [.83,.89,.95]:g.rounded_box((0,-2.481,z),(.74,.017,.015),.006,3,2)
 for side in [-1,1]:
  g.rounded_box((side*.97,-2.451,1.0),(.42,.055,.16),.035,13)
  g.rounded_box((side*.97,-2.487,1.015),(.34,.018,.047),.014,8,4)
  if kind=='terberg_yt193':g.rounded_box((side*1.16,-2.48,.97),(.038,.02,.11),.01,8,3)
  else:g.rounded_box((side*1.16,-2.48,1.015),(.032,.02,.045),.01,9,3)
  g.rounded_box((side*.95,-2.466,.80),(.38,.018,.023),.008,1,3)
 # Tail and lowered coupling form a tidy functional rear.
 g.cur='rear_fascia'
 g.rounded_box((0,back,.82),(2.45,.22,.31),.075,2)
 for side in [-1,1]:
  g.rounded_box((side*.92,back+.12,.86),(.42,.026,.065),.025,10)
  g.rounded_box((side*1.14,back+.12,.86),(.07,.026,.065),.02,9,3)
 g.cur='coupling_lift'
 for x in [-.41,.41]:
  g.beam((x,.56,.91),(x,1.56,1.15),.13,.16,3)
  g.tube((x,.72,.76),(x,1.17,1.10),.065,3)
  g.tube((x,.97,.94),(x,1.30,1.20),.034,12)
 g.rounded_box((0,1.49,1.14),(.95,1.0,.10),.035,3)
 g.cur='fifth_wheel'
 cy=1.55;N=64;q=N+1;ang=np.linspace(-math.pi+.25,math.pi-.25,N+1);v=[]
 for z in [1.19,1.27]:
  for r in [.09,.66]:v.extend([(r*math.sin(t),cy-r*math.cos(t),z) for t in ang])
 v=np.array(v);f=[]
 def oriented(ids,expected):
  a,b,c=ids
  if np.dot(np.cross(v[b]-v[a],v[c]-v[a]),expected)<0:ids=[a,c,b]
  f.append(ids)
 for i in range(N):
  t=(ang[i]+ang[i+1])/2;rad=np.array([math.sin(t),-math.cos(t),0])
  for aa,bb,expected in [(0,1,[0,0,-1]),(1,3,rad),(3,2,[0,0,1]),(2,0,-rad)]:
   a=aa*q+i;b=bb*q+i;oriented([a,a+1,b+1],expected);oriented([a,b+1,b],expected)
 for i,sign in [(0,-1),(N,1)]:
  a=[i,q+i,3*q+i,2*q+i];expected=np.array([math.cos(ang[i]),math.sin(ang[i]),0])*sign
  oriented([a[0],a[1],a[2]],expected);oriented([a[0],a[2],a[3]],expected)
 g.add(v,f,3)
 for r in [.39,.57]:g.polyline([(r*math.sin(t),cy-r*math.cos(t),1.275) for t in np.linspace(-math.pi+.36,math.pi-.36,56)],.005,2)
 # Compact protected access, concealed exhaust, neatly routed air lines.
 g.cur='access'
 for z,y in [(.37,.18),(.65,.08),(.94,-.02)]:
  g.rounded_box((-.43,y,z),(.95,.34,.065),.025,2,3)
  for x in np.linspace(-.84,-.04,14):g.box((x,y,z+.039),(.013,.26,.010),3)
 for x in [-1.0,.20]:g.polyline([(x,.14,.45),(x,.14,1.69),(x,-.10,1.78)],.02,2)
 g.cur='rear_services'
 g.rounded_box((.40,.02,2.05),(.22,.25,1.29),.085,2)
 g.rounded_box((-.42,.03,1.58),(.63,.10,.27),.03,2)
 for x,mat in [(-.61,10),(-.29,7)]:
  pts=[(x+.043*math.cos(t*16*math.pi),.14+.043*math.sin(t*16*math.pi),1.29+t*.41) for t in np.linspace(0,1,90)]
  g.polyline(pts,.008,mat)
 # Discreet identification on the lower cab front; no invented vehicle names.
 g.cur='identification'
 verts=[]
 for dx,z in [(-.50,1.44),(.50,1.44),(.50,1.62),(-.50,1.62)]:verts.append((-.45+dx,dims(z)[1]-.045,height(z)))
 g.decals.append((g.cur,np.array(verts),'label'))
 return cfg

def label_image(kind):
 cfg=CFG[kind];im=Image.new('RGBA',(1024,192),(0,0,0,0));d=ImageDraw.Draw(im);f='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';color=(25,42,50,255) if kind!='terberg_yt220' else (231,239,240,255)
 word='KALMAR' if kind.startswith('kalmar') else 'TERBERG';font=ImageFont.truetype(f,106);bb=d.textbbox((0,0),word,font=font);d.text(((1024-(bb[2]-bb[0]))/2,-8),word,font=font,fill=color)
 small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',38);text=cfg['title'];bb=d.textbbox((0,0),text,font=small);d.text(((1024-(bb[2]-bb[0]))/2,129),text,font=small,fill=color);return im

# Export indexed binary glTF; all resources embedded.
def export(kind):
 cfg=CFG[kind];doc={'asset':{'version':'2.0','generator':'Афина — terminal tractor visual restyling'},'scene':0,'scenes':[{'nodes':[]}],'nodes':[],'meshes':[],'materials':[],'buffers':[],'bufferViews':[],'accessors':[]};data=bytearray()
 def view(raw,target=None):
  while len(data)%4:data.append(0)
  o={'buffer':0,'byteOffset':len(data),'byteLength':len(raw)}
  if target:o['target']=target
  data.extend(raw);i=len(doc['bufferViews']);doc['bufferViews'].append(o);return i
 def acc(a,typ,ct=5126,target=34962):
  a=np.asarray(a,dtype='<f4' if ct==5126 else '<u4');v=view(a.tobytes(),target);o={'bufferView':v,'componentType':ct,'count':len(a),'type':typ}
  if typ=='VEC3':o.update(min=a.min(0).tolist(),max=a.max(0).tolist())
  i=len(doc['accessors']);doc['accessors'].append(o);return i
 for i,(name,col,metal,rough) in enumerate(g.MATS):
  mat={'name':name,'pbrMetallicRoughness':{'baseColorFactor':[*col,1],'metallicFactor':metal,'roughnessFactor':rough}}
  if i==8:mat['emissiveFactor']=[.75,.85,1.0]
  doc['materials'].append(mat)
 labelmat=len(doc['materials']);doc['materials'].append({'name':'Typeset vehicle identification','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':.5},'alphaMode':'MASK','alphaCutoff':.4,'doubleSided':True})
 triangles=0;vertices=0
 def primitive(v,f,mat,uv=None):
  nonlocal triangles,vertices
  v=np.array(v,float);f=np.array(f,int);pts=v[f];cr=np.cross(pts[:,1]-pts[:,0],pts[:,2]-pts[:,0]);length=np.linalg.norm(cr,axis=1);ok=length>1e-10
  if not ok.all():f=f[ok];pts=v[f];cr=cr[ok];length=length[ok]
  n=g.smooth_normals(v,f).reshape(-1,3,3);bad=np.sum(cr*n.mean(1),axis=1)<=0;n[bad]=cr[bad,None,:]/length[bad,None,None]
  p=pts.reshape(-1,3);n=n.reshape(-1,3);p=p[:,[0,2,1]].copy();p[:,2]*=-1;n=n[:,[0,2,1]].copy();n[:,2]*=-1
  uv=np.array(uv)[f].reshape(-1,2) if uv is not None else np.zeros((len(p),2));a=np.c_[p,n,uv].astype('<f4');a,idx=np.unique(a,axis=0,return_inverse=True);vertices+=len(a);triangles+=len(idx)//3
  attrs={'POSITION':acc(a[:,:3],'VEC3'),'NORMAL':acc(a[:,3:6],'VEC3')}
  if mat==labelmat:attrs['TEXCOORD_0']=acc(a[:,6:],'VEC2')
  return {'attributes':attrs,'indices':acc(idx,'SCALAR',5125,34963),'material':mat,'mode':4}
 for name in dict.fromkeys([k[0] for k in g.parts]+[d[0] for d in g.decals]):
  pp=[]
  for (part,mat),(v,f) in g.parts.items():
   if name==part:pp.append(primitive(v,f,mat))
  for part,v,label in g.decals:
   if name==part:pp.append(primitive(v,[[0,1,2],[0,2,3]],labelmat,[[0,1],[1,1],[1,0],[0,0]]))
  mi=len(doc['meshes']);doc['meshes'].append({'name':name,'primitives':pp});ni=len(doc['nodes']);doc['nodes'].append({'name':name,'mesh':mi});doc['scenes'][0]['nodes'].append(ni)
 img=label_image(kind);bio=io.BytesIO();img.save(bio,format='PNG');doc['images']=[{'bufferView':view(bio.getvalue()),'mimeType':'image/png'}];doc['samplers']=[{'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071}];doc['textures']=[{'source':0,'sampler':0}]
 doc['extras']={'project':'Афина','referenceVehicle':cfg['title'],'designStatus':'original visual restyling, not a manufacturer production model','units':'metres','up':'Y','forward':'+Z','animation':'no clips, common-origin meshes; set pivots before rotating wheels'}
 doc['buffers']=[{'byteLength':len(data)}];js=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();js+=b' '*((-len(js))%4);data+=b'\0'*((-len(data))%4);size=12+8+len(js)+8+len(data)
 file=P/(kind+'.glb');file.write_bytes(struct.pack('<III',0x46546c67,2,size)+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(data),0x004e4942)+data)
 allv=np.concatenate([np.array(v) for v,f in g.parts.values()]);stats={'file':file.name,'reference':cfg['title'],'triangles':triangles,'indexed_vertices':vertices,'nodes':len(doc['nodes']),'bytes':size,'dimensions_internal_xyz':(allv.max(0)-allv.min(0)).tolist()};print(stats,flush=True);return stats
if __name__=='__main__':
 stats=[]
 for kind in CFG:make(kind);stats.append(export(kind))
 (P/'model_statistics.json').write_text(json.dumps(stats,indent=2))
