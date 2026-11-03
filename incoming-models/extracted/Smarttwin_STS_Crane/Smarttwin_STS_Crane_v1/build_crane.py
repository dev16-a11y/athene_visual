"""Original procedural STS concept model. Units: metres. No external assets.
Run: python build_crane.py (requires numpy and Pillow).
Internal Z-up; exported glTF Y-up. This is a visual asset, not engineering CAD.
"""
import json, struct, math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
OUT=Path(__file__).resolve().parent
MATS=[('Ocean blue',(.025,.27,.46),.55,.36),('Edge blue',(.045,.43,.64),.45,.32),('Safety yellow',(.98,.64,.065),.35,.36),('Warm white',(.78,.83,.84),.3,.42),('Steel',(.17,.21,.24),.7,.32),('Rubber',(.035,.045,.05),0,.85),('Glazing',(.035,.15,.21),.5,.15),('Red',(.75,.11,.06),.25,.45)]
parts={}; cur='structure'
def add(v,f,mat):
    key=(cur,mat); a,b=parts.setdefault(key,([],[])); off=len(a);a.extend(np.asarray(v).tolist());b.extend((np.asarray(f)+off).tolist())
def beam(a,b,w,d=None,mat=0):
    a=np.array(a,float); b=np.array(b,float); z=b-a; z/=np.linalg.norm(z)
    ref=np.array([0,0,1.]) if abs(z[2])<.95 else np.array([0,1.,0])
    u=np.cross(z,ref);u/=np.linalg.norm(u);v=np.cross(z,u);d=w if d is None else d
    verts=[p+u*s*w/2+v*t*d/2 for p in [a,b] for s,t in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    faces=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]]
    add(verts,faces,mat)
def box(c,s,mat=0):
    x,y,z=c; sx,sy,sz=s;beam((x,y,z-sz/2),(x,y,z+sz/2),sx,sy,mat)
def tube(a,b,r,mat=4,n=8):
    a=np.array(a,float);b=np.array(b,float);z=b-a;z/=np.linalg.norm(z);ref=np.array([0,0,1.]) if abs(z[2])<.95 else np.array([0,1.,0]);u=np.cross(z,ref);u/=np.linalg.norm(u);v=np.cross(z,u)
    vs=[p+r*(u*math.cos(i*2*math.pi/n)+v*math.sin(i*2*math.pi/n)) for p in [a,b] for i in range(n)]
    fs=[]
    for i in range(n):
        j=(i+1)%n;fs.extend([[i,j,n+j],[i,n+j,n+i]])
    for i in range(1,n-1): fs.extend([[0,i+1,i],[n,n+i,n+i+1]])
    add(vs,fs,mat)
def rail(a,b):
    a=np.array(a,float);b=np.array(b,float);L=np.linalg.norm(b-a);N=max(1,int(L/2.2))
    for t in np.linspace(0,1,N+1):
        p=a+(b-a)*t; tube(p,p+[0,0,1.1],.035,2,6)
    tube(a+[0,0,1.1],b+[0,0,1.1],.035,2,6);tube(a+[0,0,.55],b+[0,0,.55],.025,2,6)
def walkway(x,y1,y2,z,width=.8):
    box((x,(y1+y2)/2,z),(width,y2-y1,.1),4)
    rail((x-width/2,y1,z),(x-width/2,y2,z));rail((x+width/2,y1,z),(x+width/2,y2,z))
# Bogie assemblies: 32 steel wheels, wheel axis Y, travel direction X.
cur='bogies'
for x in [-12,12]:
 for y in [-10,10]:
    box((x,y,2.25),(7.8,2.4,.85),0)
    for dy in [-2.7,-.9,.9,2.7]:
     for dx in [-.85,.85]:
      tube((x+dy,y+dx-.23,1.0),(x+dy,y+dx+.23,1.0),.92,4,12)
      tube((x+dy,y+dx-.25,1.0),(x+dy,y+dx+.25,1.0),.34,1,10)
    box((x,y,3.0),(2,2,.7),2)
# Legs, portal and crossbracing.
cur='portal'
for x in [-12,12]:
 for y in [-10,10]:
    beam((x,y,2.7),(x*.69,y*.8,30),1.35,1.6,0)
    box((x*.69,y*.8,29.8),(2.3,2.3,.45),1)
for y in [-8,8]:
    beam((-8.3,y,29.4),(8.3,y,29.4),2,2.5,0)
for x in [-8.3,8.3]:
    beam((x,-8,30),(x,8,30),1.3,1.5,0)
    beam((x,-8,30),(x,-6,43),1.2,1.5,0)
    beam((x,8,30),(x,6,43),1.2,1.5,0)
    beam((x,-8,30),(x,6,43),.35,.4,1)
    beam((x,8,30),(x,-6,43),.35,.4,1)
# Upper gantry deck and machinery house.
cur='machinery'
box((0,-8,42.7),(19,19,.65),0)
box((0,-11,46.3),(11,10,6.4),3)
box((0,-11,49.65),(11.6,10.6,.35),1)
for x in [-5.52,5.52]:
 for y in [-14,-11,-8]: box((x,y,46.3),(.05,1.5,1.3),6)
for y in [-15,-13,-11,-9,-7]:
    box((0,y,49.9),(7,.10,.1),4)
for x in [-9,9]:walkway(x,-17,1,43.15)
for x in [-7.5,7.5]:
    tube((x,-6,43),(x,-6,65),.48,0,10)
    beam((x,-6,65),(x,-18,43),.65,.8,0)
beam((-7.5,-6,65),(7.5,-6,65),.65,.8,0)
beam((-7.5,-6,59),(7.5,-6,65),.20,.25,1)
beam((7.5,-6,59),(-7.5,-6,65),.20,.25,1)
# Twin lattice main girders, outreach +52m and backreach -27m.
cur='boom_fixed'
for x in [-5.2,5.2]:
 for z in [41.4,44.8]:beam((x,-27,z),(x,52,z),.42,.55,0)
 for i,y in enumerate(np.arange(-27,52,4.94)):
    y2=min(y+4.94,52)
    beam((x,y,41.4),(x,y,44.8),.24,.3,1)
    beam((x,y,41.4 if i%2==0 else 44.8),(x,y2,44.8 if i%2==0 else 41.4),.23,.27,0)
for y in np.linspace(-27,52,17):
    beam((-5.2,y,41.4),(5.2,y,41.4),.28,.4,0)
for x in [-5.2,5.2]:
    tube((x,-27,42.1),(x,52,42.1),.07,4)
walkway(6.2,-26,51,45,width=.75)
cur='stays'
for x in [-5.2,5.2]:
 for yy in [25,49]:tube((x,-6,64.6),(x,yy,44.9),.095,4,8)
 tube((x,-6,64.6),(x,-26,45),.13,4,8)
# Trolley with cab, hoist drums, sheaves.
cur='trolley'
y=26
box((0,y,42.5),(10.7,5,.65),2)
for x in [-4.4,4.4]:
 for yy in [y-1.5,y+1.5]:tube((x-.22,yy,42),(x+.22,yy,42),.42,4,10)
for yy in [y-.9,y+.9]:tube((-2,yy,43.2),(2,yy,43.2),.6,4,12)
box((6.5,y,40),(2.1,3.5,3.4),2)
box((6.5,y+1.77,40.3),(1.75,.05,2.1),6)
box((7.57,y,40.3),(.05,2.8,2.1),6)
# 40ft lifting spreader suspended in empty pose.
cur='spreader'
for xx in [-1.1,1.1]:beam((xx,y-6.1,18),(xx,y+6.1,18),.36,.48,2)
for yy in [y-6.1,y-3,y+3,y+6.1]:beam((-1.3,yy,18),(1.3,yy,18),.4,.4,2)
for xx in [-1.1,1.1]:
 for yy in [y-5.8,y+5.8]:box((xx,yy,17.6),(.5,.65,.45),4)
box((0,y,18.7),(1.8,4,1),2)
cur='hoist_ropes'
for xx in [-1.5,-1.15,1.15,1.5]:
 for yy in [y-1.5,y+1.5]:tube((xx,yy,42),(xx*.7,y+(yy-y)*2,19.2),.028,4,6)
# Access stair flights with treads and rails on landward leg.
cur='access'
for level in range(7):
    z=3+level*5.65;x=-13.4
    ya,yb=(-10,-3) if level%2==0 else (-3,-10)
    for dx in [-.48,.48]:beam((x+dx,ya,z),(x+dx,yb,z+5.65),.12,.22,4)
    for t in np.linspace(0,1,20):
        yy=ya+(yb-ya)*t;zz=z+5.65*t;box((x,yy,zz),(.95,.38,.07),4)
    for dx in [-.52,.52]:rail((x+dx,ya,z),(x+dx,yb,z+5.65))
    box((x,yb,z+5.65),(1.5,1.4,.12),4)
# Small service details, vents and lights.
cur='details'
for yy in [-14,-11,-8]:
 for zz in np.linspace(44.3,46.3,7):box((0,yy,zz),(3,.12,.06),4)
for xx in [-9,9]:
 for yy in [-16,0]:box((xx,yy,43.3),(.35,.35,.4),2)
for yy in [-26,51]:box((6.2,yy,45.3),(.4,.6,.4),3)
# Export self-contained binary glTF, one node per movable assembly, material batching.
def glb():
    doc={'asset':{'version':'2.0','generator':'Smarttwin procedural STS asset v1'},'scene':0,'scenes':[{'nodes':[]}],'nodes':[],'meshes':[],'materials':[], 'buffers':[],'bufferViews':[],'accessors':[]}
    for name,col,metal,rough in MATS:doc['materials'].append({'name':name,'pbrMetallicRoughness':{'baseColorFactor':[*col,1],'metallicFactor':metal,'roughnessFactor':rough}})
    data=bytearray()
    def acc(arr,ctype,typ,target):
        while len(data)%4:data.append(0)
        off=len(data);data.extend(arr.tobytes());vi=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':arr.nbytes,'target':target})
        a={'bufferView':vi,'componentType':ctype,'count':len(arr),'type':typ}
        if typ=='VEC3':a.update(min=arr.min(0).tolist(),max=arr.max(0).tolist())
        ai=len(doc['accessors']);doc['accessors'].append(a);return ai
    triangles=0
    for name in dict.fromkeys(k[0] for k in parts):
        primitives=[]
        for (part,mat),(v,f) in parts.items():
            if part!=name:continue
            v=np.array(v,float);f=np.array(f,int);pts=v[f];n=np.cross(pts[:,1]-pts[:,0],pts[:,2]-pts[:,0]);lens=np.linalg.norm(n,axis=1);assert np.all(lens>1e-9);n/=lens[:,None]
            vv=pts.reshape(-1,3);nn=np.repeat(n,3,axis=0)
            # proper rotation (x,y,z) -> (x,z,-y)
            vv=vv[:,[0,2,1]];vv[:,2]*=-1;nn=nn[:,[0,2,1]];nn[:,2]*=-1
            primitives.append({'attributes':{'POSITION':acc(vv.astype('<f4'),5126,'VEC3',34962),'NORMAL':acc(nn.astype('<f4'),5126,'VEC3',34962)},'material':mat,'mode':4})
            triangles+=len(f)
        mi=len(doc['meshes']);doc['meshes'].append({'name':name,'primitives':primitives});ni=len(doc['nodes']);doc['nodes'].append({'name':name,'mesh':mi});doc['scenes'][0]['nodes'].append(ni)
    doc['extras']={'units':'metres','upAxis':'Y','seaDirection':'-Z','railTravelDirection':'X','type':'STS visual concept, not engineering design','trolleyTravel':'local Z; adjust hoist_ropes and spreader together','boom':'fixed working pose; no hinge rig'}
    doc['buffers']=[{'byteLength':len(data)}];js=json.dumps(doc,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
    data+=b'\0'*((-len(data))%4);total=12+8+len(js)+8+len(data)
    (OUT/'smarttwin_sts_crane.glb').write_bytes(struct.pack('<III',0x46546c67,2,total)+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(data),0x004e4942)+data)
    report={'triangles':triangles,'nodes':len(doc['nodes']),'materials':len(MATS),'bytes':total,'bounds_z_up':[np.concatenate([np.array(v) for v,f in parts.values()]).min(0).tolist(),np.concatenate([np.array(v) for v,f in parts.values()]).max(0).tolist()]}
    (OUT/'validation.json').write_text(json.dumps(report,indent=2));print(report)
# CPU triangle rasterization: actual asset geometry, no generated imagery.
def render(filename,eye):
    W,H=1600,1400;target=np.array([0,11,29.]);eye=np.array(eye,float);forward=target-eye;forward/=np.linalg.norm(forward);right=np.cross(forward,[0,0,1]);right/=np.linalg.norm(right);up=np.cross(right,forward)
    scale=13.4
    def project(v):
        v=np.asarray(v)-target;return np.stack([v@right*scale+W/2,-v@up*scale+H/2,v@forward],axis=-1)
    im=np.zeros((H,W,3),dtype=np.uint8);im[:]=[229,236,241];depth=np.full((H,W),np.inf)
    light=np.array([-.4,-.6,1.]);light/=np.linalg.norm(light)
    def tri(p,col):
        x0=max(0,int(np.floor(p[:,0].min())));x1=min(W-1,int(np.ceil(p[:,0].max())));y0=max(0,int(np.floor(p[:,1].min())));y1=min(H-1,int(np.ceil(p[:,1].max())))
        if x1<x0 or y1<y0:return
        a,b,c=p;den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        if abs(den)<1e-7:return
        xx,yy=np.meshgrid(np.arange(x0,x1+1)+.5,np.arange(y0,y1+1)+.5)
        u=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den;v=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den;w=1-u-v;z=u*a[2]+v*b[2]+w*c[2]
        mask=(u>=0)&(v>=0)&(w>=0)&(z<depth[y0:y1+1,x0:x1+1]);depth[y0:y1+1,x0:x1+1][mask]=z[mask];im[y0:y1+1,x0:x1+1][mask]=col
    # Ground and rail lines, preview only, excluded from GLB.
    g=project([[-45,-36,-.05],[45,-36,-.05],[45,65,-.05],[-45,65,-.05]])
    tri(g[[0,1,2]],[210,219,225]);tri(g[[0,2,3]],[210,219,225])
    for yy in [-10,10]:
        g=project([[-37,yy-.09,0],[37,yy-.09,0],[37,yy+.09,0],[-37,yy+.09,0]])
        tri(g[[0,1,2]],[105,124,137]);tri(g[[0,2,3]],[105,124,137])
    for (name,mat),(v,f) in parts.items():
        vv=np.array(v);ff=np.array(f);pv=project(vv);base=np.array(MATS[mat][1]);base=np.power(base,1/1.5)*255
        for ids in ff:
            a,b,c=vv[ids];n=np.cross(b-a,c-a);n/=np.linalg.norm(n);shade=.50+.5*max(0,np.dot(n,light));tri(pv[ids],np.clip(base*shade,0,255).astype(np.uint8))
    img=Image.fromarray(im);d=ImageDraw.Draw(img)
    try:font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',30);small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',18)
    except:font=small=None
    d.text((55,40),'SMARTTWIN  /  STS CONTAINER CRANE',fill='#153b50',font=font)
    d.text((57,86),'Original 3D asset  |  GLB  |  metres  |  working pose',fill='#526c7e',font=small)
    d.text((57,H-65),'Concept model v1 — visual asset, not an engineering design',fill='#526c7e',font=small)
    img.save(OUT/filename)
if __name__=='__main__':
    glb();render('crane_preview.png',(110,135,95));render('crane_reverse.png',(-115,-95,78))
